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
  SD_EDITION_SPONSORS,
  SD_STARTUPS,
  SD_XPLORA_PARTNERS,
} from './startupDay';
import { standsDelPiso, type Stand } from './startupDayFloor';

/** Lo mínimo que necesita una insignia del render. */
export type MarcaDeStand = { id: string; name: string; logoUrl: string };

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
 */
export const MARCA_POR_STAND: Record<string, string> = {
  l1: 'prestagro',
  l2: 'wipclub',
  l3: 'divenuo',
  l4: 'ucemax',
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
  h13: 'renderahouse',
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
for (const grupo of [SD_XPLORA_PARTNERS, SD_EDITION_SPONSORS]) {
  for (const m of grupo) if (m.logoUrl) POR_ID.set(m.id, { id: m.id, name: m.name, logoUrl: m.logoUrl });
}
for (const m of SD_STARTUPS) POR_ID.set(m.id, { id: m.id, name: m.name, logoUrl: m.logoUrl });
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
