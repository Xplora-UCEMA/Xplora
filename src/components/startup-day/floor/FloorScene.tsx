/**
 * Escena 3D del 2º piso: maqueta abierta con materiales reales.
 *
 * Se carga como chunk aparte (`three` pesa más que toda la landing junta), así que este
 * módulo nunca se importa directo: entra por el `React.lazy` de `StartupDayFloor.tsx`.
 *
 * Decisiones de armado:
 * - Muros de altura completa y **sin cielorraso**: con la cámara en ángulo desde arriba se
 *   ve adentro de cada sala, como una maqueta abierta.
 * - **Sin colores de identidad en el 3D.** Los materiales son los del lugar real; qué se
 *   hace en cada sala lo dice la referencia HTML al costado del canvas.
 * - Las luces cálidas a la altura del cielorraso reemplazan a los paneles de las fotos,
 *   que no se pueden modelar sin tapar la vista desde arriba.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  ALTURA_M,
  HUELLA_M,
  SALAS,
  SALAS_ABIERTAS,
  MESA_M,
  ZONAS_HALL,
  bloqueDeSala,
  losasDePiso,
  rectDeSala,
  rectEnfocable,
  standsDelPiso,
  type RectM,
} from '../../../data/startupDayFloor';
import { crearEntorno, crearTexturaPiso } from './materiales';
import { Mobiliario } from './Mobiliario';
import { Volumenes } from './Muros';
import { Etiquetas } from './Etiquetas';
import { Logos } from './Logos';

/**
 * Los tramos de pasillo no se señalan con un rectángulo sino mesa por mesa.
 *
 * Un tramo no es un espacio con forma: es un conjunto de mesas contra una pared. Su caja
 * envolvente es un rectángulo y el pasillo no lo es —el central dobla en L—, así que el paño
 * violeta terminaba asomando sobre el recorte del edificio, flotando en el vacío. Un paño por
 * mesa cae siempre donde hay piso, y de paso dice mejor qué se está señalando.
 *
 * Las cajas del puntero siguen el mismo criterio: así el tramo se agarra apuntando a sus mesas
 * y no a los metros de aire que las rodean.
 */
const PAD_M = 0.35;

function padsDeTramo(id: string): { x: number; z: number; w: number; d: number }[] {
  return standsDelPiso()
    .filter((s) => s.sala === id)
    .map((s) => {
      const largo = MESA_M.largo + PAD_M * 2;
      const ancho = MESA_M.ancho + PAD_M * 2;
      /* `rot` es 0 o 90°: el tablón corre sobre X o sobre Z, nunca en diagonal. */
      const derecha = Math.abs(Math.cos(s.rot)) > 0.5;
      return { x: s.x, z: s.z, w: derecha ? largo : ancho, d: derecha ? ancho : largo };
    });
}

/**
 * Piso con la textura de vinílico y la oclusión ambiental ya horneada.
 *
 * Va en losas y no en un plano único: el edificio está recortado y tiene cuatro
 * escotaduras donde estaban las salas que se sacaron, así que un rectángulo asomaría por
 * fuera de los muros. Cada losa toma su porción de la textura por UV, de modo que la veta
 * de la madera sigue siendo continua entre losas.
 */
function Piso() {
  const tex = useMemo(() => crearTexturaPiso(), []);
  useEffect(() => () => tex?.dispose(), [tex]);
  const losas = useMemo(() => losasDePiso(), []);

  return (
    <group>
      {losas.map((r, i) => {
        const u0 = (r.cx - r.w / 2 - (HUELLA_M.cx - HUELLA_M.w / 2)) / HUELLA_M.w;
        const v0 = (r.cz - r.d / 2 - (HUELLA_M.cz - HUELLA_M.d / 2)) / HUELLA_M.d;
        const du = r.w / HUELLA_M.w;
        const dv = r.d / HUELLA_M.d;
        return (
          <mesh
            key={i}
            position={[r.cx, 0, r.cz]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
            onUpdate={(m) => {
              const uv = (m.geometry as THREE.PlaneGeometry).attributes.uv;
              /* La textura está en coordenadas de imagen: V va al revés que en UV. */
              const base: [number, number][] = [
                [u0, 1 - v0],
                [u0 + du, 1 - v0],
                [u0, 1 - v0 - dv],
                [u0 + du, 1 - v0 - dv],
              ];
              base.forEach(([u, v], k) => uv.setXY(k, u, v));
              uv.needsUpdate = true;
            }}
          >
            <planeGeometry args={[r.w, r.d]} />
            <meshStandardMaterial
              map={tex ?? undefined}
              color="#ffffff"
              roughness={0.62}
              metalness={0.04}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Realce del grupo señalado: el piso teñido de violeta de marca, suave.
 *
 * Va con `toneMapped={false}` para que el violeta no se apague contra el mapeo ACES de la
 * escena, y con opacidad baja para que se siga viendo la veta de la madera debajo. Cuando
 * la sala es un volumen macizo (los baños) el paño se apoya arriba del bloque.
 *
 * Un tramo de pasillo no se pinta entero sino mesa por mesa: ver `padsDeTramo`.
 */
function Realce({ id }: { id: string }) {
  const sala = SALAS.find((s) => s.id === id) ?? null;
  const panos = sala
    ? [{ ...rectDeSala(sala), x: rectDeSala(sala).cx, z: rectDeSala(sala).cz }]
    : padsDeTramo(id);
  if (panos.length === 0) return null;
  /* Sobre un volumen macizo el paño se apoya arriba; en el piso —salas abiertas y tramos de
     pasillo— va apenas despegado de la madera. */
  const y = sala?.acceso === 'bloqueada' ? bloqueDeSala(sala).alto + 0.015 : 0.025;
  return (
    <group>
      {panos.map((p, i) => (
        <mesh key={i} position={[p.x, y, p.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
          <planeGeometry args={[p.w, p.d]} />
          <meshBasicMaterial
            color="#603ef9"
            transparent
            opacity={0.19}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Zonas sensibles al puntero, invisibles: dan el hover y el click por grupo sin ensuciar el
 * render. El click enfoca el grupo; volver a clickearlo vuelve al piso completo.
 *
 * Entran las salas y también los cuatro tramos de pasillo, para que las mesas del hall se
 * puedan agarrar desde el 3D y no sólo desde la lista de al lado.
 */
function Zonas({
  enfocada,
  onActivar,
  onEnfocar,
}: {
  enfocada: string | null;
  onActivar: (id: string | null) => void;
  onEnfocar: (id: string | null) => void;
}) {
  const grupos = [...SALAS.map((s) => s.id), ...ZONAS_HALL.map((z) => z.id)];
  return (
    <group>
      {grupos.map((id) => {
        const sala = SALAS.find((s) => s.id === id) ?? null;
        const cajas = sala
          ? [{ ...rectDeSala(sala), x: rectDeSala(sala).cx, z: rectDeSala(sala).cz }]
          : padsDeTramo(id);
        /* Las cajas de los tramos van más bajas que las de las salas. Contra el muro oeste de P
           y contra Baños sur, el pad de una mesa se mete unos centímetros dentro del rectángulo
           de la sala, y ahí las dos cajas se pisan: con la cámara mirando desde arriba, el rayo
           toca primero la más alta y la sala se queda con el hover, que es lo que corresponde. */
        const alto = sala ? 0.8 : 0.5;
        return cajas.map((c, i) => (
          <mesh
            key={id + '-' + i}
            position={[c.x, alto / 2, c.z]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onActivar(id);
            }}
            onPointerOut={() => onActivar(null)}
            onClick={(e) => {
              e.stopPropagation();
              onEnfocar(enfocada === id ? null : id);
            }}
          >
            <boxGeometry args={[c.w, alto, c.d]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        ));
      })}
    </group>
  );
}

/** Luces cálidas de cielorraso, una por sala, más un rebote general. */
function LucesInteriores() {
  const puntos = useMemo(
    () =>
      SALAS_ABIERTAS.map((s) => {
        const { cx, cz, w, d } = rectDeSala(s);
        /* Alcance holgado: si la esfera termina en el borde de la sala, las esquinas quedan negras. */
        return { cx, cz, alcance: Math.max(w, d) * 1.9 };
      }),
    [],
  );
  return (
    <group>
      {puntos.map((p, i) => (
        <pointLight
          key={i}
          position={[p.cx, ALTURA_M - 0.15, p.cz]}
          intensity={14}
          distance={p.alcance}
          decay={1.4}
          color="#ffd9a0"
        />
      ))}
    </group>
  );
}

/** Encuadre del piso completo: el de siempre, y al que se vuelve al salir de una sala. */
const CAMARA_PISO = new THREE.Vector3(2, 33, 21);
/** Campo vertical de la cámara. Lo usa el `<Canvas>` y también el encuadre por sala. */
const FOV = 42;

/**
 * Dirección de la cámara, la misma para el piso y para una sala.
 *
 * Que no cambie es lo que hace que el vuelo sea sólo un acercamiento: si además girara,
 * OrbitControls tendría que recortar el ángulo contra sus topes en medio de la animación y el
 * movimiento pegaría un tirón.
 */
const MIRADA = CAMARA_PISO.clone().normalize();
const DURACION_S = 0.75;

/**
 * A dónde poner cámara y foco para ver un grupo entero: una sala o un tramo de pasillo.
 *
 * La distancia sale de encajar el lado más largo en el campo vertical, con un margen que deja
 * ver los muros. El foco va a 0,9 m de altura y no al piso: es donde flotan las insignias, y
 * apuntando más abajo quedaban contra el borde de arriba del cuadro.
 */
function encuadre(rect: RectM | null, aspecto: number): { pos: THREE.Vector3; foco: THREE.Vector3 } {
  if (!rect) return { pos: CAMARA_PISO.clone(), foco: new THREE.Vector3(0, 0, 0) };
  const { cx, cz, w, d } = rect;
  const tanV = Math.tan(((FOV * Math.PI) / 180) / 2);
  /* El campo horizontal sale del vertical por el aspecto. En mobile el viewport es 3/4 y el
     angosto pasa a ser el horizontal, así que el aspecto tiene que entrar en la cuenta. */
  const tanH = tanV * aspecto;
  /* El ancho cae sobre el eje horizontal de la pantalla y la profundidad sobre el vertical,
     así que cada lado se mide contra SU campo. Medir los dos contra el más chico —que es lo
     que hacía tomar `max(w, d)` para ambos— dejaba los grupos alargados demasiado lejos: el
     pasillo norte son cinco mesas en línea, 17 m de ancho por 3,5 de fondo, y terminaba
     encuadrado a 30 m, casi tan lejos como el piso entero.

     La profundidad además se acorta en pantalla por el ángulo de la cámara: un metro sobre Z
     ocupa `MIRADA.y` metros de alto, que es el seno de su elevación. */
  const margen = 1.35;
  const dist = Math.max(
    (w * margen) / 2 / tanH,
    (d * MIRADA.y * margen) / 2 / tanV,
  );
  const foco = new THREE.Vector3(cx, 0.9, cz);
  return { pos: foco.clone().addScaledVector(MIRADA, dist), foco };
}

/**
 * OrbitControls acotado: no baja del piso, no se aleja de más y solo gira dentro de una
 * ventana angular. Se sacó la órbita automática: con el giro acotado tendría que rebotar
 * contra el tope, que se ve peor que dejar el modelo quieto.
 *
 * Con una sala enfocada la cámara vuela hasta encuadrarla y los topes de distancia se abren:
 * hay que poder acercarse más de los 20 m del piso completo, que es la distancia a la que una
 * insignia mide veinte píxeles y no se lee.
 */
function Controles({ enfocada }: { enfocada: string | null }) {
  const { camera, gl, size } = useThree();
  const aspecto = size.width / Math.max(1, size.height);
  const ref = useRef<OrbitControls | null>(null);
  const vuelo = useRef<{
    t: number;
    desdePos: THREE.Vector3;
    desdeFoco: THREE.Vector3;
    aPos: THREE.Vector3;
    aFoco: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.target.set(0, 0, 0);
    c.enablePan = false;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 20;
    c.maxDistance = 64;
    /* Nunca del todo cenital ni por debajo del piso. */
    c.minPolarAngle = 0.12;
    c.maxPolarAngle = Math.PI / 2 - 0.35;
    /* Ventana de giro acotada: las etiquetas están clavadas al piso y fuera de este rango
       se leerían espejadas. */
    c.minAzimuthAngle = -Math.PI * 0.3;
    c.maxAzimuthAngle = Math.PI * 0.3;
    ref.current = c;
    return () => c.dispose();
  }, [camera, gl]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const rect = enfocada ? rectEnfocable(enfocada) : null;
    const { pos, foco } = encuadre(rect, aspecto);
    /* Los topes se abren ANTES de mover: si no, `update()` recorta el destino a mitad de vuelo. */
    c.minDistance = rect ? 5 : 20;
    c.maxDistance = rect ? 44 : 64;
    /* Al montar, la cámara ya está donde tiene que estar: no hay nada que animar. */
    if (camera.position.distanceTo(pos) < 0.01) return;
    vuelo.current = {
      t: 0,
      desdePos: camera.position.clone(),
      desdeFoco: c.target.clone(),
      aPos: pos,
      aFoco: foco,
    };
    /* Mientras vuela no se puede arrastrar: el arrastre pelearía contra la interpolación. */
    c.enabled = false;
  }, [enfocada, camera, aspecto]);

  useFrame((_, dt) => {
    const c = ref.current;
    if (!c) return;
    const v = vuelo.current;
    if (v) {
      v.t = Math.min(1, v.t + dt / DURACION_S);
      const k = v.t < 0.5 ? 2 * v.t * v.t : 1 - Math.pow(-2 * v.t + 2, 2) / 2;
      camera.position.lerpVectors(v.desdePos, v.aPos, k);
      c.target.lerpVectors(v.desdeFoco, v.aFoco, k);
      if (v.t >= 1) {
        vuelo.current = null;
        c.enabled = true;
      }
    }
    c.update();
  });
  return null;
}

function Entorno() {
  const { scene } = useThree();
  useEffect(() => {
    const tex = crearEntorno();
    if (!tex) return;
    scene.environment = tex;
    return () => {
      scene.environment = null;
      tex.dispose();
    };
  }, [scene]);
  return null;
}

function Escena({
  activa,
  enfocada,
  onActivar,
  onEnfocar,
}: {
  activa: string | null;
  enfocada: string | null;
  onActivar: (id: string | null) => void;
  onEnfocar: (id: string | null) => void;
}) {
  /* El hover manda mientras hay hover; sin él queda lo enfocado, que no se apaga solo. */
  const senalada = activa ?? enfocada;
  return (
    <>
      {/* Igual que `.sd-piso__viewport` en `startupDay.css` (--sd-void): si divergen,
          aparece un marco alrededor del canvas. */}
      <color attach="background" args={['#0b0712']} />
      <Entorno />

      <ambientLight intensity={0.46} />
      <hemisphereLight args={['#fff3e0', '#3a2f48', 0.62]} />
      {/* Sol entrando por el ventanal: es la que tira las sombras largas. */}
      <directionalLight
        position={[-24, 20, 6]}
        intensity={1.6}
        color="#eaf2ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={1}
        shadow-camera-far={70}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />
      {/* Relleno sin sombras del lado opuesto: levanta la mitad que queda a contraluz. */}
      <directionalLight position={[22, 16, -12]} intensity={0.55} color="#ffe9cf" />
      <LucesInteriores />

      <Piso />
      <Volumenes />
      <Mobiliario />
      <Etiquetas />
      {senalada ? <Realce id={senalada} /> : null}
      <Logos activa={senalada} />
      <Zonas enfocada={enfocada} onActivar={onActivar} onEnfocar={onEnfocar} />

      <Controles enfocada={enfocada} />
    </>
  );
}

export default function FloorScene({
  activa,
  enfocada,
  onActivar,
  onEnfocar,
}: {
  activa: string | null;
  enfocada: string | null;
  onActivar: (id: string | null) => void;
  onEnfocar: (id: string | null) => void;
}) {
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
      /* Bien alta: con muros de 2,7 m, un ángulo bajo tapa las salas del fondo. */
      camera={{ position: CAMARA_PISO.toArray(), fov: FOV, near: 0.5, far: 250 }}
      onPointerMissed={() => {
        onActivar(null);
        onEnfocar(null);
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.9;
      }}
    >
      <Escena
        activa={activa}
        enfocada={enfocada}
        onActivar={onActivar}
        onEnfocar={onEnfocar}
      />
    </Canvas>
  );
}
