/**
 * Materiales del render, generados por código en canvas — sin archivos de textura que
 * bajar. Los tonos salen de las fotos de `docs/piso/`: vinílico símil madera oscura,
 * paredes de yeso blanco roto y columnas del mismo yeso.
 */
import * as THREE from 'three';
import { HUELLA_M, SALAS, rectDeSala, type Lado } from '../../../data/startupDayFloor';

/** Píxeles de textura por metro del piso. */
const PX_POR_M = 26;

function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Textura del piso: tablas de vinílico símil madera con veta, **más la oclusión ambiental
 * horneada** en la misma imagen — bandas oscuras contra cada muro. Es lo que hace que las
 * paredes se vean apoyadas en el piso y no flotando, sin sumar postprocesado (SSAO) al
 * bundle, que sobre los 224 KB de three sería un costo enorme para la landing.
 *
 * Se dibuja una sola textura para todo el piso, no una por sala, así la veta es continua
 * y las sombras de contacto caen en el lugar exacto de cada muro.
 */
export function crearTexturaPiso(): THREE.CanvasTexture | null {
  /* Cubre la huella del edificio recortado; cada losa mapea su porción por UV. */
  const env = HUELLA_M;
  const W = Math.round(env.w * PX_POR_M);
  const H = Math.round(env.d * PX_POR_M);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (!x) return null;

  const r = rnd(20260909);

  x.fillStyle = '#3d2119';
  x.fillRect(0, 0, W, H);

  /* Tablas de ~1,2 × 0,18 m, con juntas trabadas fila a fila. */
  const largo = 1.2 * PX_POR_M;
  const ancho = 0.18 * PX_POR_M;
  for (let fila = 0, y = 0; y < H; fila++, y += ancho) {
    const offset = (fila % 3) * (largo / 3);
    for (let px = -largo; px < W + largo; px += largo) {
      const t = px + offset;
      const tono = 0.82 + r() * 0.36;
      const rr = Math.round(74 * tono);
      const gg = Math.round(40 * tono);
      const bb = Math.round(30 * tono);
      x.fillStyle = 'rgb(' + rr + ',' + gg + ',' + bb + ')';
      x.fillRect(t, y, largo - 1.2, ancho - 1.2);

      /* Veta: rayas finas a lo largo de la tabla. */
      x.globalAlpha = 0.12;
      for (let v = 0; v < 5; v++) {
        x.fillStyle = r() > 0.5 ? '#1d0f0a' : '#8a5236';
        x.fillRect(t + r() * largo * 0.2, y + r() * ancho, largo * (0.3 + r() * 0.5), 1);
      }
      x.globalAlpha = 1;
    }
  }

  /* Oclusión ambiental horneada contra cada muro. */
  const aPx = (mx: number, mz: number) => ({
    px: ((mx - env.cx) / env.w + 0.5) * W,
    py: ((mz - env.cz) / env.d + 0.5) * H,
  });
  const AO = 0.42 * PX_POR_M;

  x.globalCompositeOperation = 'multiply';
  for (const sala of SALAS) {
    const { cx, cz, w, d } = rectDeSala(sala);
    const a = aPx(cx - w / 2, cz - d / 2);
    const b = aPx(cx + w / 2, cz + d / 2);
    /* Una cara sin muro no proyecta sombra de contacto: O y P renuncian a las que da el
       vestíbulo, y sin este filtro quedaba una banda oscura contra el aire. */
    const lados: [number, number, number, number, [number, number], Lado][] = [
      [a.px, a.py, b.px - a.px, AO, [0, 1], 'norte'],
      [a.px, b.py - AO, b.px - a.px, AO, [0, -1], 'sur'],
      [a.px, a.py, AO, b.py - a.py, [1, 0], 'oeste'],
      [b.px - AO, a.py, AO, b.py - a.py, [-1, 0], 'este'],
    ];
    for (const [lx, ly, lw, lh, [dx, dy], lado] of lados) {
      if (sala.sinMuro?.includes(lado)) continue;
      const g = x.createLinearGradient(
        lx + (dx < 0 ? lw : 0),
        ly + (dy < 0 ? lh : 0),
        lx + (dx < 0 ? lw : 0) + dx * lw,
        ly + (dy < 0 ? lh : 0) + dy * lh,
      );
      g.addColorStop(0, 'rgba(40,26,20,1)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      x.fillStyle = g;
      x.fillRect(lx, ly, lw, lh);
    }
  }
  x.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Mapa de entorno: degradé de cielorraso claro a piso oscuro. Sin algo que reflejar, los
 * materiales quedan planos por más luces que se agreguen.
 */
export function crearEntorno(): THREE.Texture | null {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const x = c.getContext('2d');
  if (!x) return null;
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#fdf7ea');
  g.addColorStop(0.45, '#cfd3dd');
  g.addColorStop(0.62, '#6a6270');
  g.addColorStop(1, '#241a2e');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Yeso blanco roto de las paredes y columnas. */
export const YESO = { color: '#efece5', roughness: 0.92, metalness: 0 } as const;
/** Tableros y mobiliario blanco de las fotos. */
export const MELAMINA = { color: '#f6f4f0', roughness: 0.55, metalness: 0 } as const;
/** Patas y estructura metálica clara. */
export const METAL = { color: '#cdc9c2', roughness: 0.4, metalness: 0.5 } as const;
/** Puerta marcada sobre la cara de un volumen macizo. */
export const PUERTA_MARCADA = { color: '#d4cec2', roughness: 0.75, metalness: 0 } as const;

