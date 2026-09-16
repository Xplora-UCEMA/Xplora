/**
 * Qué marca ocupa cada stand del piso.
 *
 * Vive aparte de `startupDayFloor.ts` a propósito: ese módulo es sólo geometría (sale del
 * croquis) y este es sólo asignación (sale del plano de montaje). Mezclarlos hacía que
 * cambiar una marca obligara a tocar el archivo del plano.
 *
 * La tabla se transcribió de `docs/piso/plano-2do-piso-mesas.png`, mesa por mesa. Los ids
 * de sala son los del plano (L1…L7, N1…N7, O1…O7, P1…P7); los del hall son propios, porque
 * el plano repite `H08` en seis mesas distintas y no sirve como clave.
 */
import {
  LOGO,
  SD_CHARLAS,
  SD_EDITION_SPONSORS,
  SD_STARTUPS,
  SD_XPLORA_PARTNERS,
} from './startupDay';
import { standsDelPiso, type Stand } from './startupDayFloor';

/**
 * Lo mínimo que necesita una insignia del render. `href` no lo usa el 3D —una placa flotando
 * en la escena no se clickea— pero sí la banda de marcas de "No importa quién sos", que sale
 * de esta misma lista y linkea cada logo al sitio de la startup.
 */
export type MarcaDeStand = {
  id: string;
  name: string;
  logoUrl: string;
  href?: string;
  /**
   * El archivo trae fondo propio: hay que mostrarlo tal cual, no blanquearlo.
   *
   * Existe porque el slider aplica `brightness(0) invert(1)` a todo, y sobre un archivo opaco eso
   * da una mancha blanca — a Mercado Libre lo dejaba como un círculo. El dato ya estaba en
   * `SD_CHARLAS.logoEnColor`; lo que faltaba era traerlo hasta acá.
   */
  logoEnColor?: boolean;
};

/**
 * Marcas con mesa que no salen de las listas de la landing.
 *
 * Una sola: UCEMA Xplora, que es la casa y no una startup del carrusel. Está en
 * `SD_XPLORA_PARTNERS`, pero con el isotipo azul sobre fondo propio; el stand usa el
 * wordmark blanco, que es el que mandaron para el plano.
 */
const PROPIAS: readonly MarcaDeStand[] = [
  { id: 'ucemax', name: 'UCEMA Xplora', logoUrl: LOGO('ucemax-blanco.png') },
];

/**
 * Asignación: id de stand → id de marca.
 *
 * Faltan `h06` y `h12`, las dos mesas del pasillo que flanquean a Yafu contra el muro oeste
 * de P: el plano las dibuja pero no les pone logo. Quedan sin insignia hasta que llegue el
 * dato.
 *
 * **Bajas de último momento.** `l4` (UCEMA Xplora) y `h13` (Renderahouse) están dibujadas en el
 * plano de montaje pero esas dos marcas no se presentaron, así que quedan sin asignar: la mesa
 * se sigue viendo en el 3D —estaba armada— pero sin insignia. Es lo que hace que el recuento
 * de `standsConMarca()` dé los 40 stands reales y no las 42 mesas planificadas. Si vuelven en
 * la próxima edición, alcanza con devolver las dos líneas.
 */
export const MARCA_POR_STAND: Record<string, string> = {
  l1: 'prestagro',
  l2: 'wipclub',
  l3: 'divenuo',
  /* l4: 'ucemax' — baja: no se presentó. */
  l5: 'squads-ventures',
  l6: 'braja-finanzas',
  l7: 'lisaai',

  n1: 'bata',
  n2: 'genosha',
  n3: 'baf',
  n4: 'nomenclator',
  n5: 'crunchloop',
  n6: 'kaizer',
  n7: 'compassguard',

  o1: 'marz',
  o2: 'startups-argentina',
  o3: 'luca',
  o4: 'plaude',
  o5: 'extra',
  o6: 'berry',
  o7: 'gasti',

  p1: 'fluxis',
  p2: 'zettios',
  p3: 'resender',
  p4: 'cobrando',
  p5: 'coworkeando',
  p6: 'piggywallet',
  p7: 'pasito',

  h01: 'tqe',
  h02: 'tuni',
  h03: 'datricas',
  h04: 'fardo',
  h05: 'paisanos',
  h07: 'firstplug',
  h08: 'firmaway',
  h09: 'talopay',
  h10: 'yafu',
  h11: 'certenza',
  /* h13: 'renderahouse' — baja: se dieron de baja antes del evento. */
  h14: 'sof',
  h15: 'nerdearla',
  h16: 'belo',
};

export type StandConMarca = Stand & { marca: MarcaDeStand };

/**
 * Dónde buscar cada marca. Las startups del carrusel primero y los partners después, pero
 * cargados al revés para que una marca que está en las dos listas —Cobrando, Yafu,
 * Coworkeando y Tuni son sponsors *y* startups— se quede con el logo de `SD_STARTUPS`.
 */
const POR_ID = new Map<string, MarcaDeStand>();
const guardar = (m: {
  id: string;
  name: string;
  logoUrl?: string;
  website?: string;
  instagram?: string;
  linkedin?: string;
}) => {
  if (!m.logoUrl) return;
  POR_ID.set(m.id, {
    id: m.id,
    name: m.name,
    logoUrl: m.logoUrl,
    href: m.website || m.instagram || m.linkedin,
  });
};
for (const grupo of [SD_XPLORA_PARTNERS, SD_EDITION_SPONSORS]) for (const m of grupo) guardar(m);
for (const m of SD_STARTUPS) guardar(m);
for (const m of PROPIAS) POR_ID.set(m.id, m);

/** Los stands con marca conocida y logo disponible, con la marca ya resuelta. */
export function standsConMarca(): StandConMarca[] {
  const out: StandConMarca[] = [];
  for (const stand of standsDelPiso()) {
    const id = MARCA_POR_STAND[stand.id];
    const marca = id ? POR_ID.get(id) : undefined;
    if (marca) out.push({ ...stand, marca });
  }
  return out;
}

/** Los stands de una sala, para mostrar sus logos cuando esa sala está señalada. */
export function standsDeSala(salaId: string): StandConMarca[] {
  return standsConMarca().filter((s) => s.sala === salaId);
}

/* ── Todas las marcas del evento ─────────────────────────────────────────────────────────── */

/**
 * Charlas cuyo archivo de logo no coincide con el id de su marca.
 *
 * Una sola: Resender dio charla con `resender-dev.png` (el wordmark con el dominio) pero su
 * stand está bajo el id `resender`. Sin esta equivalencia aparecería dos veces en el slider,
 * una por cada archivo.
 */
const ALIAS_DE_CHARLA: Record<string, string> = {
  'resender-dev': 'resender',
};

/**
 * El id de marca que le corresponde a una charla, deducido de su archivo de logo.
 *
 * Exportada porque `SdCharlas` la necesita para lo mismo que el slider: buscar la corrección de
 * tamaño óptico de esa marca en `startupDayEscalas.ts`, que está indexada por id y no por archivo.
 */
export function idDeCharla(logo: string): string {
  const base = logo.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
  return ALIAS_DE_CHARLA[base] ?? base;
}

/**
 * Todas las marcas que estuvieron, para el slider de `#marcas`.
 *
 * Son dos fuentes y ninguna alcanza sola: el plano tiene las 40 que ocuparon una mesa, y la
 * grilla de charlas suma ocho que dieron workshop sin stand (Derecruiters, Endeavor, FUD,
 * hubeet, Mercado Libre, NEWTOPIA, Picante y uin). Van los stands primero, en orden de
 * recorrido, y las de charla después.
 *
 * Las de charla no están en `SD_STARTUPS`, así que su nombre y su logo salen de `SD_CHARLAS`
 * —que es de donde se muestran en la agenda— y no tienen link: la grilla no guarda sitio web.
 */
export function marcasDelEvento(): MarcaDeStand[] {
  const vistas = new Set<string>();
  const out: MarcaDeStand[] = [];

  for (const stand of standsConMarca()) {
    if (vistas.has(stand.marca.id)) continue;
    vistas.add(stand.marca.id);
    out.push(stand.marca);
  }

  for (const charla of SD_CHARLAS) {
    if (!charla.logo) continue;
    const id = idDeCharla(charla.logo);
    if (vistas.has(id)) continue;
    vistas.add(id);
    /* Si la marca ya existe en las listas de la landing se usa su ficha —trae link—; si no, se
       arma con lo que tiene la charla. */
    const ficha = POR_ID.get(id);
    out.push(
      ficha
        ? { ...ficha, logoEnColor: charla.logoEnColor || ficha.logoEnColor }
        : { id, name: charla.name, logoUrl: LOGO(charla.logo), logoEnColor: charla.logoEnColor },
    );
  }

  return out;
}
