/**
 * Recap de la primera edición — el único archivo a tocar para cambiar números o copy.
 *
 * Regla del módulo: **si un número se puede derivar de los datos, se deriva.** Las charlas salen
 * de la grilla, los stands del plano de montaje, las aulas y el horario de los mismos datos que
 * usa la agenda. Un número escrito a mano acá que ya viva en otro lado se desfasa solo — es lo
 * que pasó con la fecha del evento (ver el comentario de `SD_EVENT.dateISO`).
 *
 * La asistencia es la única excepción, porque no está en ninguna parte del repo.
 */
import { LOGO, SD_CHARLAS, SD_EVENT, SD_STANDS } from './startupDay';
import { standsConMarca } from './startupDayStands';

/**
 * Asistentes a la primera edición.
 *
 * El único dato del recap que no sale de los otros módulos: no hay registro de asistencia en el
 * repo, lo pasó la organización. Se muestra como `+500` —ver `prefix` en `statsDelRecap()`— y no
 * como un número exacto, porque es un piso redondeado y no un conteo de puerta.
 *
 * En `null` la métrica no se muestra, en vez de mentir un 0.
 */
export const SD_ASISTENTES: number | null = 500;

/**
 * Stands que finalmente ocuparon una mesa.
 *
 * Sale del plano y no de una constante a mano, y da 40 porque el plano ya no le asigna mesa a
 * las dos marcas que se dieron de baja (Renderahouse y UCEMA Xplora, ver `MARCA_POR_STAND`).
 * El número cuadra por los dos lados: 42 mesas dibujadas − 2 bajas = 40, que es el mismo total
 * que sale de contar la lista de marcas que efectivamente estuvieron.
 *
 * Una marca con dos mesas cuenta una sola vez.
 */
function marcasConStand(): number {
  return new Set(standsConMarca().map((s) => s.marca.id)).size;
}

export type SdStat = {
  id: string;
  value: number;
  /**
   * Va delante del número, sin espacio: `+` + `500`.
   *
   * Campo aparte y no parte de `value` porque `Counter` anima el número de 0 al valor final;
   * concatenarle el signo lo volvería string y no habría nada que contar.
   */
  prefix?: string;
  /** Se pega al número sin espacio: `5` + `h`. */
  suffix?: string;
  label: string;
};

/**
 * Los tres números del recap, en el orden en que se muestran.
 *
 * Son tres y no seis a propósito. Estaban además las aulas, las horas de piso abierto y los
 * sponsors: datos ciertos, pero que a esa escala convertían el bloque en una planilla y le
 * quitaban peso justamente a los que valen. Los tres que quedan son los que alguien repite
 * después de leer la página. El resto del dato sigue en su sección (el horario en la agenda,
 * las aulas en el piso, los sponsors en su banda).
 *
 * Devuelve una función y no una constante porque `marcasConStand()` recorre el plano entero:
 * así el costo se paga cuando la sección se renderiza y no al importar el módulo.
 */
export function statsDelRecap(): SdStat[] {
  const stats: SdStat[] = [];
  if (SD_ASISTENTES !== null) {
    stats.push({ id: 'asistentes', value: SD_ASISTENTES, prefix: '+', label: 'Asistentes' });
  }
  stats.push(
    /* El número sale de los stands del plano; el label dice "Startups" porque es lo que ocupaba
       cada mesa. Las ocho marcas que sólo dieron charla no cuentan acá —no tuvieron stand— pero
       sí aparecen en el slider de `#marcas`. */
    { id: 'stands', value: marcasConStand(), label: 'Startups' },
    { id: 'charlas', value: SD_CHARLAS.length, label: 'Charlas y workshops' },
  );
  return stats;
}

/* ── Próxima edición ─────────────────────────────────────────────────────────────────────── */

/**
 * Mismo día del año siguiente, calculado y no escrito.
 *
 * Se arma con `Date.UTC` sobre las partes de `SD_EVENT.dateISO` en vez de `new Date(iso)` +
 * `setFullYear`: lo segundo interpreta el ISO como UTC pero después opera en hora local, así
 * que en cualquier huso al oeste de Greenwich —el nuestro— el resultado retrocede un día.
 */
function unAnioDespues(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const siguiente = new Date(Date.UTC(y + 1, m - 1, d));
  return siguiente.toISOString().slice(0, 10);
}

export const SD_PROXIMA_EDICION_ISO = unAnioDespues(SD_EVENT.dateISO);

/**
 * El instante al que apunta el contador: la fecha de arriba a las 15:00 de Buenos Aires, que
 * es la hora a la que abrió la primera edición (`SD_STANDS.from`).
 *
 * El `-03:00` va escrito a mano a propósito. Argentina no tiene horario de verano desde 2009,
 * así que el offset es fijo; dejárselo al huso del visitante haría que el contador marcara
 * distinto en Madrid que en Buenos Aires para el mismo evento.
 */
export const SD_PROXIMA_EDICION_TS = Date.parse(
  `${SD_PROXIMA_EDICION_ISO}T${SD_STANDS.from.padStart(2, '0')}:00:00-03:00`,
);

/* No hay un `SD_PROXIMA_EDICION_LABEL` con la fecha en prosa a propósito: la fecha todavía no
   está cerrada, y ninguna pieza de la UI debe afirmarla. El contador la usa como blanco interno
   (`SD_PROXIMA_EDICION_TS`) para saber cuántos días faltan, pero lo que se muestra es "fecha a
   confirmar". Si se confirma, acá va el label y se reponen las menciones. */

/* ── Copy ────────────────────────────────────────────────────────────────────────────────── */

/**
 * El texto del recap, que vive dentro de la lámina "No importa quién sos" (`SdManifesto`).
 *
 * El titular de esa lámina se escribió para invitar a un evento que todavía no había pasado.
 * Sigue siendo el titular —es el que define la sección— pero ahora entra por abajo: lo que se
 * lee primero es que el evento ya fue, y la frase queda como el remate de lo que pasó.
 */
export const SD_RECAP = {
  kicker: 'Primera edición · 11.09.2026',
  lede:
    'Cinco horas, un piso entero y gente construyendo en cada mesa. Stands abiertos de punta ' +
    'a punta, dos aulas en paralelo y conversaciones que siguieron mucho después de la última ' +
    'charla. Esto fue el Startup Day.',
} as const;

/* ── Media partners ──────────────────────────────────────────────────────────────────────── */

/**
 * Quiénes registraron el evento.
 *
 * `logoUrl` es opcional a propósito, igual que en `StartupDayPartner`: hoy ninguno de los tres
 * tiene archivo en el repo y la card cae al nombre en tipografía, sin dejar un hueco esperando
 * una imagen. Cuando lleguen los logos alcanza con sumar la ruta acá.
 *
 * Falta uno a pedido: hubo un cuarto media partner que sacó fotos e hizo video, y que pidió no
 * figurar. Su material es el que alimenta la galería de `SdMedia` — por eso la galería no lleva
 * crédito al pie.
 */
export type SdMediaPartner = {
  id: string;
  name: string;
  /** Qué hizo, en una línea. */
  aporte: string;
  logoUrl?: string;
  /** Pieza destacada, si la hay. */
  video?: { url: string; titulo: string; miniatura: string };
};

export const SD_MEDIA_PARTNERS: readonly SdMediaPartner[] = [
  {
    id: 'botr',
    name: 'BOTR',
    aporte: 'Cubrieron el piso stand por stand: un video por cada equipo.',
    logoUrl: LOGO('botr.webp'),
    video: {
      url: 'https://www.youtube.com/watch?v=t_V-8BoHwPw',
      titulo: 'Builders Off The Record en el Startup Day',
      miniatura: '/media/startup-day/botr-recap.jpg',
    },
  },
  {
    id: 'sla',
    name: 'SLA',
    aporte: 'Salieron a preguntar en qué invertirían cien mil dólares.',
    logoUrl: LOGO('sla.webp'),
    video: {
      url: 'https://www.youtube.com/watch?v=C_4m-SJjxOE',
      titulo: '¿En qué invertirías los 100k?',
      /* La miniatura se guarda local en vez de pedírsela a `img.youtube.com` en cada visita: un
         dominio de Google menos en la cascada y una dependencia externa menos que se puede caer. */
      miniatura: '/media/startup-day/sla-100k.jpg',
    },
  },
  {
    id: '1964',
    name: '1964 Agency',
    aporte: 'Fotografía del evento.',
    logoUrl: LOGO('1964.webp'),
  },
];
