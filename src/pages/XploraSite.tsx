/**
 * Landing principal xploraucema.com — top of funnel.
 * Identidad compartida con Startup Day; composición propia (foto + producto).
 */
import { useEffect, useMemo, useState } from 'react';
import { useSiteMedia } from '../context/SiteMediaContext';
import { DEFAULT_COMPANY_BRANDS } from '../lib/defaultsMedia';
import { MAIN_SITE_URL, startupDayUrl } from '../lib/startupDayHost';
import { fetchEventos } from '../lib/db';
import { pickEarliestUpcoming } from '../lib/eventDate';
import type { Evento } from '../types';
import { SD_EVENT, SD_XPLORA_SOCIALS, XP_FAQS } from '../data/startupDay';
import { SdReveal } from '../components/startup-day/SdReveal';
import { SdShell } from '../components/startup-day/SdShell';
import { StartupDaySponsorCta } from '../components/startup-day/StartupDaySponsorForm';
import { XploraNewsletterForm } from '../components/xplora/XploraNewsletterForm';
import {
  XploraHeroPhoto,
  XploraModes,
  XploraRail,
} from '../components/xplora/XploraInteract';
import '../styles/startupDay.css';
import '../styles/xploraSite.css';

// This edition has ended. Its yearless CMS date must not roll forward into next year's agenda.
const STARTUP_DAY_2026_EVENT_ID = '95b3d91e-f68b-4c73-a28d-7b739f491867';

export default function XploraSite() {
  const { carousel, heroUrl } = useSiteMedia();
  /** Solo PNG locales curados — sin Cloudinary ni fondos blancos. */
  const brands = DEFAULT_COMPANY_BRANDS;
  const sdHref = startupDayUrl();
  const [loaderDone, setLoaderDone] = useState(false);
  const [proximo, setProximo] = useState<Evento | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Restaurar la portada original: el retrato enviado pierde nitidez en este formato ancho.
  const heroPhoto = heroUrl || carousel?.[0]?.url || '/images/IMG-20250827-WA0014.webp';
  const nextPhoto =
    proximo?.homePosterUrl ||
    proximo?.thumbnailUrl ||
    '';

  const railItems = useMemo(() => {
    return [
      { id: 'que-es', label: 'Club' },
      ...(proximo ? [{ id: 'proximo', label: 'Evento' }] : []),
      { id: 'startup-day', label: 'Startup Day' },
      { id: 'empresas', label: 'Empresas' },
      { id: 'faq', label: 'FAQ' },
      { id: 'newsletter', label: 'News' },
    ];
  }, [proximo]);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Xplora — Club de emprendedores UCEMA';

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const prevHref = canonical?.href ?? '';
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = MAIN_SITE_URL;

    const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = metaDesc?.content ?? '';
    if (metaDesc) {
      metaDesc.content =
        'Xplora — organización estudiantil de UCEMA. Comunidad, eventos, empleo y Startup Day.';
    }

    const t = window.setTimeout(() => setLoaderDone(true), 900);
    return () => {
      window.clearTimeout(t);
      document.title = prevTitle;
      if (canonical) canonical.href = prevHref || MAIN_SITE_URL;
      if (metaDesc) metaDesc.content = prevDesc;
    };
  }, []);

  useEffect(() => {
    if (!loaderDone || !window.location.hash) return;
    let id: string;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    // Restore the lazy-loaded anchor without a smooth jump across content-visibility estimates.
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loaderDone]);

  useEffect(() => {
    let alive = true;
    fetchEventos()
      .then((list) => {
        if (alive) setProximo(pickEarliestUpcoming(list.filter((event) => event.id !== STARTUP_DAY_2026_EVENT_ID)));
      })
      .catch(() => {
        if (alive) setProximo(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <SdShell
      active="xplora"
      showLoader
      loaderDone={loaderDone}
      brandBlurb="Organización estudiantil de la Universidad del CEMA. Por y para emprendedores."
    >
      <div className="xp-page">
        <XploraRail items={railItems} />

        {/* Hero: una composición — marca + foto + un CTA */}
        <XploraHeroPhoto
          src={heroPhoto}
          alt="La comunidad de Xplora reunida en uno de sus encuentros"
        >
          <p className="sd-hero__eyebrow">Universidad del CEMA</p>
          <h1 className="sd-hero__title xp-hero__title">
            <span className="sd-hero__line">Xplora</span>
          </h1>
          <p className="sd-hero__lede">
            Organización estudiantil por y para emprendedores. Abierta a toda la Argentina.
          </p>
          <div className="xp-hero__actions">
            <a
              className="sd-btn sd-btn--primary"
              href={SD_XPLORA_SOCIALS.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
            >
              Entrar a la comunidad
            </a>
            <button
              type="button"
              className="xp-hero__link"
              onClick={() => scrollTo(proximo ? 'proximo' : 'que-es')}
            >
              {proximo ? 'Próximo evento' : 'Qué hacemos'}
            </button>
          </div>
        </XploraHeroPhoto>

        {/* Qué es — modos interactivos */}
        <section id="que-es" className="xp-section xp-section--ink">
          <SdReveal className="xp-section__intro">
            <p className="sd-kicker">El club</p>
            <h2 className="sd-h2">Cuatro puertas al ecosistema</h2>
            <p className="sd-lead">Elegí por dónde entrar.</p>
          </SdReveal>
          <SdReveal delay={1}>
            <XploraModes />
          </SdReveal>
        </section>

        {/* Próximo evento — solo si hay uno cargado en CMS */}
        {proximo ? (
          <section id="proximo" className="xp-next">
            <div className="xp-next__bar">
              <p className="sd-kicker">Próximo evento</p>
              {proximo.registrationLink ? (
                <a
                  className="sd-btn sd-btn--ink"
                  href={proximo.registrationLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Quiero ir
                </a>
              ) : (
                <button
                  type="button"
                  className="sd-btn sd-btn--ink"
                  onClick={() => scrollTo('newsletter')}
                >
                  Avisame
                </button>
              )}
            </div>

            <div className="xp-next__main">
              <div className="xp-next__editorial">
                <div className="xp-next__date" aria-hidden={!proximo.day}>
                  <span className="xp-next__day">{proximo.day || '—'}</span>
                  <span className="xp-next__month">{proximo.month || ''}</span>
                  {proximo.date ? (
                    <span className="xp-next__date-full">{proximo.date}</span>
                  ) : null}
                </div>

                <SdReveal className="xp-next__copy">
                  <h2 className="sd-h2 xp-next__title">{proximo.title}</h2>
                  {proximo.desc ? (
                    <p className="xp-next__desc">
                      {proximo.desc.length > 180
                        ? `${proximo.desc.slice(0, 177).trim()}…`
                        : proximo.desc}
                    </p>
                  ) : null}

                  <dl className="xp-next__facts">
                    {proximo.location ? (
                      <div>
                        <dt>Lugar</dt>
                        <dd>{proximo.location}</dd>
                      </div>
                    ) : null}
                    {proximo.modality ? (
                      <div>
                        <dt>Modalidad</dt>
                        <dd>{proximo.modality}</dd>
                      </div>
                    ) : null}
                    {proximo.cost ? (
                      <div>
                        <dt>Costo</dt>
                        <dd>{proximo.cost}</dd>
                      </div>
                    ) : null}
                    {proximo.speakerName ? (
                      <div>
                        <dt>Con</dt>
                        <dd>
                          {proximo.speakerName}
                          {proximo.speakerRole ? ` · ${proximo.speakerRole}` : ''}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </SdReveal>
              </div>

              {nextPhoto ? (
                <figure className="xp-next__media">
                  <img
                    src={nextPhoto}
                    alt={proximo.title}
                    loading="lazy"
                    decoding="async"
                  />
                </figure>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* Startup Day — siempre visible */}
        <section id="startup-day" className="xp-sd-strip" aria-labelledby="xp-recap-title">
          <SdReveal className="xp-sd">
            <div className="xp-sd__copy">
              <h2 id="xp-recap-title" className="sd-h2 xp-sd__title">Así fue el primer <span>Startup Day.</span></h2>
              <p className="sd-lead xp-sd__lead">Las charlas, los encuentros y las ideas que compartimos. Todo lo que pasó, en fotos y videos.</p>
              <a className="sd-btn sd-btn--primary xp-sd__cta" href={sdHref}>
                Reviví Startup Day <HomeArrow />
              </a>
              <p className="xp-sd__meta">{SD_EVENT.dateLabel} · UCEMA</p>
            </div>
            <a className="xp-sd__photos" href={sdHref} aria-label="Ver las fotos y videos de la primera edición de Startup Day">
              <img className="xp-sd__photo-main" src="/images/home/startupday-charla-1280.webp"
                srcSet="/images/home/startupday-charla-640.webp 640w, /images/home/startupday-charla-1280.webp 1280w, /images/home/startupday-charla-1920.webp 1920w"
                sizes="(min-width: 900px) 52vw, 92vw" width="1920" height="1277"
                alt="Participantes reunidos en una de las charlas de Startup Day" loading="lazy" decoding="async" />
              <img className="xp-sd__photo-detail" src="/images/home/startupday-encuentros-640.webp"
                width="640" height="426" alt="Una conversación junto a los stands del evento" loading="lazy" decoding="async" />
              <span className="xp-sd__photo-link" aria-hidden="true"><HomeArrow /></span>
            </a>
          </SdReveal>
        </section>

        {/* Empresas */}
        <section id="empresas" className="xp-section xp-section--cream xp-companies" aria-labelledby="xp-companies-title">
          <SdReveal className="xp-companies__intro">
            <h2 id="xp-companies-title" className="sd-h2">Empresas que<br />ya pasaron por acá.</h2>
            <div className="xp-companies__aside">
              <p className="sd-lead">Marcas que eligieron Xplora para conectar con talento.</p>
            </div>
          </SdReveal>
          <SdReveal>
            <ul className="xp-companies__logos" aria-label="Empresas en Xplora">
              {brands.map((co) => (
                <li key={co.id}>
                  <img src={co.id === 'co-globant' ? '/logos/startup-day/globant.webp' : co.logoUrl} alt={co.name} loading="lazy" decoding="async" draggable={false} />
                </li>
              ))}
            </ul>
          </SdReveal>
          <SdReveal className="xp-companies__invite">
            <p>¿Tu empresa en Xplora?</p>
            <div className="xp-companies__link">
              <StartupDaySponsorCta
                label="Quiero participar"
                kicker="Empresas · Xplora"
                title="Participar en Xplora"
                successText="Te escribimos para ver cómo suma tu empresa."
                interes="ambos"
                mensajePrefix="Interés en participar con empresa en Xplora"
                placeholder="Qué te interesa"
                className="sd-btn--text xp-companies__cta"
              />
              <HomeArrow />
            </div>
          </SdReveal>
        </section>

        {/* FAQ — preguntas y respuestas en una sola columna. */}
        <section id="faq" className="xp-section xp-section--cream xp-faq-sec" aria-labelledby="xp-faq-title">
          <div className="xp-faq__content">
            <SdReveal className="xp-faq-bar">
              <h2 id="xp-faq-title" className="sd-h2">Preguntas frecuentes.</h2>
              <a className="xp-text-link" href={SD_XPLORA_SOCIALS.whatsapp} target="_blank" rel="noopener noreferrer">
                ¿Otra duda? Escribinos <HomeArrow />
              </a>
            </SdReveal>
            <SdReveal delay={1} className="xp-faq">
              {XP_FAQS.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div key={item.q} className={`xp-faq__item${open ? ' is-open' : ''}`}>
                    <button
                      type="button"
                      className="xp-faq__q"
                      id={`xp-faq-question-${i}`}
                      aria-expanded={open}
                      aria-controls={`xp-faq-answer-${i}`}
                      onClick={() => setOpenFaq(open ? null : i)}
                    >
                      <span>{item.q}</span>
                      <svg className="xp-faq__icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <path d="M3 10h14" /><path className="xp-faq__plus" d="M10 3v14" />
                      </svg>
                    </button>
                    <div id={`xp-faq-answer-${i}`} className="xp-faq__answer" role="region" aria-labelledby={`xp-faq-question-${i}`} aria-hidden={!open}>
                      <div><p className="xp-faq__a">{item.a}</p></div>
                    </div>
                  </div>
                );
              })}
            </SdReveal>
          </div>
        </section>

        {/* Newsletter */}
        <section id="newsletter" className="xp-section xp-section--ink xp-nl-sec" aria-labelledby="xp-news-title">
          <div className="xp-nl__backdrop" aria-hidden="true">
            <img src="/images/home/startupday-proyectos-1280.webp"
              srcSet="/images/home/startupday-proyectos-640.webp 640w, /images/home/startupday-proyectos-1280.webp 1280w, /images/home/startupday-proyectos-1920.webp 1920w"
              sizes="100vw" width="1920" height="1276" alt="" loading="lazy" decoding="async" />
          </div>
          <SdReveal className="xp-nl__content">
            <div className="xp-nl__story">
              <h2 id="xp-news-title" className="sd-h2">Enterate<br /><span>antes.</span></h2>
              <p className="sd-lead">
                Próximos eventos, búsquedas laborales y novedades de Xplora. Directo a tu mail.
              </p>
            </div>
            <div className="xp-nl__signup">
              <XploraNewsletterForm />
            </div>
          </SdReveal>
        </section>
      </div>
    </SdShell>
  );
}

function HomeArrow() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>;
}
