/**
 * Media partners y galería del evento.
 *
 * Dos cosas en una sección porque son la misma cosa: quiénes registraron el día, y el registro.
 * **Primero los videos y después las fotos**: los videos son piezas cerradas, con autor y título,
 * y funcionan como la entrada a la sección; la galería es el fondo sobre el que se apoyan.
 *
 * **Corta el violeta por profundidad.** De acá en adelante todo era `--sd-ink` y la página se
 * leía como un solo bloque. Se probó en banda clara y quedó mal —el blanco peleaba en vez de dar
 * respiro—, así que ahora va en `--sd-void` con viñeta: más honda que sus vecinas, no de otro
 * color. Ver `.sd-media` en el CSS.
 *
 * **La galería no lleva pie de foto ni crédito.** Las imágenes las sacó un cuarto media partner
 * que pidió no figurar; por eso tampoco está en `SD_MEDIA_PARTNERS`. Sus archivos se importan
 * renumerados y sin EXIF (ver `scripts/import-fotos-startup-day.mjs`), así que no queda rastro
 * suyo ni en la URL ni en los metadatos.
 */
import { SD_MEDIA_PARTNERS } from '../../data/startupDayRecap';
import { SdReveal } from './SdReveal';

/**
 * Las fotos importadas, por nombre.
 *
 * Es una lista literal y no un `import.meta.glob`: son estáticas, no cambian entre builds, y el
 * glob agregaría una indirección para ahorrar dieciocho líneas. El orden es el que dejó la
 * curación (ver el script), pensado para alternar planos generales y stands.
 */
const FOTOS = Array.from(
  { length: 18 },
  (_, i) => `/media/startup-day/sd-${String(i + 1).padStart(2, '0')}.webp`,
);

export function SdMedia() {
  return (
    <section id="media" className="sd-band sd-media">
      {/* El disuelto de la costura con `#marcas`. Va como elemento y no en `.sd-media::before`
          porque ese pseudo ya lo usa la rejilla para las cruces, y monta HACIA ARRIBA —sale de la
          caja de la sección— para poder tramar el final de la sección anterior. */}
      <span className="sd-capa sd-media__disuelto" aria-hidden />
      {/* La viñeta de los bordes, que antes era un `box-shadow: inset` de la sección: como el
          inset pinta a fuerza plena contra el borde de arriba, dejaba un escalón de tono justo en
          la costura. Acá va enmascarada, así entra recién pasado el degradado. */}
      <span className="sd-capa sd-media__vineta" aria-hidden />

      <SdReveal className="sd-media__head">
        <div className="sd-media__masthead">
          <h2 className="sd-media__title">Cómo se contó</h2>
        </div>
      </SdReveal>

      <SdReveal className="sd-media__partners" delay={1}>
        <h3 className="sd-media__partners-title">Media partners</h3>

        <ul className="sd-media__lista">
          {SD_MEDIA_PARTNERS.map((p) => (
            <li key={p.id} className="sd-media__partner">
              {/* El logo es opcional: sin archivo la card cae al nombre en tipografía, que es
                  mejor que un hueco esperando una imagen. */}
              {p.logoUrl ? (
                <img className="sd-media__partner-logo" src={p.logoUrl} alt={p.name} loading="lazy" />
              ) : (
                <span className="sd-media__partner-nombre">{p.name}</span>
              )}
              <p className="sd-media__partner-aporte">{p.aporte}</p>

              {p.video ? (
                <a
                  className="sd-media__video"
                  href={p.video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {/* Miniatura local y link, no un iframe de YouTube: el embed suma medio mega de
                      reproductor y cookies de terceros a una página que sólo necesita mostrar que
                      el video existe. */}
                  <span className="sd-media__video-img">
                    <img src={p.video.miniatura} alt="" loading="lazy" width={1280} height={720} />
                    <span className="sd-media__play" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="currentColor" focusable="false">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </span>
                  <span className="sd-media__video-titulo">{p.video.titulo}</span>
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </SdReveal>

      <SdReveal className="sd-media__galeria" delay={2}>
        {FOTOS.map((src, i) => (
          <figure key={src} className="sd-media__foto">
            {/* Las primeras entran con la sección; el resto difiere. `decoding="async"` para que
                una foto pesada no bloquee el pintado de las vecinas. */}
            <img
              src={src}
              alt={`Startup Day 2026 — foto ${i + 1} de ${FOTOS.length}`}
              loading={i < 3 ? 'eager' : 'lazy'}
              decoding="async"
              width={900}
              height={598}
            />
          </figure>
        ))}
      </SdReveal>
    </section>
  );
}
