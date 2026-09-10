/**
 * 2º piso de Av. Alem 882 — geometría para el render 3D.
 *
 * Los muros salen de `docs/piso/plano-2do-piso.png` (980×607 px), el croquis de Excalidraw
 * que el equipo confirmó como fiel a la distribución real. Las mesas y el uso de cada sala
 * salen del plano de montaje posterior, `docs/piso/plano-2do-piso-mesas.png`, que cambió
 * dos cosas: el aula P pasó de depósito a sala de stands y el aula Q hizo lo inverso.
 *
 * Solo se modelan los espacios a los que se entra el día del evento. Sala de estar,
 * Recepción, el depósito chico y el aula Q —que pasó a ser depósito— se sacaron, y con
 * ellos el edificio se recorta: el perímetro deja de ser un rectángulo.
 *
 * Se guarda todo en píxeles del croquis y se convierte a metros con `M_POR_PX`. Si aparece
 * una medida real, se corrige esa constante y el modelo entero se reescala solo.
 *
 * La escala es estimada (placas de cielorraso de 60×60 cm en las fotos de `docs/piso/`),
 * así que el render no muestra ninguna medida en pantalla.
 */

/** Dimensiones del croquis de referencia, en píxeles. */
export const PLANO_PX = { w: 980, h: 607 } as const;

/** Metros por píxel del croquis. Ajustar acá cuando haya medidas reales. */
export const M_POR_PX = 0.037;

/** Altura libre hasta el cielorraso desmontable. */
export const ALTURA_M = 2.7;

/** Espesor de los muros. */
export const MURO_M = 0.14;

export type SalaTipo = 'stands' | 'workshops' | 'nucleo';

/**
 * `abierta` se modela con muros y se ve adentro; `bloqueada` va como volumen macizo con
 * el nombre arriba. Los baños van bloqueados: nadie necesita ver adentro.
 */
export type Acceso = 'abierta' | 'bloqueada';

/** Caras de una sala, para ubicar puertas y ventanales. */
export type Lado = 'norte' | 'sur' | 'este' | 'oeste';

export type Sala = {
  id: string;
  /** Letra o nombre como figura en el croquis. */
  label: string;
  tipo: SalaTipo;
  acceso: Acceso;
  /** Rect en píxeles del croquis. */
  px: { x: number; y: number; w: number; h: number };
  /** Qué pasa en esa sala; se muestra en la referencia al costado del render. */
  nota?: string;
  /**
   * Caras vidriadas. K lleva el ventanal sobre la fachada oeste —suposición tomada de
   * `docs/piso/foto-sala-larga.png`— y el núcleo de ascensores va vidriado sobre sus dos
   * lados cortos, que es donde antes estaban por error las puertas de ascensor.
   */
  vidriado?: readonly Lado[];
  /**
   * Caras cuyo muro real no sigue al rectángulo y se dibujan a mano en `MUROS_SUELTOS_PX`.
   * Sólo las usan O y P, por el vestíbulo que comparten: ver el comentario de esa tabla.
   */
  sinMuro?: readonly Lado[];
};

/** Los 9 espacios que se usan. El uso de cada uno lo dice el plano de montaje. */
export const SALAS: readonly Sala[] = [
  {
    id: 'l',
    label: 'L',
    tipo: 'stands',
    acceso: 'abierta',
    px: { x: 260, y: 8, w: 149, h: 158 },
    nota: '7 stands de startups.',
  },
  {
    id: 'm',
    label: 'M',
    tipo: 'workshops',
    acceso: 'abierta',
    px: { x: 410, y: 8, w: 182, h: 158 },
    nota: 'Acá se hacen los workshops.',
  },
  {
    id: 'n',
    label: 'N',
    tipo: 'stands',
    acceso: 'abierta',
    px: { x: 593, y: 8, w: 191, h: 158 },
    nota: '7 stands de startups.',
  },
  {
    id: 'o',
    label: 'O',
    tipo: 'stands',
    acceso: 'abierta',
    px: { x: 785, y: 8, w: 160, h: 181 },
    nota: '7 stands de startups.',
    /* O es una L, no un rectángulo: el vestíbulo le come la esquina suroeste. */
    sinMuro: ['sur', 'oeste'],
  },
  {
    id: 'k',
    label: 'K',
    tipo: 'workshops',
    acceso: 'abierta',
    px: { x: 42, y: 167, w: 179, h: 296 },
    nota: 'La sala más grande. Workshops y las charlas del día.',
    vidriado: ['oeste'],
  },
  {
    id: 'banos-norte',
    label: 'Baños',
    tipo: 'nucleo',
    acceso: 'bloqueada',
    px: { x: 318, y: 232, w: 245, h: 91 },
  },
  {
    id: 'ascensores',
    label: 'Ascensores',
    tipo: 'nucleo',
    acceso: 'abierta',
    px: { x: 318, y: 324, w: 245, h: 140 },
    vidriado: ['este', 'oeste'],
  },
  /**
   * El aula P deja de ser depósito y pasa a ser sala de stands; el aula Q hace el camino
   * inverso. Es el cambio que trajo `plano-2do-piso-mesas.png`: el volumen del edificio no
   * se mueve, cambia el uso de los dos espacios de la derecha.
   */
  {
    id: 'p',
    label: 'P',
    tipo: 'stands',
    acceso: 'abierta',
    px: { x: 810, y: 190, w: 135, h: 180 },
    nota: '7 stands de startups.',
    /* Su muro norte arranca recién en 831; lo que falta antes es la puerta. */
    sinMuro: ['norte'],
  },
  {
    id: 'banos-sur',
    label: 'Baños',
    tipo: 'nucleo',
    acceso: 'bloqueada',
    px: { x: 392, y: 464, w: 268, h: 133 },
  },
];

export type RectM = { cx: number; cz: number; w: number; d: number };

export function aMetros(px: { x: number; y: number; w: number; h: number }): RectM {
  return {
    cx: (px.x + px.w / 2 - PLANO_PX.w / 2) * M_POR_PX,
    cz: (px.y + px.h / 2 - PLANO_PX.h / 2) * M_POR_PX,
    w: px.w * M_POR_PX,
    d: px.h * M_POR_PX,
  };
}

const mx = (px: number) => (px - PLANO_PX.w / 2) * M_POR_PX;
const mz = (py: number) => (py - PLANO_PX.h / 2) * M_POR_PX;

export function rectDeSala(sala: Sala): RectM {
  return aMetros(sala.px);
}

/**
 * Contorno del edificio recortado, en píxeles del croquis y en sentido horario.
 *
 * Lo que queda tras borrar los espacios que no se usan: K sostiene el borde izquierdo, la
 * fila L–M–N–O el superior, O y P el derecho, y los baños el inferior. Son dos escotaduras
 * sobre los bordes —Sala de estar y Depósito chico—, una más donde estaba Recepción, y el
 * escalón de abajo a la derecha: el borde este baja derecho hasta el muro sur de P y ahí el
 * edificio se corta, porque el aula Q quedó como depósito y no se modela.
 */
const CONTORNO_PX: readonly (readonly [number, number])[] = [
  [258, 8],
  [945, 8],
  [945, 370],
  [743, 370],
  [743, 412],
  [659, 412],
  [659, 599],
  [391, 599],
  [391, 465],
  [42, 465],
  [42, 166],
  [258, 166],
];

/**
 * El piso, en franjas verticales que no se solapan. Se prefirió esta descomposición a mano
 * antes que rasterizar el croquis: rasterizar devolvía 249 rectángulos, muchos de una fila
 * de alto, por lo dentado del borde.
 */
const PISO_PX: readonly { x: number; y: number; w: number; h: number }[] = [
  { x: 42, y: 166, w: 216, h: 299 },
  { x: 258, y: 8, w: 133, h: 457 },
  { x: 391, y: 8, w: 268, h: 591 },
  { x: 659, y: 8, w: 84, h: 404 },
  { x: 743, y: 8, w: 67, h: 362 },
  { x: 810, y: 8, w: 135, h: 362 },
];

/** Bounding box del contorno: encuadre de cámara y mapeo UV de la textura del piso. */
export const HUELLA_PX = (() => {
  const xs = CONTORNO_PX.map((p) => p[0]);
  const ys = CONTORNO_PX.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
})();

export const HUELLA_M = aMetros(HUELLA_PX);

/** Losas del piso en metros. */
export function losasDePiso(): RectM[] {
  return PISO_PX.map(aMetros);
}

/** Un tramo de muro: caja con centro, tamaño, altura y elevación. */
export type Tramo = { cx: number; cz: number; w: number; d: number; alto: number; y: number };

export const PUERTA_ANCHO_M = 1.05;
export const PUERTA_ALTO_M = 2.05;

/**
 * Puertas, definidas a mano: sala, cara y posición sobre esa cara en píxeles del croquis.
 *
 * Antes se asignaban al muro geométricamente más cercano y eso las ponía en la pared
 * equivocada. El caso peor era N y O: sus rombos caen sobre un escalón del croquis que el
 * rectángulo de la sala no reproduce, así que terminaban abriendo la medianera *entre* las
 * dos aulas y ninguna quedaba con entrada desde el pasillo. Con la tabla explícita esa
 * clase de error desaparece.
 *
 * Las aulas de la fila superior repiten el patrón del croquis: puerta sobre el muro sur,
 * contra la medianera con la sala de al lado.
 */
type PuertaDef = { sala: string; lado: Lado; en: number };

const PUERTAS: readonly PuertaDef[] = [
  { sala: 'l', lado: 'sur', en: 268 },
  { sala: 'm', lado: 'sur', en: 418 },
  /**
   * N no da al pasillo: su muro sur va entero en el plano de montaje. Se entra por el
   * tabique con O, que se corta a la altura del vestíbulo. O no lleva puerta de este lado:
   * renunció a su cara oeste, así que el único muro ahí es el de N.
   */
  { sala: 'n', lado: 'este', en: 160 },
  { sala: 'k', lado: 'este', en: 193 },
  { sala: 'k', lado: 'este', en: 448 },
  { sala: 'banos-norte', lado: 'norte', en: 401 },
  { sala: 'banos-norte', lado: 'norte', en: 476 },
  { sala: 'banos-sur', lado: 'norte', en: 644 },
];

export const CANTIDAD_DE_PUERTAS = PUERTAS.length;

function huecosDe(salaId: string, lado: Lado): number[] {
  return PUERTAS.filter((p) => p.sala === salaId && p.lado === lado)
    .map((p) => (lado === 'norte' || lado === 'sur' ? mx(p.en) : mz(p.en)))
    .sort((a, b) => a - b);
}

/** Parte un muro recto en tramos, dejando el hueco de cada puerta y su dintel arriba. */
function tramos(
  fijo: number,
  desde: number,
  hasta: number,
  horiz: boolean,
  huecos: number[],
  alto: number,
): Tramo[] {
  const caja = (a: number, b: number, y: number, h: number): Tramo | null => {
    if (b - a < 0.02 || h <= 0.01) return null;
    const centro = (a + b) / 2;
    return horiz
      ? { cx: centro, cz: fijo, w: b - a, d: MURO_M, alto: h, y }
      : { cx: fijo, cz: centro, w: MURO_M, d: b - a, alto: h, y };
  };

  const out: Tramo[] = [];
  let cursor = desde;
  for (const h of huecos) {
    const a = Math.max(desde, h - PUERTA_ANCHO_M / 2);
    const b = Math.min(hasta, h + PUERTA_ANCHO_M / 2);
    if (b <= cursor) continue;
    const macizo = caja(cursor, Math.max(cursor, a), 0, alto);
    if (macizo) out.push(macizo);
    const dintel = caja(a, b, PUERTA_ALTO_M, alto - PUERTA_ALTO_M);
    if (dintel) out.push(dintel);
    cursor = b;
  }
  const final = caja(cursor, hasta, 0, alto);
  if (final) out.push(final);
  return out;
}

/** Los cuatro muros de una sala abierta, ya con sus aberturas. */
export function murosDeSala(sala: Sala): Tramo[] {
  const { cx, cz, w, d } = rectDeSala(sala);
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  const lleva = (lado: Lado) => !sala.sinMuro?.includes(lado);
  return [
    ...(lleva('norte') ? tramos(z0, x0, x1, true, huecosDe(sala.id, 'norte'), ALTURA_M) : []),
    ...(lleva('sur') ? tramos(z1, x0, x1, true, huecosDe(sala.id, 'sur'), ALTURA_M) : []),
    ...(lleva('oeste') ? tramos(x0, z0, z1, false, huecosDe(sala.id, 'oeste'), ALTURA_M) : []),
    ...(lleva('este') ? tramos(x1, z0, z1, false, huecosDe(sala.id, 'este'), ALTURA_M) : []),
  ];
}

export const SALAS_ABIERTAS = SALAS.filter((s) => s.acceso === 'abierta');
export const SALAS_BLOQUEADAS = SALAS.filter((s) => s.acceso === 'bloqueada');

/** Muro perimetral: un tramo por lado del contorno recortado. */
export function murosPerimetrales(): Tramo[] {
  const out: Tramo[] = [];
  for (let i = 0; i < CONTORNO_PX.length; i++) {
    const [ax, ay] = CONTORNO_PX[i]!;
    const [bx, by] = CONTORNO_PX[(i + 1) % CONTORNO_PX.length]!;
    if (ay === by) {
      const a = mx(Math.min(ax, bx));
      const b = mx(Math.max(ax, bx));
      out.push({ cx: (a + b) / 2, cz: mz(ay), w: b - a + MURO_M, d: MURO_M, alto: ALTURA_M, y: 0 });
    } else {
      const a = mz(Math.min(ay, by));
      const b = mz(Math.max(ay, by));
      out.push({ cx: mx(ax), cz: (a + b) / 2, w: MURO_M, d: b - a + MURO_M, alto: ALTURA_M, y: 0 });
    }
  }
  return out;
}

/**
 * Muros que no salen del rectángulo de ninguna sala.
 *
 * Entre N, O y P el plano tiene un vestíbulo chico: el pasillo se ensancha en un cuadrado de
 * unos 790..832 × 150..192 y de ahí salen las tres puertas. Eso no se arma con rectángulos
 * —la sala O es una L y el vestíbulo le come la esquina suroeste—, así que O y P renuncian a
 * la cara que no les corresponde (`sinMuro`) y los tres paños de alrededor van a mano acá.
 *
 * Las puertas no se marcan: son la ausencia de muro entre un paño y el siguiente. El hueco
 * 815..832 después del primero es la entrada a O, y el 810..831 antes del tercero la de P.
 *
 * Cada entrada es `[x0, y0, x1, y1]` en píxeles del croquis, con un eje fijo.
 */
const MUROS_SUELTOS_PX: readonly (readonly [number, number, number, number])[] = [
  [784, 150, 815, 150],
  [832, 150, 832, 190],
  [831, 190, 945, 190],
];

export function murosSueltos(): Tramo[] {
  return MUROS_SUELTOS_PX.map(([x0, y0, x1, y1]) => {
    if (y0 === y1) {
      const a = mx(x0);
      const b = mx(x1);
      return { cx: (a + b) / 2, cz: mz(y0), w: b - a + MURO_M, d: MURO_M, alto: ALTURA_M, y: 0 };
    }
    const a = mz(y0);
    const b = mz(y1);
    return { cx: mx(x0), cz: (a + b) / 2, w: MURO_M, d: b - a + MURO_M, alto: ALTURA_M, y: 0 };
  });
}

/** Todos los tramos del modelo: perímetro, salas abiertas y los paños del vestíbulo. */
export function todosLosMuros(): Tramo[] {
  return [...murosPerimetrales(), ...SALAS_ABIERTAS.flatMap(murosDeSala), ...murosSueltos()];
}

/**
 * Volumen macizo de una sala bloqueada. Va a la misma altura que los muros: más bajo se
 * leía como una plataforma en medio del piso en vez de como un local cerrado.
 */
export const BLOQUE_ALTO_M = ALTURA_M;

export function bloqueDeSala(sala: Sala): Tramo {
  const { cx, cz, w, d } = rectDeSala(sala);
  return { cx, cz, w, d, alto: BLOQUE_ALTO_M, y: 0 };
}

/**
 * Puertas dibujadas sobre la cara de una sala bloqueada. El volumen es macizo y no puede
 * tener una abertura real, pero sin marcarlas se perdía por dónde se entra a los baños.
 */
export function puertasDeBloque(sala: Sala): Tramo[] {
  if (sala.acceso !== 'bloqueada') return [];
  const { cx, cz, w, d } = rectDeSala(sala);
  const alto = Math.min(PUERTA_ALTO_M, BLOQUE_ALTO_M - 0.1);
  const out: Tramo[] = [];
  for (const lado of ['norte', 'sur'] as const) {
    const z = lado === 'norte' ? cz - d / 2 : cz + d / 2;
    for (const p of huecosDe(sala.id, lado)) {
      out.push({ cx: p, cz: z, w: PUERTA_ANCHO_M, d: 0.06, alto, y: 0 });
    }
  }
  for (const lado of ['oeste', 'este'] as const) {
    const x = lado === 'oeste' ? cx - w / 2 : cx + w / 2;
    for (const p of huecosDe(sala.id, lado)) {
      out.push({ cx: x, cz: p, w: 0.06, d: PUERTA_ANCHO_M, alto, y: 0 });
    }
  }
  return out;
}

/**
 * Puertas de ascensor: dos de cada lado, sobre las caras **norte y sur** del núcleo, que
 * son sus lados largos. Antes estaban en las caras este y oeste; ahí van los paños de
 * vidrio.
 */
export function puertasDeAscensor(): Tramo[] {
  const nucleo = SALAS.find((s) => s.id === 'ascensores');
  if (!nucleo) return [];
  const { cx, cz, w, d } = rectDeSala(nucleo);
  const sep = w / 4;
  const out: Tramo[] = [];
  for (const lado of [-1, 1]) {
    for (const k of [-1, 1]) {
      out.push({
        cx: cx + k * sep,
        cz: cz + (lado * d) / 2,
        w: 1.1,
        d: MURO_M * 1.15,
        alto: 2.15,
        y: 0,
      });
    }
  }
  return out;
}

/** Los paños vidriados de una sala, uno por cara marcada en `vidriado`. */
export function ventanalesDe(sala: Sala): Tramo[] {
  if (!sala.vidriado) return [];
  const { cx, cz, w, d } = rectDeSala(sala);
  const margen = 0.6;
  const alto = ALTURA_M - 0.5;
  return sala.vidriado.map((lado) => {
    if (lado === 'oeste' || lado === 'este') {
      const x = lado === 'oeste' ? cx - w / 2 : cx + w / 2;
      return { cx: x, cz, w: MURO_M * 0.5, d: d - margen, alto, y: 0.25 };
    }
    const z = lado === 'norte' ? cz - d / 2 : cz + d / 2;
    return { cx, cz: z, w: w - margen, d: MURO_M * 0.5, alto, y: 0.25 };
  });
}

/** Columnas: los círculos blancos del croquis. */
const COLUMNAS_PX: readonly { x: number; y: number; d: number }[] = [
  { x: 632, y: 275, d: 54 },
];

export function columnas(): { x: number; z: number; r: number }[] {
  return COLUMNAS_PX.map((c) => ({
    x: mx(c.x + c.d / 2),
    z: mz(c.y + c.d / 2),
    r: (c.d / 2) * M_POR_PX,
  }));
}

/** Mesa de stand, tomada de las fotos: tablón rectangular. */
export const MESA_M = { largo: 1.4, ancho: 0.7, alto: 0.74 } as const;

export type Puesto = { x: number; z: number; rot: number };

/**
 * Las mesas, una por fila.
 *
 * Antes se generaban: siete por sala repartidas parejo sobre el perímetro. Ahora salen del
 * plano de montaje (`docs/piso/plano-2do-piso-mesas.png`), que las trae dibujadas una por
 * una con su identificador. Se guardan igual que el resto del modelo, en píxeles del
 * croquis, y se sacaron midiendo el rectángulo de cada mesa sobre el plano.
 *
 * `rot` es sobre qué eje corre el tablón: `'x'` a lo ancho del croquis, `'z'` a lo alto.
 * El tamaño no se guarda por mesa —todas son la misma `MESA_M`—; el del plano coincide
 * (~36 × 18 px del croquis = 1,33 × 0,67 m).
 *
 * Los identificadores del hall son propios y no los del plano: ahí el plano repite `H08`
 * en seis mesas distintas, así que no sirve como clave.
 */
/**
 * Los tramos de pasillo con mesas.
 *
 * El hall no es una sala —no tiene rectángulo ni muros— y sus dieciséis mesas están repartidas
 * por todo el piso, así que como grupo único no sirve para nada: acercarse a él es acercarse al
 * piso entero. Pero no están desparramadas al azar, se juntan solas en cuatro tramos, y cada uno
 * de esos sí se puede mirar de cerca. El agrupamiento sale de mirar dónde caen en el plano.
 */
export const ZONAS_HALL: readonly { id: string; label: string }[] = [
  { id: 'hall-norte', label: 'Pasillo norte' },
  { id: 'hall-oeste', label: 'Pasillo oeste' },
  { id: 'hall-centro', label: 'Hall central' },
  { id: 'hall-este', label: 'Pasillo este' },
];

type MesaDef = { id: string; sala: string; x: number; y: number; rot: 'x' | 'z' };

const MESAS_PX: readonly MesaDef[] = [
  { id: 'l1', sala: 'l', x: 314, y: 32, rot: 'x' },
  { id: 'l2', sala: 'l', x: 376, y: 32, rot: 'x' },
  { id: 'l3', sala: 'l', x: 396, y: 64, rot: 'z' },
  { id: 'l4', sala: 'l', x: 387, y: 144, rot: 'x' },
  { id: 'l5', sala: 'l', x: 325, y: 144, rot: 'x' },
  { id: 'l6', sala: 'l', x: 396, y: 108, rot: 'z' },
  { id: 'l7', sala: 'l', x: 283, y: 63, rot: 'z' },

  { id: 'n1', sala: 'n', x: 656, y: 32, rot: 'x' },
  { id: 'n2', sala: 'n', x: 731, y: 32, rot: 'x' },
  { id: 'n3', sala: 'n', x: 766, y: 71, rot: 'z' },
  { id: 'n4', sala: 'n', x: 619, y: 111, rot: 'z' },
  { id: 'n5', sala: 'n', x: 661, y: 150, rot: 'x' },
  { id: 'n6', sala: 'n', x: 766, y: 115, rot: 'z' },
  { id: 'n7', sala: 'n', x: 620, y: 68, rot: 'z' },

  { id: 'o1', sala: 'o', x: 849, y: 32, rot: 'x' },
  { id: 'o2', sala: 'o', x: 921, y: 32, rot: 'x' },
  { id: 'o3', sala: 'o', x: 932, y: 68, rot: 'z' },
  { id: 'o4', sala: 'o', x: 901, y: 168, rot: 'x' },
  { id: 'o5', sala: 'o', x: 856, y: 167, rot: 'x' },
  { id: 'o6', sala: 'o', x: 932, y: 121, rot: 'z' },
  { id: 'o7', sala: 'o', x: 813, y: 68, rot: 'z' },

  { id: 'p1', sala: 'p', x: 868, y: 218, rot: 'x' },
  { id: 'p2', sala: 'p', x: 916, y: 219, rot: 'x' },
  { id: 'p3', sala: 'p', x: 934, y: 281, rot: 'z' },
  { id: 'p4', sala: 'p', x: 934, y: 323, rot: 'z' },
  { id: 'p5', sala: 'p', x: 896, y: 355, rot: 'x' },
  { id: 'p6', sala: 'p', x: 847, y: 355, rot: 'x' },
  { id: 'p7', sala: 'p', x: 832, y: 296, rot: 'z' },

  { id: 'h01', sala: 'hall-norte', x: 352, y: 186, rot: 'x' },
  { id: 'h02', sala: 'hall-norte', x: 462, y: 187, rot: 'x' },
  { id: 'h03', sala: 'hall-norte', x: 524, y: 187, rot: 'x' },
  { id: 'h04', sala: 'hall-norte', x: 667, y: 187, rot: 'x' },
  { id: 'h05', sala: 'hall-norte', x: 723, y: 187, rot: 'x' },
  /* Las tres del pasillo van contra el muro oeste de P. El plano las dibuja pisándolo unos
     centímetros; acá se corren a 799 para que apoyen contra el muro y no lo atraviesen. */
  { id: 'h06', sala: 'hall-este', x: 799, y: 247, rot: 'z' },
  { id: 'h07', sala: 'hall-oeste', x: 239, y: 255, rot: 'z' },
  { id: 'h08', sala: 'hall-centro', x: 658, y: 266, rot: 'x' },
  { id: 'h09', sala: 'hall-centro', x: 581, y: 281, rot: 'z' },
  { id: 'h10', sala: 'hall-este', x: 799, y: 283, rot: 'z' },
  { id: 'h11', sala: 'hall-centro', x: 708, y: 308, rot: 'z' },
  { id: 'h12', sala: 'hall-este', x: 799, y: 319, rot: 'z' },
  { id: 'h13', sala: 'hall-oeste', x: 238, y: 366, rot: 'z' },
  { id: 'h14', sala: 'hall-centro', x: 733, y: 383, rot: 'z' },
  { id: 'h15', sala: 'hall-centro', x: 679, y: 398, rot: 'x' },
  { id: 'h16', sala: 'hall-centro', x: 604, y: 454, rot: 'x' },
];

/**
 * Un stand: la mesa ya en metros, con el id con el que se le cuelga una marca. El mapeo
 * stand → startup vive aparte, en `startupDayStands.ts`: acá sólo está la geometría.
 */
export type Stand = Puesto & { id: string; sala: string };

/** Todos los stands del piso, en el orden en que están escritos arriba. */
export function standsDelPiso(): Stand[] {
  return MESAS_PX.map((m) => ({
    id: m.id,
    sala: m.sala,
    x: mx(m.x),
    z: mz(m.y),
    rot: m.rot === 'x' ? 0 : Math.PI / 2,
  }));
}

/** Los puestos para el mobiliario: los stands, sin la parte de identidad. */
export function todosLosPuestos(): Puesto[] {
  return standsDelPiso();
}

/** Cuántas mesas tiene una sala o un tramo de pasillo. */
export function mesasDeSala(salaId: string): number {
  return MESAS_PX.filter((m) => m.sala === salaId).length;
}

/**
 * El rectángulo que representa a un grupo: una sala o un tramo de pasillo.
 *
 * Para una sala es su propio rectángulo, y `aire` no lo toca. Para un tramo no hay muros de
 * donde sacarlo, así que se arma con la caja de sus mesas, ensanchada media mesa —para que
 * ninguna quede cortada al ras— más el `aire` que pida quien llama.
 *
 * Ese parámetro existe porque los dos usos quieren cosas distintas. La cámara necesita aire
 * alrededor o el tramo entra pegado al borde del cuadro. La caja del puntero y el realce del
 * piso lo necesitan **mínimo**: con un metro de aire el tramo central se superpone con los
 * baños y los ascensores y les roba el hover, porque su caja les pisa encima.
 *
 * Los tramos de una sola fila —el pasillo norte son cinco mesas en línea— quedarían con un
 * lado de casi cero, así que hay un mínimo por lado.
 */
export function rectEnfocable(id: string, aire = 1): RectM | null {
  const sala = SALAS.find((s) => s.id === id);
  if (sala) return rectDeSala(sala);

  const mesas = MESAS_PX.filter((m) => m.sala === id);
  if (mesas.length === 0) return null;

  const xs = mesas.map((m) => mx(m.x));
  const zs = mesas.map((m) => mz(m.y));
  const margen = MESA_M.largo / 2 + aire;
  const MINIMO = 3.5;
  const w = Math.max(MINIMO, Math.max(...xs) - Math.min(...xs) + margen * 2);
  const d = Math.max(MINIMO, Math.max(...zs) - Math.min(...zs) + margen * 2);
  return {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cz: (Math.min(...zs) + Math.max(...zs)) / 2,
    w,
    d,
  };
}

/** Qué se hace en la sala — reemplaza a mostrar medidas. */
export function detalleDe(sala: Sala): string {
  if (sala.tipo === 'stands') {
    const n = mesasDeSala(sala.id);
    return n + (n === 1 ? ' stand' : ' stands');
  }
  if (sala.tipo === 'workshops') return 'Workshops';
  return 'Servicios';
}
