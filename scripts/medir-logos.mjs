/**
 * Mide los logos del slider y escribe `src/data/startupDayEscalas.ts`.
 *
 * Por qué hace falta: la celda del slider usa `object-fit: contain`, que ajusta el archivo entero
 * —padding transparente incluido— a la caja. Los 48 archivos vienen con padding dispar (de 0% a
 * 89%), así que con el mismo CSS unos salen gigantes y otros diminutos.
 *
 * ## Qué se normaliza, y por qué cambió
 *
 * La versión anterior medía `√(área de tinta) × (0,6 + 0,8 × huella)` contra la mediana. Mezclaba
 * dos magnitudes y no daba parejo: sobre los archivos reales dejaba la altura de tinta entre 25 y
 * 94 —casi 4× de diferencia— y `coworkeando` cruzaba 342 de los 376 de la celda mientras `uin`
 * ocupaba 92.
 *
 * Ahora se normaliza lo que el ojo compara en una pared de logos:
 *
 *   1. **altura de tinta constante** (`ALTO_OBJETIVO`) — es la altura de x / de la caja del
 *      isotipo, lo que hace que dos marcas se lean "del mismo tamaño";
 *   2. **tope de ancho de tinta** (`ANCHO_MAXIMO`) — para que un wordmark largo no cruce la celda
 *      entera. Los que topan por acá quedan más bajos que el objetivo, y está bien: un wordmark
 *      muy apaisado no puede ser a la vez angosto y alto.
 *
 * La escala es el `min` de las dos, topada en 1: nunca mayor, porque achica la caja del `<img>`
 * dentro de la celda y por encima de 1 un logo pisaría al vecino.
 *
 * ## El ajuste a ojo ya no se pisa
 *
 * Antes este script imprimía un bloque para pegar a mano, el archivo se corregía a ojo y volver a
 * correrlo perdía esas correcciones. Ahora las correcciones viven acá, en `AJUSTE_OPTICO`, y el
 * script las aplica: la medición no ve el PESO visual —un logo macizo y en negrita pesa más que su
 * altura, uno de trazo fino o de dos líneas pesa menos— y eso sólo se arregla mirando.
 *
 * Uso: `node scripts/medir-logos.mjs`
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/* La caja del logo en el slider, en las unidades del Figma que usa `.sd-marcas__logo`
   (`width: calc(376 * k)` / `height: calc(130 * k)`). */
const CAJA_W = 376;
const CAJA_H = 130;

/** Altura de tinta a la que se lleva cada logo. ~41% de la caja: da aire arriba y abajo. */
const ALTO_OBJETIVO = 54;

/** Tope de ancho de tinta. ~70% de la caja: lo que sobra es el aire entre marcas vecinas. */
const ANCHO_MAXIMO = 262;

const DIR = 'src/public/logos/startup-day';
const SALIDA = 'src/data/startupDayEscalas.ts';

/**
 * Corrección de peso visual, a ojo sobre la hoja de contacto de las 48 marcas.
 *
 * `> 1` agranda, `< 1` achica. Se multiplica sobre la escala medida, así que es una corrección
 * relativa y sobrevive a cambios de `ALTO_OBJETIVO`.
 *
 * Los dos motivos por los que la medición se equivoca:
 *
 *   - **Marcas macizas**: una tipografía muy negra o un isotipo relleno pintan mucho más adentro
 *     de la misma caja, y a igual altura se leen más grandes que el resto.
 *   - **Marcas de trazo fino, caladas o de dos líneas**: pintan poco, o su caja de tinta incluye
 *     dos renglones / una inclinación, así que a igual altura de caja las letras son la mitad.
 *
 * Un ajuste `> 1` sube el objetivo de alto pero NO puede pasarse del tope de ancho: si no, las
 * marcas que ya topaban por ancho se comerían el aire del vecino. Uno `< 1` achica las dos cosas.
 */
const AJUSTE_OPTICO = {
  /* Macizas: tipografía muy negra o isotipo relleno. A igual altura pintan el doble. */
  'bata': 0.82,
  'divenuo': 0.9,
  'belo': 0.9,
  'certenza': 0.82,
  'datricas': 0.92,
  'extra': 0.8,
  'firmaway': 0.82,
  'fud': 0.74,
  'hubeet': 0.9,
  'kaizer': 0.9,
  'marz': 0.8,
  'nomenclator': 0.92,
  'pasito': 0.84,
  'picante': 0.8,
  'talopay': 0.95,
  'uin': 0.86,
  'yafu': 0.74,
  'zettios': 0.9,

  /* De trazo fino o calado: pintan poco y se pierden al lado de las anteriores. */
  'baf': 1.1,
  'genosha': 1.05,
  'lisaai': 1.12,
  'compassguard': 1.12,
  'prestagro': 1.08,
  'newtopia': 1.08,
  'berry': 1.06,
  'fardo': 1.08,
  'piggywallet': 1.1,

  /* Caja de tinta con más cosas que el nombre: una bajada ("Braja Finanzas"), dos renglones
     ("Startups Argentina", "WIP CLUB") o una inclinación que alarga la caja sin agrandar las
     letras ("luca"). La medida las toma altas y las deja chicas. */
  'braja-finanzas': 1.2,
  'luca': 1.32,
  'startups-argentina': 1.22,
  'wipclub': 1.1,

  /* Isotipos sueltos, sin wordmark que los acompañe: quedan como una manchita al lado de una
     palabra entera. */
  'mercado-libre': 1.28,
  'plaude': 1.32,
};

const marcas = JSON.parse(fs.readFileSync('scripts/marcas-slider.json', 'utf8'));

/** Caja de tinta del archivo: el recorte sin el padding transparente. */
async function cajaDeTinta(file) {
  const { data, info } = await sharp(path.join(DIR, file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;
  for (let i = 0, px = 0; i < data.length; i += 4, px++) {
    /* Umbral y no `> 0`: casi todos los archivos traen una orla de antialias de alfa muy baja que,
       tomada como tinta, infla la caja un par de píxeles por lado. */
    if (data[i + 3] <= 40) continue;
    const x = px % info.width;
    const y = (px / info.width) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  if (maxX < 0) throw new Error(`${file}: no tiene un solo píxel opaco`);
  return { bw: maxX - minX + 1, bh: maxY - minY + 1, fw: info.width, fh: info.height };
}

const filas = [];
for (const [id, file] of marcas) {
  const { bw, bh, fw, fh } = await cajaDeTinta(file);

  /* El factor con el que `contain` mete el lienzo entero en la caja, antes de aplicar la escala. */
  const s = Math.min(CAJA_W / fw, CAJA_H / fh);

  const ajuste = AJUSTE_OPTICO[id] ?? 1;
  const porAlto = ALTO_OBJETIVO / (s * bh);
  const porAncho = ANCHO_MAXIMO / (s * bw);
  /* El ajuste entra en el objetivo de alto siempre, y en el tope de ancho sólo cuando achica: así
     agrandar una marca nunca la hace cruzar la celda. */
  const k = Math.min(porAlto * ajuste, porAncho * Math.min(ajuste, 1), 1);

  filas.push({
    id,
    k: Math.round(k * 100) / 100,
    alto: k * s * bh,
    ancho: k * s * bw,
    topaPorAncho: porAncho < porAlto,
  });
}

filas.sort((a, b) => a.id.localeCompare(b.id));

const cuerpo = filas.map((f) => `  '${f.id}': ${f.k.toFixed(2)},`).join('\n');
const modulo = `/**
 * Corrección de tamaño óptico de los logos del slider. **Generado por \`scripts/medir-logos.mjs\`.**
 *
 * El problema: la celda usa \`object-fit: contain\`, que ajusta el ARCHIVO ENTERO a la caja —
 * padding transparente incluido. Y los 48 archivos vienen con padding dispar, así que con el mismo
 * CSS medio archivo vacío es medio logo y unos salían gigantes y otros diminutos.
 *
 * Cada número lleva el logo a una altura de tinta pareja (${ALTO_OBJETIVO} de los ${CAJA_H} de alto de la celda),
 * topada por un ancho máximo (${ANCHO_MAXIMO} de ${CAJA_W}) para que un wordmark largo no cruce la celda entera.
 *
 * **Todos los valores son ≤ 1, y eso es a propósito.** La escala achica la caja del \`<img>\` dentro
 * de la celda; con valores mayores a 1 la caja desbordaría y un logo podría pisar al vecino. Si hay
 * que agrandar el conjunto, se agranda la celda (\`.sd-marcas__logo\`), no estos números.
 *
 * **No editar a mano**: el ajuste a ojo va en \`AJUSTE_OPTICO\`, dentro del script, que es lo que
 * sobrevive a volver a correrlo.
 */
export const ESCALA_LOGO: Readonly<Record<string, number>> = {
${cuerpo}
};

/** Cuánto achicar el logo de una marca dentro de su celda. 1 = llena la celda. */
export function escalaDeLogo(id: string): number {
  return ESCALA_LOGO[id] ?? 0.8;
}
`;

fs.writeFileSync(SALIDA, modulo);

const altos = filas.map((f) => f.alto).sort((a, b) => a - b);
console.log(`${filas.length} marcas → ${SALIDA}`);
console.log(
  `altura de tinta: ${altos[0].toFixed(0)} / ${altos[altos.length >> 1].toFixed(0)} / ${altos.at(-1).toFixed(0)}`,
  `(dispersión ${(altos.at(-1) / altos[0]).toFixed(2)}×)`,
);
const topadas = filas.filter((f) => f.topaPorAncho);
console.log(`${topadas.length} topan por ancho y quedan más bajas:`, topadas.map((f) => f.id).join(', '));
