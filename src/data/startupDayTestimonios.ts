/**
 * Lo que se dijo del Startup Day en Twitter/X y en LinkedIn.
 *
 * ## Por qué no hay ninguno todavía
 *
 * Son citas de personas reales. Inventar un testimonio —aunque sea "de mentira, para ver cómo
 * queda"— es poner en boca de alguien algo que no dijo, y un placeholder así se publica solo: basta
 * un deploy antes de reemplazarlo. Así que el array arranca vacío y `SdTestimonios` **no renderiza
 * la sección** mientras lo esté. La página nunca muestra un hueco ni una cita falsa.
 *
 * ## Cómo cargarlos
 *
 * Un objeto por posteo, con el texto tal cual se publicó. Abajo hay un ejemplo comentado con la
 * forma exacta; descomentarlo y reemplazar los datos por los reales.
 *
 * - `texto`: la cita, sin comillas (las pone el CSS) y sin el link del final que agregan las redes.
 * - `handle`: con `@` para X, el nombre de usuario de la URL para LinkedIn.
 * - `fecha`: como se quiera mostrar ("11 sep 2026"). Es un rótulo, no se parsea.
 * - `url`: al posteo original. Cada tarjeta enlaza ahí, que es lo que hace verificable la cita.
 */

export type SdRedTestimonio = 'x' | 'linkedin';

export type SdTestimonio = {
  id: string;
  red: SdRedTestimonio;
  /** Nombre y apellido, como firma la persona. */
  autor: string;
  /** `@usuario`. */
  handle: string;
  /** Opcional: "Founder de X", "Alumna de UCEMA". Va chiquito debajo del nombre. */
  rol?: string;
  texto: string;
  fecha: string;
  url: string;
};

export const SD_TESTIMONIOS: readonly SdTestimonio[] = [
  /*
  {
    id: 'ejemplo-1',
    red: 'x',
    autor: 'Nombre Apellido',
    handle: '@usuario',
    rol: 'Founder de Tal',
    texto: 'Lo que escribió, tal cual lo publicó.',
    fecha: '11 sep 2026',
    url: 'https://x.com/usuario/status/000',
  },
  */
];
