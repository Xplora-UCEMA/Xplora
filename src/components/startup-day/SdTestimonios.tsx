import { SD_TESTIMONIOS, type SdRedTestimonio } from '../../data/startupDayTestimonios';
import { SdReveal } from './SdReveal';

/**
 * "Qué dijeron" — los posteos de X y de LinkedIn sobre el evento.
 *
 * Tarjetas propias y no los embeds oficiales de cada red. Un `blockquote` de Twitter o de LinkedIn
 * trae su script, su iframe y su hoja de estilos: llega blanco sobre una página negra, no respeta
 * ninguna de las tipografías, tarda lo suyo y suma dos dominios de terceros a la cascada. Esta
 * página ya sacó una sección 3D por pesada; no tiene sentido devolverle el peso por otro lado.
 *
 * Lo que sí se conserva del embed es lo que importa: **cada tarjeta enlaza al posteo original**, que
 * es lo que hace la cita verificable.
 *
 * Si `SD_TESTIMONIOS` está vacío la sección **no se monta**. Ver el encabezado de ese archivo: no
 * hay testimonios de ejemplo, así que mientras no haya reales acá no hay nada que mostrar, y una
 * sección vacía con un título es peor que ninguna sección.
 */

/* Los dos glifos, dibujados acá y no traídos de una librería de íconos: son dos paths y la página
   no tiene ninguna otra dependencia de íconos que justifique agregar una. */
function IconoRed({ red }: { red: SdRedTestimonio }) {
  if (red === 'linkedin') {
    return (
      <svg className="sd-testi__red" viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
        <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.82-2.05 3.75-2.05 4 0 4.4 2.5 4.4 5.75V21h-4v-5.7c0-1.36-.02-3.1-1.9-3.1-1.9 0-2.2 1.48-2.2 3v5.8h-4V9Z" />
      </svg>
    );
  }
  return (
    <svg className="sd-testi__red" viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      <path d="M17.7 3h3.3l-7.2 8.24L22.3 21h-6.6l-5.18-6.77L4.6 21H1.3l7.7-8.8L1.7 3h6.77l4.68 6.19L17.7 3Zm-1.16 16h1.83L7.55 4.9H5.58L16.54 19Z" />
    </svg>
  );
}

const NOMBRE_RED: Record<SdRedTestimonio, string> = { x: 'X', linkedin: 'LinkedIn' };

export function SdTestimonios() {
  if (SD_TESTIMONIOS.length === 0) return null;

  return (
    <section id="testimonios" className="sd-band sd-band--ink sd-testi">
      <SdReveal className="sd-testi__head">
        <h2 className="sd-testi__title">Qué dijeron</h2>
        <p className="sd-testi__lead">Lo que se posteó del día, sin editar.</p>
      </SdReveal>

      <SdReveal className="sd-testi__grid" delay={1}>
        {SD_TESTIMONIOS.map((t) => (
          <article key={t.id} className="sd-testi__card">
            {/* El link envuelve la tarjeta entera y no sólo el nombre: así todo el bloque es el
                destino, que es como se comporta un posteo en cualquiera de las dos redes. */}
            <a
              className="sd-testi__link"
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ver el posteo de ${t.autor} en ${NOMBRE_RED[t.red]}`}
            >
              <IconoRed red={t.red} />

              <blockquote className="sd-testi__texto">{t.texto}</blockquote>

              <footer className="sd-testi__pie">
                <span className="sd-testi__autor">{t.autor}</span>
                <span className="sd-testi__meta">
                  {t.handle}
                  {t.rol ? ` · ${t.rol}` : ''}
                </span>
                <time className="sd-testi__fecha">{t.fecha}</time>
              </footer>
            </a>
          </article>
        ))}
      </SdReveal>
    </section>
  );
}
