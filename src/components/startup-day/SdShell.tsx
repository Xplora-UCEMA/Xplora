import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useSiteMedia } from '../../context/SiteMediaContext';
import { DEFAULT_LOGO_URL } from '../../lib/defaultsMedia';
import {
  mainSiteUrl,
  sdPath,
  startupDayUrl,
} from '../../lib/startupDayHost';
import {
  SD_EDITION_SPONSORS,
  SD_XPLORA_PARTNERS,
  SD_XPLORA_SOCIALS,
} from '../../data/startupDay';
import { SD_TESTIMONIOS } from '../../data/startupDayTestimonios';
import { StartupDayCursor } from './StartupDayCursor';
import { StartupDayLoader } from './StartupDayLoader';
import { SdPixelWave } from './SdPixelWave';
import { StartupDayFooterNewsletter } from './StartupDayFooterNewsletter';
import '../../styles/startupDay.css';

export type SdShellSite = 'startupday' | 'xplora' | 'sponsors';

export type SdShellCta = {
  label: string;
  onClick?: () => void;
  href?: string;
};

type Props = {
  active: SdShellSite;
  children: ReactNode;
  /** Cuando false, no muestra el loader de entrada. */
  showLoader?: boolean;
  loaderDone?: boolean;
  /** Cursor custom (caro en CPU). Default: solo Startup Day. */
  showCursor?: boolean;
  cta?: SdShellCta;
  /**
   * Segundo llamado del header, a la izquierda del principal y con marcas de esquina en vez de
   * borde entero.
   *
   * Opcional y cableado sólo por Startup Day: este shell lo comparten Xplora y Sponsors, que no
   * tienen a dónde apuntar un botón que lleva a una sección de esta landing.
   */
  ctaSecundario?: SdShellCta;
  /** Íconos de red a la derecha del nav. Mismo motivo que `ctaSecundario` para que sea opcional. */
  redesEnHeader?: boolean;
  brandBlurb?: string;
};

/**
 * Chrome compartido Startup Day ↔ Xplora (nav, cursor, footer).
 * Los tabs navegan entre hosts / preview local.
 */
export function SdShell({
  active,
  children,
  showLoader = false,
  loaderDone = true,
  showCursor = active === 'startupday',
  cta,
  ctaSecundario,
  redesEnHeader = false,
  brandBlurb = 'Club de emprendedores. Startup Day fue la primera edición del evento más importante del año.',
}: Props) {
  const { logoUrl } = useSiteMedia();
  const brandLogo = logoUrl || DEFAULT_LOGO_URL;
  const [island, setIsland] = useState(false);
  /** El nodo que barre `SdPixelWave` al terminar la carga. */
  const loaderRef = useRef<HTMLDivElement>(null);

  const sdHref = startupDayUrl();
  const xpHref = mainSiteUrl();

  useEffect(() => {
    document.documentElement.classList.add('sd-mode');
    return () => {
      document.documentElement.classList.remove('sd-mode');
    };
  }, []);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        setIsland((prev) => {
          if (prev) return y > 18;
          return y > 56;
        });
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTop = (e: MouseEvent) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* El modificador por sitio permite acotar estilos a una sola de las tres landings que comparten
     este shell — hoy lo usan los botones, que en Startup Day van con el tratamiento violeta del
     key art y en Xplora/Sponsors siguen siendo el pill blanco. */
  return (
    <div className={`sd-root sd-root--${active}${loaderDone ? ' is-loaded' : ''}`}>
      {showCursor ? <StartupDayCursor /> : null}
      {showLoader ? (
        <>
          <StartupDayLoader ref={loaderRef} done={loaderDone} logoUrl={brandLogo} />
          {/* Hermano del loader, nunca hijo: como hijo lo recortaría el mismo clip-path. */}
          <SdPixelWave play={loaderDone} coverRef={loaderRef} />
        </>
      ) : null}

      <div className="sd-stage">
        <div className={`sd-nav-shell${island ? ' is-island' : ''}`}>
          <header className="sd-top">
            <a className="sd-top__brand" href="#top" onClick={scrollTop}>
              <img
                className="sd-top__logo"
                src={brandLogo}
                alt="Xplora"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO_URL;
                }}
              />
              <span className="sd-top__name">Xplora</span>
            </a>

            <nav className="sd-tabs" aria-label="Sitios Xplora">
              <a
                href={xpHref}
                className={active === 'xplora' ? 'is-active' : undefined}
                aria-current={active === 'xplora' ? 'page' : undefined}
              >
                Xplora
              </a>
              <a
                href={sdHref}
                className={active === 'startupday' ? 'is-active' : undefined}
                aria-current={active === 'startupday' ? 'page' : undefined}
              >
                Startup Day
              </a>
              <a
                href={`${xpHref.replace(/\/$/, '')}/sponsors`}
                className={active === 'sponsors' ? 'is-active' : undefined}
                aria-current={active === 'sponsors' ? 'page' : undefined}
              >
                Sponsors
              </a>
            </nav>

            {/* El racimo de la derecha, con las mismas tres partes que la referencia: íconos,
                un secundario de canto marcado y el principal relleno. Va en su propio contenedor
                para que el `justify-content: space-between` del header reparta tres bloques
                (marca / nav / racimo) y no cinco sueltos. */}
            <div className="sd-top__acciones">
              {redesEnHeader ? (
                <span className="sd-top__redes">
                  <a
                    className="sd-top__red"
                    href={SD_XPLORA_SOCIALS.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram de Xplora"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
                      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.7" />
                      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
                      <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
                    </svg>
                  </a>
                  <a
                    className="sd-top__red"
                    href={SD_XPLORA_SOCIALS.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="LinkedIn de Xplora"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
                      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.82-2.05 3.75-2.05 4 0 4.4 2.5 4.4 5.75V21h-4v-5.7c0-1.36-.02-3.1-1.9-3.1-1.9 0-2.2 1.48-2.2 3v5.8h-4V9Z" />
                    </svg>
                  </a>
                </span>
              ) : null}

              {ctaSecundario?.href ? (
                <a className="sd-top__cta2 sd-btn--esquinas" href={ctaSecundario.href}>
                  {ctaSecundario.label}
                </a>
              ) : null}

              {cta ? (
                cta.href ? (
                  <a
                    className="sd-top__cta"
                    href={cta.href}
                    {...(cta.href.startsWith('http')
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                  >
                    {cta.label}
                  </a>
                ) : (
                  <button type="button" className="sd-top__cta" onClick={cta.onClick}>
                    {cta.label}
                  </button>
                )
              ) : (
                <span className="sd-top__cta-spacer" aria-hidden />
              )}
            </div>
          </header>
        </div>

        <div id="top" className="sd-page">
          {children}
        </div>

        <footer className="sd-footer">
          <div className="sd-footer__shell">
            <div className="sd-footer__inner">
              <div className="sd-footer__brand">
                <img
                  className="sd-footer__logo"
                  src={brandLogo}
                  alt="Xplora"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO_URL;
                  }}
                />
                <p>{brandBlurb}</p>
              </div>

              {active === 'startupday' ? (
                <div className="sd-footer__col">
                  <h3>Startup Day</h3>
                  {/* `#recap` es la lámina "No importa quién sos", que desde el recap lleva los
                      números de la edición — ya no existe un `#para-quien` aparte. */}
                  <a href={sdPath('/#recap')}>El recap</a>
                  <a href={sdPath('/#proxima')}>Próxima edición</a>
                  <a href={sdPath('/#sponsors')}>Sponsors</a>
                  <a href={sdPath('/#que-pasa')}>La experiencia</a>
                  {/* Era `#agenda`, el id de la grilla horaria. Esa sección se reemplazó por
                      `SdCharlas` (`#charlas`) al pasar la página a recap. */}
                  <a href={sdPath('/#charlas')}>Las charlas</a>
                  {/* Condicional, no fijo: mientras no haya posteos cargados `SdTestimonios`
                      devuelve `null` y este link no tendría a dónde llevar. */}
                  {SD_TESTIMONIOS.length > 0 ? (
                    <a href={sdPath('/#testimonios')}>Testimonios</a>
                  ) : null}
                  {/* StartupMate oculta — ver `StartupDay.tsx`
                  <a href="#startupmate">StartupMate</a>
                  */}
                </div>
              ) : (
                <div className="sd-footer__col">
                  <h3>Xplora</h3>
                  <a href="/#que-es">El club</a>
                  <a href="/#empresas">Empresas</a>
                  <a href="/sponsors">Sponsors</a>
                  <a href="/#newsletter">Newsletter</a>
                  <a href={sdHref}>Startup Day</a>
                </div>
              )}

              <div className="sd-footer__col">
                <h3>{active === 'startupday' ? 'Xplora' : 'Comunidad'}</h3>
                {active === 'startupday' ? (
                  <a href={xpHref}>Sitio Xplora</a>
                ) : null}
                <a href={SD_XPLORA_SOCIALS.instagram} target="_blank" rel="noopener noreferrer">
                  Instagram
                </a>
                <a href={SD_XPLORA_SOCIALS.linkedin} target="_blank" rel="noopener noreferrer">
                  LinkedIn
                </a>
                <a href={SD_XPLORA_SOCIALS.whatsapp} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </div>

              {active === 'startupday' ? (
                <div className="sd-footer__col">
                  <h3>Sponsors</h3>
                  {SD_EDITION_SPONSORS.map((p) =>
                    p.website ? (
                      <a key={p.id} href={p.website} target="_blank" rel="noopener noreferrer">
                        {p.name}
                      </a>
                    ) : (
                      <span key={p.id}>{p.name}</span>
                    ),
                  )}
                  <a href={sdPath('/#sponsors')}>Sumar mi marca</a>
                </div>
              ) : (
                <div className="sd-footer__col">
                  <h3>Sponsors del club</h3>
                  {SD_XPLORA_PARTNERS.map((p) =>
                    p.website ? (
                      <a key={p.id} href={p.website} target="_blank" rel="noopener noreferrer">
                        {p.name}
                      </a>
                    ) : (
                      <span key={p.id}>{p.name}</span>
                    ),
                  )}
                  <a href="/sponsors">Sumar mi marca</a>
                </div>
              )}

              <div className="sd-footer__col sd-footer__col--nl">
                <StartupDayFooterNewsletter />
              </div>
            </div>

            <p className="sd-footer__copy">
              © {new Date().getFullYear()} Xplora. Todos los derechos reservados.
            </p>

            <div className="sd-footer__marque" aria-hidden>
              <span className="sd-footer__marque-text">SOMOS XPLORA</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
