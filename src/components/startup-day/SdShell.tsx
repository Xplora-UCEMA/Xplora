import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useSiteMedia } from '../../context/SiteMediaContext';
import { useMemberAuth } from '../../context/MemberAuthContext';
import { DEFAULT_LOGO_URL } from '../../lib/defaultsMedia';
import { publicFeatures } from '../../lib/publicFeatures';
import {
  mainSiteUrl,
  startupDayUrl,
} from '../../lib/startupDayHost';
import {
  SD_XPLORA_PARTNERS,
  SD_XPLORA_SOCIALS,
} from '../../data/startupDay';
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
  brandBlurb = 'Organización estudiantil de la Universidad del CEMA. Por y para emprendedores.',
}: Props) {
  const { logoUrl } = useSiteMedia();
  const { account } = useMemberAuth();
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

            <div className="sd-top__actions">
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
              ) : null}
              {publicFeatures.memberAccountEntry ? <a className="sd-top__cta sd-top__account" href={`${xpHref.replace(/\/$/, '')}/cuenta`}>
                {account ? 'Mi cuenta' : 'Iniciar sesión'}
              </a> : null}
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

              <div className="sd-footer__col">
                <h3>Xplora</h3>
                <a href={`${xpHref}#que-es`}>El club</a>
                <a href={`${xpHref}#empresas`}>Empresas</a>
                <a href={`${xpHref}sponsors`}>Sponsors</a>
                <a href={`${xpHref}#newsletter`}>Newsletter</a>
                <a href={sdHref}>Startup Day</a>
              </div>

              <div className="sd-footer__col">
                <h3>Comunidad</h3>
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
                <a href={`${xpHref}sponsors`}>Sumar mi marca</a>
              </div>

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
