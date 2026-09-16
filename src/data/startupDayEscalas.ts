/**
 * Corrección de tamaño óptico de los logos del slider. **Generado por `scripts/medir-logos.mjs`.**
 *
 * El problema: la celda usa `object-fit: contain`, que ajusta el ARCHIVO ENTERO a la caja —
 * padding transparente incluido. Y los 48 archivos vienen con padding dispar, así que con el mismo
 * CSS medio archivo vacío es medio logo y unos salían gigantes y otros diminutos.
 *
 * Cada número lleva el logo a una altura de tinta pareja (54 de los 130 de alto de la celda),
 * topada por un ancho máximo (262 de 376) para que un wordmark largo no cruce la celda entera.
 *
 * **Todos los valores son ≤ 1, y eso es a propósito.** La escala achica la caja del `<img>` dentro
 * de la celda; con valores mayores a 1 la caja desbordaría y un logo podría pisar al vecino. Si hay
 * que agrandar el conjunto, se agranda la celda (`.sd-marcas__logo`), no estos números.
 *
 * **No editar a mano**: el ajuste a ojo va en `AJUSTE_OPTICO`, dentro del script, que es lo que
 * sobrevive a volver a correrlo.
 */
export const ESCALA_LOGO: Readonly<Record<string, number>> = {
  'baf': 0.58,
  'bata': 0.57,
  'belo': 0.41,
  'berry': 0.54,
  'braja-finanzas': 0.54,
  'certenza': 0.58,
  'cobrando': 0.73,
  'compassguard': 0.55,
  'coworkeando': 0.77,
  'crunchloop': 0.70,
  'datricas': 0.59,
  'derecruiters': 0.70,
  'divenuo': 0.63,
  'endeavor': 0.70,
  'extra': 0.56,
  'fardo': 0.54,
  'firmaway': 0.67,
  'firstplug': 0.72,
  'fluxis': 0.55,
  'fud': 0.31,
  'gasti': 0.59,
  'genosha': 0.73,
  'hubeet': 0.59,
  'kaizer': 0.49,
  'lisaai': 0.67,
  'luca': 0.55,
  'marz': 0.65,
  'mercado-libre': 0.64,
  'nerdearla': 0.74,
  'newtopia': 0.54,
  'nomenclator': 0.53,
  'paisanos': 0.70,
  'pasito': 0.51,
  'picante': 0.56,
  'piggywallet': 0.49,
  'plaude': 0.56,
  'prestagro': 0.59,
  'resender': 0.73,
  'sof': 0.58,
  'squads-ventures': 0.73,
  'startups-argentina': 0.54,
  'talopay': 0.83,
  'tqe': 0.59,
  'tuni': 0.56,
  'uin': 0.36,
  'wipclub': 0.61,
  'yafu': 0.50,
  'zettios': 0.58,
};

/** Cuánto achicar el logo de una marca dentro de su celda. 1 = llena la celda. */
export function escalaDeLogo(id: string): number {
  return ESCALA_LOGO[id] ?? 0.8;
}
