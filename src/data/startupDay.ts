/** Contenido y datos del funnel Startup Day (startupday.xploraucema.com). */

export type StartupDayCompany = {
  id: string;
  name: string;
  logoUrl: string;
  /** Texto corto para destacadas; opcional en el carrusel. */
  blurb?: string;
  featured?: boolean;
  website?: string;
  linkedin?: string;
  instagram?: string;
};

export type StartupDayPartner = {
  id: string;
  name: string;
  role: string;
  blurb: string;
  logoUrl?: string;
  /** `icon` achica el logo cuando es un isotipo cuadrado en vez de un wordmark. */
  logoVariant?: 'icon';
  website?: string;
  linkedin?: string;
  instagram?: string;
};

/** Ruta pública de un logo. El `?v=` es el cache-buster; vive acá y sólo acá. */
export const LOGO = (file: string) => `/logos/startup-day/${file}?v=20`;

export const SD_EVENT = {
  title: 'Startup Day',
  dateLabel: '11 de septiembre de 2026',
  /* La misma fecha en ISO, para los `<time dateTime>` de la agenda. Va acá y no hardcodeada en
     el componente porque justamente así se desfasó: el markup decía `2026-09-09` mientras todo
     lo visible decía 11 de septiembre. */
  dateISO: '2026-09-11',
  timeLabel: '15 a 20 hs',
  address: 'Av. Alem 882',
  addressFull: 'Av. Alem 882, Ciudad de Buenos Aires · UCEMA',
  priceLabel: '100% gratuito',
} as const;

/**
 * Formulario de registro (Microsoft Forms). Reemplazó al evento de Luma; el
 * `utm_source=landing_xplora` viene en el link que pasó el cliente y se respeta tal cual.
 *
 * SIN USO desde que cerró la primera edición: el formulario ya no acepta altas y todos los CTAs
 * de la landing apuntan ahora a `#proxima`, que guarda el mail en `startup_day_waitlist`. Se
 * conserva —y no se borra— porque la segunda edición va a necesitar un formulario igual; cuando
 * llegue, cambiar la URL acá vuelve a encender todo el circuito de `utm_content`.
 */
export const SD_INSCRIPCION_URL =
  'https://forms.cloud.microsoft/pages/responsepage.aspx?id=yaQFTVUvhUiT0rJ70z_PtqvSxeN6YjNAlnGbKtc1zLxUNUZDRDVNNDFNSVc3RFVHSDROMFNYRVc4TC4u&utm_source=landing_xplora';

/**
 * Link al formulario con el origen del click. `placement` identifica desde qué botón salió la
 * visita (`hero`, `nav`, `agenda`, `inscripcion`…) y viaja como `utm_content`.
 */
export function sdInscripcionUrl(placement: string): string {
  const url = new URL(SD_INSCRIPCION_URL);
  url.searchParams.set('utm_content', placement);
  return url.toString();
}

/** Teaser de StartupMate — todavía sin CTA, se presenta en el evento. */
export const SD_STARTUPMATE = {
  kicker: 'Próximamente',
  name: 'StartupMate',
  tagline: 'El Tinder de cofounders',
  lead:
    'Un lugar para encontrar con quién fundar: perfiles, intereses y match entre gente que está buscando equipo para arrancar.',
  note: 'Lo presentamos en el Startup Day',
} as const;

/**
 * Pantalla “en construcción”. En `false` la landing está publicada; volver a `true` la tapa de
 * nuevo sin perder nada. Con el gate activo el bypass es `?preview=1` en la URL.
 */
export const SD_COMING_SOON = false;

/**
 * Agenda bloqueada. Mientras esté en `true` la sección muestra “Agenda próximamente” en vez de
 * la grilla. Se publicó con las charlas de `SD_CHARLAS` confirmadas; volver a `true` la vuelve
 * a tapar sin perder los datos.
 */
/* SIN USO desde que la grilla horaria (`StartupDayAgenda`) se reemplazó por `SdCharlas`: pasado
   el evento no hay agenda que tapar. Se conserva para cuando vuelva a haber uno. */
export const SD_AGENDA_LOCKED = false;

/**
 * Experiencia Startup Day — el título y las cuatro filas del acordeón de `SdExperiencia`.
 *
 * Sin `kicker`: la sección arranca directo en el título. El horario no vive acá sino en
 * `SD_STANDS`, que ya lo comparte con la agenda — así no puede quedar desfasado entre las dos.
 */
export const SD_DAY_STORY = {
  title: 'La experiencia',
  pillars: [
    {
      tag: 'Stands',
      text: 'El espacio estuvo activo de 15 a 20 hs. Se recorrían los stands, se conversaba con los equipos y se volvía las veces que hiciera falta.',
    },
    {
      tag: 'Startups',
      text: 'Equipos en etapa temprana buscando capital y compañías más consolidadas, respondiendo cómo construyeron producto, equipo y tracción.',
    },
    {
      tag: 'Workshops',
      text: 'Sesiones con empresas tecnológicas de referencia: producto, comercialización y operación. Contenido aplicable, no solo expositivo.',
    },
    {
      tag: 'Networking',
      text: 'Founders, inversores y aceleradoras en el mismo lugar y horario. Conversaciones directas, muchas de ellas fuera de agenda.',
    },
  ],
} as const;

/**
 * Las dos salas de workshops del 2º piso. Los ids son los mismos que en `SALAS`
 * (`startupDayFloor.ts`), donde M es "Acá se hacen los workshops" y K "la sala más grande".
 */
export const SD_AULAS = [
  { id: 'k', label: 'Aula K' },
  { id: 'm', label: 'Aula M' },
] as const;

export type SdAula = (typeof SD_AULAS)[number]['id'];

/**
 * Una charla de la grilla.
 *
 * `from`/`to` alimentaban la grilla horaria de `StartupDayAgenda`, que se fue al pasar la página
 * a recap: un itinerario sirve antes del evento, no después. Se conservan porque siguen ordenando
 * la lista y porque la próxima edición va a querer su agenda de vuelta.
 */
export type SdCharla = {
  aula: SdAula;
  /** HH:MM en 24h, dentro de la ventana 15:30 — 20:00 que dibuja el riel. */
  from: string;
  to: string;
  name: string;
  /**
   * Quién da la charla. La grilla lo muestra entre el logo y el horario: es el dato que
   * distingue una fila de otra cuando dos marcas comparten franja, y sin él la card sólo dice
   * "esta empresa habla en algún momento".
   */
  speaker?: string;
  /** Archivo dentro de `/logos/startup-day/`. Sin él la card cae al punto violeta. */
  logo?: string;
  /**
   * De qué se habló, en frases sueltas.
   *
   * Sin esto la card muestra sólo la empresa y quién habló, que es lo correcto mientras el
   * resumen no exista: son charlas reales de gente real, y escribir de qué hablaron sin saberlo
   * les pone en la boca algo que no dijeron. El dato lo tiene que pasar la organización.
   */
  temas?: readonly string[];
  /**
   * Deja el logo en su color en vez de aplanarlo a blanco.
   *
   * La card normaliza los logos con `brightness(0) invert(1)`, que respeta el alfa y sirve para
   * cualquier wordmark. Pero una marca pictórica maciza —sin detalle interno— se aplana a una
   * silueta blanca y deja de leerse: ahí hace falta el color. Es una propiedad del archivo, no
   * una decisión de diseño por charla.
   */
  logoEnColor?: boolean;
};

/**
 * La grilla del día. Reemplazó a un borrador de una sola pista donde 6 de 10 filas decían
 * "Stands abiertos": el evento son dos aulas en paralelo.
 *
 * Falta el archivo de logo de FUD. Cuando esté en `src/public/logos/startup-day/` alcanza con
 * sumarle la clave `logo:` acá; mientras tanto esa fila cae al nombre en texto.
 */
/* Ojo con qué archivo se elige: la card los pinta con `brightness(0) invert(1)`, que sólo
   funciona sobre PNG/WebP con alfa. `endeavor.webp` viene sin canal alfa y salía como un
   rectángulo blanco; `resender.png` es el ícono cuadrado y no el wordmark; y `derecruiters.png`
   llegó con fondo negro macizo, así que se le quitó con `ffmpeg -vf colorkey`. */
export const SD_CHARLAS: readonly SdCharla[] = [
  /* La única con `temas` por ahora: es el resumen que pasó la organización. Las otras trece
     esperan el suyo — ver el comentario del campo. */
  {
    aula: 'k',
    from: '15:30',
    to: '16:15',
    name: 'Derecruiters',
    speaker: 'Alan Gosiker',
    logo: 'derecruiters.png',
    temas: [
      'Qué se mira hoy en el mercado',
      'Qué hace un forward deployed engineer',
      'Cómo contratan las startups',
      'Qué miran en tu CV',
    ],
  },
  { aula: 'k', from: '16:15', to: '16:45', name: 'First Plug', speaker: 'Santiago Sucari', logo: 'firstplug.png' },
  { aula: 'k', from: '16:45', to: '17:15', name: 'uin', speaker: 'Manuel Heredia', logo: 'uin.png' },
  {
    aula: 'k',
    from: '17:30',
    to: '18:15',
    name: 'NEWTOPIA',
    speaker: 'Maika Basavilbasoh & Juan de Ezcurra',
    logo: 'newtopia.png',
  },
  { aula: 'k', from: '18:15', to: '18:45', name: 'Pasito', speaker: 'Santiago Schamberg', logo: 'quien/pasito.png' },
  {
    aula: 'k',
    from: '18:45',
    to: '19:15',
    name: 'Meli',
    speaker: 'Carolina Lamas',
    logo: 'mercado-libre.png',
    logoEnColor: true,
  },
  { aula: 'k', from: '19:15', to: '20:00', name: 'Belo', speaker: 'Edwin Rager', logo: 'belo.png' },

  { aula: 'm', from: '15:30', to: '16:15', name: 'Endeavor', speaker: 'Martina Laufer', logo: 'endeavor.png' },
  { aula: 'm', from: '16:15', to: '17:00', name: 'Nerdearla', speaker: 'Ariel Jolo', logo: 'nerdearla.png' },
  { aula: 'm', from: '17:00', to: '17:45', name: 'TQe', speaker: 'Pablo Mazzitelli', logo: 'tqe.webp' },
  { aula: 'm', from: '17:45', to: '18:30', name: 'Picante', speaker: 'Federico Ades', logo: 'picante.png' },
  { aula: 'm', from: '18:30', to: '19:00', name: 'hubeet', speaker: 'Gustavo Benítez', logo: 'hubeet.png' },
  { aula: 'm', from: '19:00', to: '19:15', name: 'FUD', speaker: 'Marcos Lanzani', logo: 'fud.png' },
  { aula: 'm', from: '19:30', to: '20:00', name: 'Resender', speaker: 'Lorna Suriano', logo: 'resender-dev.png' },
];

export const SD_STANDS = {
  from: '15',
  to: '20',
  label: 'Stands',
  note: 'Abiertos todo el horario',
} as const;

/**
 * Catálogo de marcas — logos normalizados en `/logos/startup-day/*.webp`.
 *
 * Ya no es "las confirmadas" de la landing previa al evento: desde el recap esta lista sólo
 * resuelve nombre + logo + link para las insignias del piso 3D (`startupDayStands.ts`), y quién
 * estuvo realmente lo define `MARCA_POR_STAND`, no este array. Por eso siguen acá marcas que no
 * se presentaron (Renderahouse, Talentum) o que compartieron mesa con otra (Referent con Squads
 * Ventures, Stellar con BAF): no aparecen en ningún lado hasta que el plano les asigne una mesa,
 * y si vuelven en la próxima edición el asset ya está.
 */
export const SD_STARTUPS: StartupDayCompany[] = [
  {
    id: 'pasito',
    name: 'Pasito',
    logoUrl: LOGO('pasito.png'),
    featured: true,
    blurb:
      'Producto en mercado. Van a contar cómo armaron equipo, distribución y ritmo de crecimiento desde Argentina.',
    website: 'https://www.pasito.app/',
  },
  {
    id: 'tqe',
    name: 'TQe',
    logoUrl: LOGO('tqe.webp'),
    featured: true,
    blurb:
      'Stand + workshop. Van a bajar método de producto, go-to-market y cómo escalan operación.',
    website: 'https://www.tqe.com.ar/',
  },
  {
    id: 'sof',
    name: 'Satellites on Fire',
    logoUrl: LOGO('satellites-on-fire.webp'),
    featured: true,
    blurb:
      'Stand + workshop. Tech de alto crecimiento: fundraising, equipo y cómo construyen producto.',
    website: 'https://www.satellitesonfire.com/',
  },
  {
    id: 'marz',
    name: 'Marz',
    logoUrl: LOGO('marz.webp'),
    featured: true,
    blurb: 'Equipo en pleno funcionamiento. Preguntales cómo priorizan roadmap y ventas.',
    website: 'https://www.go-marz.com/',
  },
  {
    id: 'datricas',
    name: 'Datricas',
    logoUrl: LOGO('datricas.png'),
    blurb: 'Datos y producto. Stand abierto para hablar de stack y tracción.',
    website: 'https://www.datricas.com/',
  },
  {
    id: 'nomenclator',
    name: 'Nomenclator',
    logoUrl: LOGO('nomenclator.webp'),
    blurb: 'Equipo construyendo en serio. Vení a preguntar por proceso y métricas.',
    website: 'https://www.nomenclator.com.ar/',
  },
  {
    id: 'talentum',
    name: 'Talentum',
    logoUrl: LOGO('talentum.webp'),
    blurb: 'Confirmados. Stand para hablar de hiring, cultura y escala.',
    website: 'https://talentumjobs.com/',
  },
  { id: 'fardo', name: 'Fardo', logoUrl: LOGO('fardo.png'), website: 'https://www.heyfardo.com/' },
  {
    id: 'cobrando',
    name: 'Cobrando',
    logoUrl: LOGO('cobrando.png'),
    website: 'https://cobrando.app/',
  },
  { id: 'plaude', name: 'Plaude', logoUrl: LOGO('plaude.png'), website: 'https://plaude.com/' },
  { id: 'kaizer', name: 'Kaizer', logoUrl: LOGO('kaizer.png'), website: 'https://kaizer.app/' },
  {
    id: 'piggywallet',
    name: 'Piggy Wallet',
    logoUrl: LOGO('piggywallet.png'),
    website: 'https://www.piggywallet.app/',
  },
  { id: 'bata', name: 'Bata', logoUrl: LOGO('bata.png'), website: 'https://bataedu.com/' },
  {
    id: 'compassguard',
    name: 'Compass',
    logoUrl: LOGO('compassguard.png'),
    website: 'https://compassguard.xyz/',
  },
  { id: 'paisanos', name: 'Paisanos', logoUrl: LOGO('paisanos.png'), website: 'https://www.paisanos.io/' },
  { id: 'gasti', name: 'Gasti', logoUrl: LOGO('gasti.png'), website: 'https://gasti.pro/' },
  { id: 'yafu', name: 'Yafu', logoUrl: LOGO('yafu.png'), website: 'https://yafu.app/' },
  { id: 'berry', name: 'Berry', logoUrl: LOGO('berry.png'), website: 'https://berry.app/' },
  {
    id: 'certenza',
    name: 'Certenza',
    logoUrl: LOGO('certenza.png'),
    website: 'https://certenza.com/',
  },
  { id: 'tuni', name: 'Tuni', logoUrl: LOGO('tuni.webp'), website: 'https://www.tuni.com.ar/' },
  {
    id: 'coworkeando',
    name: 'Coworkeando',
    logoUrl: LOGO('coworkeando.png'),
    website: 'https://www.coworkeando.com/',
  },
  { id: 'zettios', name: 'Zettios', logoUrl: LOGO('zettios.png'), website: 'https://www.zettios.com/' },
  { id: 'resender', name: 'Resender', logoUrl: LOGO('resender.png'), website: 'https://resender.dev/' },
  {
    id: 'wipclub',
    name: 'WIP Club',
    logoUrl: LOGO('wipclub.png'),
    instagram: 'https://www.instagram.com/wipclub.bsas/',
  },
  {
    id: 'startups-argentina',
    name: 'Startups Argentina',
    logoUrl: LOGO('startups-argentina.png'),
    website: 'https://www.startupsargentina.com/',
  },
  { id: 'fluxis', name: 'Fluxis', logoUrl: LOGO('fluxis.png'), website: 'https://fluxis.us/' },
  { id: 'divenuo', name: 'diVenuo', logoUrl: LOGO('divenuo.png'), website: 'https://divenuo.com/' },
  {
    id: 'prestagro',
    name: 'Prestagro',
    logoUrl: LOGO('prestagro.png'),
    website: 'https://prestagro.com.ar/',
  },
  /** Único asset disponible: el export monocromo del key art, ya en blanco sobre transparente. */
  { id: 'firmaway', name: 'Firmaway', logoUrl: LOGO('firmaway.svg') },
  /* Las tres llegaron sólo en versión monocroma clara, que sirve igual para las dos bandas
     oscuras donde aparecen (el carrusel de confirmadas y "Para quién es"). */
  { id: 'uin', name: 'UIN', logoUrl: LOGO('uin.png'), website: 'https://uin.tech/' },
  { id: 'extra', name: 'Extra', logoUrl: LOGO('extra.png'), website: 'https://extra.com.ar/' },
  { id: 'firstplug', name: 'First Plug', logoUrl: LOGO('firstplug.png'), website: 'https://firstplug.co/' },
  { id: 'squads-ventures', name: 'Squads Ventures', logoUrl: LOGO('squads-ventures.png') },
  { id: 'lisaai', name: 'Lisa AI', logoUrl: LOGO('lisaai.png') },
  { id: 'renderahouse', name: 'Renderahouse', logoUrl: LOGO('renderahouse.png') },
  { id: 'talopay', name: 'Talopay', logoUrl: LOGO('talopay.png') },
  { id: 'braja-finanzas', name: 'Brajá Finanzas', logoUrl: LOGO('braja-finanzas.png') },
  { id: 'luca', name: 'Luca Money', logoUrl: LOGO('luca.png') },
  { id: 'belo', name: 'Belo', logoUrl: LOGO('belo.png') },
  { id: 'crunchloop', name: 'Crunchloop', logoUrl: LOGO('crunchloop.png') },
  { id: 'genosha', name: 'Genosha', logoUrl: LOGO('genosha.png') },
  { id: 'nerdearla', name: 'Nerdearla', logoUrl: LOGO('nerdearla.png') },
  { id: 'stellar', name: 'Stellar', logoUrl: LOGO('stellar.png') },
  { id: 'baf', name: 'BAF', logoUrl: LOGO('baf.png') },
  { id: 'referent', name: 'Referent', logoUrl: LOGO('referent.png') },
];

/**
 * Sponsors de la primera edición.
 *
 * OJO con la variante del logo: esta sección se renderiza sobre banda **cream**
 * (`sd-band--cream`) y sin tile de fondo, así que acá van los logos **oscuros**.
 * Los mismos cuatro aparecen además en el carrusel de confirmadas, que es banda
 * ink y usa las versiones claras. Por eso hay dos archivos por marca.
 */
export const SD_EDITION_SPONSORS: StartupDayPartner[] = [
  {
    id: 'yafu',
    name: 'Yafu',
    logoUrl: LOGO('yafu-dark.png'),
    role: 'Sponsor de la primera edición',
    blurb: 'Sponsor de Startup Day y startup confirmada en el piso.',
    website: 'https://yafu.app/',
  },
  {
    id: 'coworkeando',
    name: 'Coworkeando',
    logoUrl: LOGO('coworkeando-dark.svg'),
    role: 'Sponsor de la primera edición',
    blurb: 'Sponsor de Startup Day y startup confirmada en el piso.',
    website: 'https://www.coworkeando.com/',
  },
  {
    id: 'cobrando',
    name: 'Cobrando',
    logoUrl: LOGO('cobrando.png'),
    role: 'Sponsor de la primera edición',
    blurb: 'Sponsor de Startup Day y startup confirmada en el piso.',
    website: 'https://cobrando.app/',
  },
];

export const SD_XPLORA_PARTNERS: StartupDayPartner[] = [
  {
    id: 'tuni',
    name: 'TUNI',
    logoUrl: LOGO('tuni.webp'),
    role: '',
    blurb: '',
  },
  {
    id: 'ucemax',
    name: 'UCEMA X',
    logoUrl: LOGO('ucemax.png'),
    role: '',
    blurb: '',
    website: 'https://ucema.edu.ar/educacion-ejecutiva/programas-ejecutivos',
  },
  {
    id: 'humming',
    name: 'HUMMING AIRWAYS',
    logoUrl: LOGO('humming.png'),
    role: '',
    blurb: '',
    website: 'https://www.hummingairways.com/',
  },
];

export const SD_XPLORA_SOCIALS = {
  instagram: (import.meta.env.VITE_INSTAGRAM_URL as string | undefined)?.trim() ||
    'https://www.instagram.com/xplora_ucema/',
  linkedin: (import.meta.env.VITE_LINKEDIN_URL as string | undefined)?.trim() ||
    'https://www.linkedin.com/company/emprendedores-ucema/',
  whatsapp: (import.meta.env.VITE_WHATSAPP_URL as string | undefined)?.trim() ||
    'https://tr.ee/9sGklsuv4n',
  site: 'https://xploraucema.com/',
} as const;

export const SD_XPLORA_ABOUT = {
  what: 'Organización estudiantil de la Universidad del CEMA, por y para emprendedores. Abrimos el ecosistema a estudiantes de UCEMA y de toda la Argentina.',
  mission:
    'Que más gente pueda entrar al ecosistema emprendedor: networking, primer empleo, emprender y aprender haciendo.',
  objective:
    'Conectar talento argentino con founders, referentes y oportunidades reales — dentro y fuera de UCEMA.',
  whyEvent:
    'Startup Day es la primera edición del evento más importante de startups del año en Xplora. Stands, workshops, pitch e inversores en un mismo día.',
  stats: [
    { value: '2.000+', label: 'miembros en la comunidad' },
    { value: 'UCEMA', label: 'casa del club' },
    { value: '1ª', label: 'edición Startup Day' },
    { value: 'AR', label: 'estudiantes de todo el país' },
  ],
} as const;

/** FAQs landing principal xploraucema.com */
export const XP_FAQS = [
  {
    q: '¿Quién puede sumarse?',
    a: 'Estudiantes y jóvenes interesados en el ecosistema emprendedor. No hace falta tener un proyecto armado: podés venir a aprender, conectar o buscar tu primer empleo en startups.',
  },
  {
    q: '¿Hay que ser alumno de UCEMA?',
    a: 'No. Xplora nace en UCEMA, pero la comunidad y los eventos están abiertos a estudiantes de toda la Argentina.',
  },
  {
    q: '¿Cómo me uno a la comunidad?',
    a: 'Entrá al grupo de WhatsApp desde el botón “Entrar a la comunidad”. Ahí avisamos eventos, oportunidades y novedades del club.',
  },
  {
    q: '¿Qué es Startup Day?',
    a: 'El evento más importante del año de Xplora: stands, workshops, charlas y networking con startups y empresas, en un mismo día en UCEMA. Es 100% gratuito.',
  },
  {
    q: '¿Los eventos son pagos?',
    a: 'La mayoría son gratuitos, incluido Startup Day. Si alguno tiene costo, lo aclaramos en la convocatoria.',
  },
  {
    q: '¿Cómo participa una empresa?',
    a: 'Pueden sumarse con charla, workshop, stand o sponsorship. Entrá a /sponsors o usá “Quiero participar” en Empresas.',
  },
] as const;
