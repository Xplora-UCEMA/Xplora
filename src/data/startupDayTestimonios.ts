/**
 * Lo que se dijo del Startup Day en Twitter/X y en LinkedIn.
 *
 * ## ⚠️ Lo que hay acá abajo es DE MENTIRA
 *
 * Son seis tarjetas de ejemplo, cargadas para poder ver y ajustar el diseño de la sección mientras
 * no estén los posteos reales. Los nombres son "Nombre Apellido" y los handles "@usuario"
 * justamente para que nadie las confunda con citas de gente de verdad, y los links no van a
 * ninguna parte.
 *
 * **Hay que reemplazarlas antes de publicar.** Una cita inventada con nombre y apellido de alguien
 * real es poner en su boca algo que no dijo; por eso los ejemplos son anónimos y evidentes.
 *
 * Si el array queda vacío, `SdTestimonios` no renderiza la sección: la página nunca muestra un
 * hueco con un título arriba.
 *
 * ## Cómo cargar los reales
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
  /* ⚠️ EJEMPLOS — reemplazar por los posteos reales. Ver el encabezado del archivo. */
  {
    id: 'ejemplo-1',
    red: 'x',
    autor: 'Nombre Apellido',
    handle: '@usuario',
    rol: 'Founder',
    texto: 'Acá va un tuit corto, de un renglón o dos, tal cual se publicó.',
    fecha: '11 sep 2026',
    url: '#',
  },
  {
    id: 'ejemplo-2',
    red: 'linkedin',
    autor: 'Nombre Apellido',
    handle: 'nombre-apellido',
    rol: 'Alumno de UCEMA',
    texto:
      'Acá va un posteo de LinkedIn, que suele ser bastante más largo que un tuit: abre contando el contexto, sigue con un par de párrafos sobre lo que pasó en el día y cierra agradeciendo. Esta tarjeta está para ver qué hace la columna con ese largo.',
    fecha: '12 sep 2026',
    url: '#',
  },
  {
    id: 'ejemplo-3',
    red: 'x',
    autor: 'Nombre Apellido',
    handle: '@usuario',
    texto: 'Uno sin rol, para ver la tarjeta con el pie más corto.',
    fecha: '11 sep 2026',
    url: '#',
  },
  {
    id: 'ejemplo-4',
    red: 'linkedin',
    autor: 'Nombre Apellido',
    handle: 'nombre-apellido',
    rol: 'Head de Producto',
    texto:
      'Largo intermedio, de dos o tres renglones, que es lo que más se va a repetir cuando estén los de verdad.',
    fecha: '12 sep 2026',
    url: '#',
  },
  {
    id: 'ejemplo-5',
    red: 'x',
    autor: 'Nombre Apellido',
    handle: '@usuario',
    rol: 'Inversora',
    texto: 'Otro corto, para que el muro no quede con las tres columnas del mismo alto.',
    fecha: '11 sep 2026',
    url: '#',
  },
  {
    id: 'ejemplo-6',
    red: 'x',
    autor: 'Nombre Apellido',
    handle: '@usuario',
    rol: 'Builder',
    texto: 'Y uno mediano, para llenar la tercera columna y ver el ritmo completo del bloque.',
    fecha: '13 sep 2026',
    url: '#',
  },
];
