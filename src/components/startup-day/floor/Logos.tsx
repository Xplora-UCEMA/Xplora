/**
 * Logos de las startups sobre sus stands, sólo mientras la sala está señalada.
 *
 * A la distancia de cámara por defecto una mesa mide ~33 px en pantalla, así que un logo
 * apoyado en el tablón es ilegible y treinta y ocho logos a la vez son ruido. Por eso
 * aparecen de a una sala: cuando el puntero entra a una sala —en el 3D o en la lista de
 * referencia al costado— salen las insignias de esa sala y nada más.
 *
 * Las insignias van **sin test de profundidad** y orientadas a la cámara: no las tapa un
 * muro ni el bloque de los baños, y se leen igual desde cualquier ángulo permitido. Es la
 * única parte del render que rompe la regla de "sin colores de identidad": son literalmente
 * las marcas, y duran lo que dura el hover.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MESA_M } from '../../../data/startupDayFloor';
import { standsDeSala, type MarcaDeStand, type StandConMarca } from '../../../data/startupDayStands';

/** Alto de la insignia en metros. Se lee de corrido al acercar el zoom (mínimo 20 m). */
const ALTO_M = 0.66;
/**
 * Alturas a las que flota la insignia sobre el tablón, rotando por stand.
 *
 * Con las siete de una sala a la misma altura se pisan: L mide 5,5 × 5,8 m y proyecta ~130 px
 * a la distancia de cámara por defecto, así que siete placas seguidas se superponen. Alternar
 * tres alturas las separa en pantalla sin moverlas de su mesa, y el pie fino que baja hasta el
 * tablón mantiene claro de cuál cuelga cada una.
 */
const VUELOS_M = [0.18, 0.68, 1.18];

type Insignia = { tex: THREE.CanvasTexture; aspecto: number };

/* --- Dibujo de la placa ---------------------------------------------------------------- */

const PLACA_ALTO_PX = 192;
const PAD_X = 26;
const PAD_Y = 30;
/** Tope de proporción: sin él un wordmark largo tapa media sala. */
const ASPECTO_MAX = 2.6;

function redondeado(x: CanvasRenderingContext2D, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(r, 0);
  x.lineTo(w - r, 0);
  x.quadraticCurveTo(w, 0, w, r);
  x.lineTo(w, h - r);
  x.quadraticCurveTo(w, h, w - r, h);
  x.lineTo(r, h);
  x.quadraticCurveTo(0, h, 0, h - r);
  x.lineTo(0, r);
  x.quadraticCurveTo(0, 0, r, 0);
  x.closePath();
}

/**
 * Aplana el logo a blanco conservando el alfa — el mismo `brightness(0) invert(1)` que usan
 * las cards de la agenda, pero en canvas. Es lo que hace que un wordmark negro, uno de color
 * y uno que ya vino en blanco se vean todos igual sobre la placa oscura.
 */
function aBlanco(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const x = c.getContext('2d');
  if (x) {
    x.drawImage(img, 0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

/**
 * Cómo dibujar un logo, decidido mirando el archivo y no una lista a mano.
 *
 * Son tres casos y cada uno rompe con el tratamiento de los otros dos:
 * - **`fondo`** — casi todos los píxeles opacos: el archivo trae fondo propio. Aplanarlo a
 *   blanco lo convertiría en un cuadrado blanco (le pasaba a `resender.png`), así que va en
 *   su color sobre placa clara.
 * - **`aplanar`** — el logo es oscuro: sobre la placa oscura no se vería, hay que blanquearlo.
 * - **`tal cual`** — el logo ya viene claro. Blanquearlo le sacaría el detalle interno, que
 *   es lo que perdía `datricas.png`: su círculo bitono se aplastaba a un óvalo blanco.
 */
type Trato = 'fondo' | 'aplanar' | 'tal cual';

function tratoDe(img: HTMLImageElement): Trato {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 48;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (!x) return 'aplanar';
  x.drawImage(img, 0, 0, 48, 48);
  try {
    const { data } = x.getImageData(0, 0, 48, 48);
    let opacos = 0;
    let luz = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! <= 200) continue;
      opacos++;
      luz += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    }
    if (opacos / (48 * 48) > 0.9) return 'fondo';
    if (opacos === 0) return 'aplanar';
    return luz / opacos >= 140 ? 'tal cual' : 'aplanar';
  } catch {
    /* Un canvas contaminado no debería pasar —los logos son del propio origen— pero si pasa,
       aplanar es lo que sirve para la mayoría. */
    return 'aplanar';
  }
}

function dibujarInsignia(img: HTMLImageElement): Insignia | null {
  const aspectoLogo = img.naturalWidth / img.naturalHeight;
  if (!Number.isFinite(aspectoLogo) || aspectoLogo <= 0) return null;

  const H = PLACA_ALTO_PX;
  let hLogo = H - PAD_Y * 2;
  let wLogo = hLogo * aspectoLogo;
  const wMax = H * ASPECTO_MAX - PAD_X * 2;
  if (wLogo > wMax) {
    wLogo = wMax;
    hLogo = wLogo / aspectoLogo;
  }
  const W = Math.round(Math.max(H, wLogo + PAD_X * 2));

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (!x) return null;

  const trato = tratoDe(img);
  const claro = trato === 'fondo';
  redondeado(x, W, H, 26);
  x.fillStyle = claro ? '#f6f2ea' : 'rgba(11,7,18,0.94)';
  x.fill();
  x.lineWidth = 4;
  x.strokeStyle = claro ? 'rgba(20,12,34,0.16)' : 'rgba(96,62,249,0.55)';
  x.stroke();

  const dx = (W - wLogo) / 2;
  const dy = (H - hLogo) / 2;
  if (trato === 'aplanar') x.drawImage(aBlanco(img, wLogo * 2, hLogo * 2), dx, dy, wLogo, hLogo);
  else x.drawImage(img, dx, dy, wLogo, hLogo);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspecto: W / H };
}

/**
 * Una insignia por marca, no por stand: la misma marca en dos mesas comparte textura. Se
 * cachea a nivel módulo y no se libera — son unas decenas de canvas chicos y el chunk de la
 * escena vive lo que vive la página.
 */
const cache = new Map<string, Promise<Insignia | null>>();

function cargarInsignia(marca: MarcaDeStand): Promise<Insignia | null> {
  const hecha = cache.get(marca.id);
  if (hecha) return hecha;
  const pedido = new Promise<Insignia | null>((listo) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => listo(dibujarInsignia(img));
    /* Un logo que no baja no rompe el render: esa mesa se queda sin insignia. */
    img.onerror = () => listo(null);
    img.src = marca.logoUrl;
  });
  cache.set(marca.id, pedido);
  return pedido;
}

/* --- Render ---------------------------------------------------------------------------- */

function Placa({ stand, orden }: { stand: StandConMarca; orden: number }) {
  const [insignia, setInsignia] = useState<Insignia | null>(null);
  const ref = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);

  useEffect(() => {
    let vivo = true;
    cargarInsignia(stand.marca).then((i) => {
      if (vivo) setInsignia(i);
    });
    return () => {
      vivo = false;
    };
  }, [stand.marca]);

  useFrame((estado, dt) => {
    const malla = ref.current;
    if (malla) malla.quaternion.copy(estado.camera.quaternion);
    const mat = material.current;
    /* Entrada corta: sin ella las insignias aparecen de golpe al rozar la sala. */
    if (mat && mat.opacity < 1) mat.opacity = Math.min(1, mat.opacity + dt * 6);
  });

  if (!insignia) return null;

  const vuelo = VUELOS_M[orden % VUELOS_M.length]!;

  return (
    <group position={[stand.x, 0, stand.z]}>
      {/* Pie: del tablón a la placa, para que la altura escalonada no la despegue de su mesa. */}
      <mesh position={[0, MESA_M.alto + vuelo / 2, 0]} renderOrder={5}>
        <boxGeometry args={[0.022, vuelo, 0.022]} />
        <meshBasicMaterial
          color="#b9a8ff"
          transparent
          opacity={0.55}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={ref} position={[0, MESA_M.alto + vuelo + ALTO_M / 2, 0]} renderOrder={6}>
        <planeGeometry args={[ALTO_M * insignia.aspecto, ALTO_M]} />
        <meshBasicMaterial
          ref={material}
          map={insignia.tex}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function Logos({ activa }: { activa: string | null }) {
  const stands = useMemo(() => (activa ? standsDeSala(activa) : []), [activa]);
  if (stands.length === 0) return null;
  return (
    <group>
      {stands.map((s, i) => (
        <Placa key={s.id} stand={s} orden={i} />
      ))}
    </group>
  );
}
