/**
 * Lo compartido entre las piezas de ASCII de la página: la rampa de densidad, la paleta y el
 * atlas de glifos.
 *
 * Vivía adentro de `SdAsciiDisc`, que era el único que lo usaba. Con `SdAsciiCampo` pasaron a ser
 * dos, y la rampa de tonos no se puede duplicar: está calculada sobre los tres tokens del sistema
 * (ver `TINTS`) y tener dos copias garantiza que una quede vieja la próxima vez que se toque un
 * color.
 */

/** Rampa de densidad: del vacío al bloque lleno. */
export const RAMP = ' .:-=+*#%@';

/**
 * Sin webfont monoespaciada. En canvas no existe `font-display`: si la familia todavía no cargó,
 * `ctx.font` cae al fallback en silencio y no hay repintado cuando llega, así que habría que
 * esperar a `document.fonts.load()` antes del primer frame — sobre un `index.html` que ni siquiera
 * tiene preconnect a fonts.gstatic.com. A 6-13 px esto es textura, no texto.
 */
export const MONO =
  "ui-monospace, 'SF Mono', 'Cascadia Mono', 'Segoe UI Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";

/**
 * Del ink casi invisible al lavanda de las crestas. El original de Luma nunca llega a blanco
 * (pico ~134/255), así que las puntas quedan apagadas a propósito.
 *
 * La rampa no es libre: son seis muestras interpoladas entre los tres valores del sistema
 * —`--sd-void` (11,7,18) → `--sd-purple` (96,62,249) → `--sd-purple-lift` (196,181,255)—, así que
 * el ASCII vive en el mismo hue que todo lo demás. Va hardcodeada porque esto se pinta en canvas,
 * donde no llegan las custom properties; si cambian los tokens, hay que recalcularla acá.
 */
export const TINTS = ['#27195f', '#3e289d', '#5537da', '#7456fa', '#9c85fd', '#c4b5ff'];

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Un sprite por nivel de la rampa, en una tira horizontal.
 *
 * Glifo y tono salen del mismo escalar, así que no hacen falta `glifos × tonos` combinaciones:
 * alcanza con una tira de `RAMP.length` tiles. Pegar sprites es bastante más barato que `fillText`
 * por celda, y sobre todo elimina el `fillStyle` por celda, que es lo que rompe el batching de
 * glifos del rasterizador.
 *
 * Devuelve `null` si el contexto 2D no está disponible.
 */
export function construirAtlas(cellW: number, cellH: number): HTMLCanvasElement | null {
  const a = document.createElement('canvas');
  /* 15% de aire: `@` y `#` desbordan una celda ajustada. */
  const pad = 1.15;
  const tw = Math.ceil(cellW * pad);
  const th = Math.ceil(cellH * pad);
  a.width = tw * RAMP.length;
  a.height = th;
  const actx = a.getContext('2d');
  if (!actx) return null;

  /* 0.6 em es el avance típico de una monoespaciada, pero varía por familia: se mide una vez y se
     corrige, así el glifo llena la celda en cualquier plataforma. */
  let fontPx = cellW / 0.6;
  actx.font = `${fontPx}px ${MONO}`;
  const adv = actx.measureText('#').width;
  if (adv > 0) fontPx *= cellW / adv;

  actx.font = `${fontPx}px ${MONO}`;
  /* Centrado en los dos ejes: así se cancelan las diferencias de ascent/descent entre familias. */
  actx.textAlign = 'center';
  actx.textBaseline = 'middle';

  for (let gi = 0; gi < RAMP.length; gi++) {
    const ch = RAMP[gi]!;
    if (ch === ' ') continue;
    const ti = Math.min(TINTS.length - 1, Math.floor((gi / RAMP.length) * TINTS.length));
    actx.fillStyle = TINTS[ti]!;
    actx.fillText(ch, gi * tw + tw / 2, th / 2);
  }
  return a;
}

/**
 * Los campos que puede dibujar `SdAsciiCampo`.
 *
 * Cada uno es una función de densidad: recibe la posición normalizada de la celda —`u`, `v` en
 * 0..1 sobre la caja— y el tiempo en segundos, y devuelve cuánta tinta va ahí (0 = nada,
 * 1 = bloque lleno). No saben nada de canvas ni de glifos: eso lo resuelve el componente.
 *
 * Son cinco y no uno configurable porque cada sección pide una lectura distinta —una malla lee
 * como plano de piso, una dispersión como gente suelta— y esa intención se pierde si queda como
 * un puñado de números sueltos en el JSX.
 */
export type PatronAscii = 'flujo' | 'onda' | 'malla' | 'disperso' | 'espiral';

export const PATRONES: Record<PatronAscii, (u: number, v: number, t: number) => number> = {
  /* Corriente diagonal: bandas largas que cruzan la caja. Es el más neutro de los cinco, el que
     se usa cuando el ASCII tiene que ser atmósfera y nada más. */
  flujo: (u, v, t) =>
    0.5 +
    0.32 * Math.sin((u + v) * 7 - t * 0.5) +
    0.2 * Math.sin(u * 13 - v * 5 + t * 0.31),

  /* Ondas concéntricas desde una esquina: lo más cercano a un "sonido" de las cinco. */
  onda: (u, v, t) => {
    const r = Math.hypot(u, v);
    return 0.5 + 0.38 * Math.sin(r * 22 - t * 1.4) * (1 - smoothstep(0.2, 1.3, r));
  },

  /* Retícula: dos trenes de ondas cuadradas cruzados. Lee como plano de planta. */
  malla: (u, v) => {
    const gx = Math.abs(((u * 9) % 1) - 0.5);
    const gy = Math.abs(((v * 5) % 1) - 0.5);
    /* Tope en 0,74 y no en 1: llegando arriba de todo la retícula usa `@` y `#`, los dos glifos
       más pesados de la rampa, y sobre el fondo de una celda eso lee como glitch en vez de plano.
       Con el techo bajo se queda en la mitad de la rampa, que es donde el ASCII es textura. */
    return 0.2 + 0.54 * (1 - smoothstep(0.02, 0.14, Math.min(gx, gy)));
  },

  /* Puntos sueltos con densidad variable: gente en un piso, no una textura pareja. */
  disperso: (u, v, t) => {
    const s = Math.sin(u * 311.7 + v * 127.1) * 43758.5453;
    const azar = s - Math.floor(s);
    const pulso = 0.5 + 0.5 * Math.sin(t * 0.6 + azar * 6.28);
    return azar > 0.82 ? 0.45 + 0.55 * pulso : 0;
  },

  /* Brazos en espiral desde el centro. El mismo gesto que el disco del hero, sin el calado. */
  espiral: (u, v, t) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.hypot(dx, dy) * 2;
    const a = Math.atan2(dy, dx);
    return 0.5 + 0.36 * Math.sin(3 * (a + 0.06 * t) + r * 8 - t * 0.8) * (1 - smoothstep(0.5, 1.2, r));
  },
};
