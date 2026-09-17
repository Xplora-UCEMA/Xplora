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
export type PatronAscii = 'flujo' | 'onda' | 'malla' | 'disperso' | 'espiral' | 'disco' | 'cinta';

/** Ruido por celda, en 0..1. Determinista: la misma celda devuelve siempre lo mismo. */
const azarDe = (u: number, v: number) => {
  const s = Math.sin(u * 311.7 + v * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

export const PATRONES: Record<PatronAscii, (u: number, v: number, t: number) => number> = {
  /**
   * La cinta: una forma diagonal enorme que cruza la caja y sigue fuera de ella.
   *
   * Es el único de los patrones que tiene GEOMETRÍA. Los otros evalúan la misma fórmula en todo el
   * plano, y por eso dan textura: ruido repartido dentro de un rectángulo, con el borde del canvas
   * como único contorno. Acá primero se define una trayectoria y después la densidad sale de la
   * distancia a esa trayectoria, que es lo que produce una silueta reconocible.
   *
   * ## Los dos ejes
   *
   * `p` avanza sobre la diagonal —0 en la esquina superior izquierda, 1 en la inferior derecha— y
   * `q` es la distancia perpendicular a ella. Toda la forma se describe en estos dos, así que sale
   * diagonal por construcción y no por haberla rotado.
   *
   * ## Por qué cada término
   *
   * - **`curva`**: dos senos de periodo largo, uno amplio y lento y otro corto y chico. Con uno
   *   solo la cinta se lee como una onda regular; el segundo le rompe la periodicidad y la deja
   *   como una curva ancha y suave.
   * - **`ancho`**: se abre en el medio del recorrido y se cierra en las puntas. Una banda de ancho
   *   constante se lee como una franja; que respire es lo que la vuelve una forma.
   * - **`porFila`**: depende SÓLO de `v`, o sea que es constante dentro de una fila de la grilla —
   *   y cada fila es una línea de caracteres. Así las líneas tienen largos distintos, que es de lo
   *   que está hecha la cinta. El término de tiempo las alarga y acorta despacio.
   * - **el hash**: resta densidad, y resta más cuanto más lejos del eje. Es lo que convierte el
   *   fundido del borde en caracteres sueltos en vez de un degradado parejo.
   * - **`eco`**: una segunda pasada angosta y tenue, corrida del eje, para que algo de la forma
   *   reaparezca fuera del cuerpo principal.
   *
   * La geometría (`curva`, `ancho`) NO depende del tiempo: la silueta se queda quieta y lo que se
   * mueve es la composición interna. Ese es el efecto buscado — el dibujo parece estar
   * generándose todo el tiempo sin desplazarse ni rotar.
   */
  cinta: (u, v, t) => {
    const p = (u + v) * 0.5;
    const q = (v - u) * 0.5;

    const curva = 0.155 * Math.sin(p * 3.2 - 0.75) + 0.052 * Math.sin(p * 7.1 + 1.9);

    /* `p` se sale de 0..1 en las esquinas; el clamp evita que el seno del ancho se dé vuelta y la
       cinta se abra de nuevo fuera del recorrido. */
    const pc = Math.min(1, Math.max(0, p));
    const porFila = 0.8 + 0.34 * Math.sin(v * 167.3 + t * 0.11);
    const ancho = (0.026 + 0.052 * Math.sin(Math.PI * pc)) * porFila;

    const off = Math.abs(q - curva) / Math.max(0.012, ancho);
    let d = 1 - smoothstep(0.3, 1.12, off);

    /* El eco, antes del desarmado: también tiene que perder densidad hacia su propio borde. */
    const offEco = Math.abs(q - curva - 0.235) / Math.max(0.012, ancho * 0.42);
    d = Math.max(d, 0.5 * (1 - smoothstep(0.25, 1.05, offEco)));

    const azar = azarDe(u, v);
    const lejos = smoothstep(0.18, 1.0, Math.min(off, offEco));
    /* Parpadeo lento por celda: cada una tiene su propia fase, así no respiran todas juntas. */
    const parpadeo = 0.5 + 0.5 * Math.sin(t * 0.55 + azar * 6.283);
    d -= lejos * (azar * 0.62 + parpadeo * 0.24);

    return d;
  },

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
    const azar = azarDe(u, v);
    const pulso = 0.5 + 0.5 * Math.sin(t * 0.6 + azar * 6.28);
    return azar > 0.82 ? 0.45 + 0.55 * pulso : 0;
  },

  /**
   * El dibujo de la brújula, tal cual.
   *
   * Es la misma fórmula que `SdAsciiDisc`: los brazos en espiral —el `r * 7.5` es lo que los curva
   * en vez de dejarlos como un molinete— más el ruido barato de tres senos cruzados y una onda
   * concéntrica. Lo que NO se trae es lo que hace del disco una pieza y no una textura: el calado
   * del mark de Xplora y el recorte circular del borde. Acá la forma la da la máscara de CSS.
   *
   * Existe para que el ASCII de fondo del hero y la brújula se lean como la misma familia. Con
   * `espiral` —que es una versión simplificada— se notaba que eran dos dibujos distintos.
   */
  disco: (u, v, t) => {
    const dx = (u - 0.5) * 2;
    const dy = (v - 0.5) * 2;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const espiral = Math.sin(3 * (a + 0.055 * t) + r * 7.5 - t * 0.9);
    const ruido =
      (Math.sin(dx * 5.1 + t * 0.61) +
        Math.cos(dy * 4.3 - t * 0.47) +
        Math.sin((dx + dy) * 3.2 + t * 0.33) +
        0.6 * Math.sin((dx * dx + dy * dy) * 9 - t * 1.1)) *
      0.27;
    return 0.5 + 0.34 * espiral + 0.3 * ruido;
  },

  /* Brazos en espiral desde el centro, versión corta. La larga es `disco`. */
  espiral: (u, v, t) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const r = Math.hypot(dx, dy) * 2;
    const a = Math.atan2(dy, dx);
    return 0.5 + 0.36 * Math.sin(3 * (a + 0.06 * t) + r * 8 - t * 0.8) * (1 - smoothstep(0.5, 1.2, r));
  },
};
