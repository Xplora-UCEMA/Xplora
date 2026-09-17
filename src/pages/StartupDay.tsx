/**
 * THESIS: photographic record of the day, with real event evidence leading each section.
 * OWN-WORLD: Xplora's Glacial/Poppins, ink/cream/purple; bold hero, regular section type, open layouts.
 * STORY: relive, meet the voices, browse the photographs, keep meeting through Xplora.
 * FIRST VIEWPORT: edge-to-edge photo, two-line title, quiet date, visible watch action.
 * FORM: mobile photographic journal extending the user-pinned Xplora identity.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useSiteMedia } from '../context/SiteMediaContext';
import { DEFAULT_LOGO_URL } from '../lib/defaultsMedia';
import { mainSiteUrl, STARTUP_DAY_CANONICAL } from '../lib/startupDayHost';
import { SD_CHARLAS, SD_EDITION_SPONSORS, SD_EVENT, SD_STARTUPS, SD_XPLORA_SOCIALS } from '../data/startupDay';
import { RECAP_PHOTOS, RECAP_PRESS, RECAP_VOICES } from '../data/startupDayRecap';
import { RecapMediaDialog, type RecapMedia } from '../components/startup-day/recap/RecapMediaDialog';
import { RecapOtherEvents } from '../components/startup-day/recap/RecapOtherEvents';
import { RecapVideoPreview } from '../components/startup-day/recap/RecapVideoPreview';
import { SdShell } from '../components/startup-day/SdShell';
import { useRecapMotion } from '../components/startup-day/recap/useRecapMotion';
import '../styles/startupDayRecap.css';

function Arrow({ direction = 'up' }: { direction?: 'up' | 'right' | 'down' }) {
  return <svg className={`sr-arrow sr-arrow--${direction}`} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="1.5" /></svg>;
}
function Play() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 11 7-11 7V5Z" fill="currentColor" /></svg>;
}
function Photo({ id, alt, className = '', sizes = '(min-width: 900px) 45vw, 90vw', eager = false }: { id: string; alt: string; className?: string; sizes?: string; eager?: boolean }) {
  return <img className={className} src={`/recap/${id}-1280.webp`} srcSet={`/recap/${id}-640.webp 640w, /recap/${id}-1280.webp 1280w, /recap/${id}-1920.webp 1920w`} sizes={sizes} alt={alt} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" width="1920" height="1277" />;
}
function useRecapMeta() {
  useEffect(() => {
    const oldTitle = document.title;
    document.title = 'Así fue Startup Day 2026 | Xplora UCEMA';
    document.documentElement.classList.add('sr-mode');
    const description = 'Reviví Startup Day: las fotos, las charlas, las voces y los encuentros del 11 de septiembre de 2026 en UCEMA. Una experiencia de Xplora.';
    const changes: { el: Element; attribute: string; previous: string | null; created: boolean }[] = [];
    const set = (selector: string, tag: string, attrs: Record<string, string>, attribute: string, value: string) => {
      let el = document.head.querySelector(selector); const created = !el;
      if (!el) { el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); document.head.append(el); }
      changes.push({ el, attribute, previous: el.getAttribute(attribute), created }); el.setAttribute(attribute, value);
    };
    set('meta[name="description"]', 'meta', { name: 'description' }, 'content', description);
    set('link[rel="canonical"]', 'link', { rel: 'canonical' }, 'href', STARTUP_DAY_CANONICAL);
    for (const [key, value] of Object.entries({ 'og:title': document.title, 'og:description': description, 'og:url': STARTUP_DAY_CANONICAL, 'og:image': `${STARTUP_DAY_CANONICAL}recap/hero-1280.webp` })) set(`meta[property="${key}"]`, 'meta', { property: key }, 'content', value);
    for (const [key, value] of Object.entries({ 'twitter:title': document.title, 'twitter:description': description, 'twitter:card': 'summary_large_image', 'twitter:image': `${STARTUP_DAY_CANONICAL}recap/hero-1280.webp` })) set(`meta[name="${key}"]`, 'meta', { name: key }, 'content', value);
    return () => { document.title = oldTitle; document.documentElement.classList.remove('sr-mode'); changes.forEach(({ el, attribute, previous, created }) => { if (created) el.remove(); else if (previous === null) el.removeAttribute(attribute); else el.setAttribute(attribute, previous); }); };
  }, []);
}

/** Reuse the shared loader and wait for its actual pixel-wave completion. */
function useRecapEntrance(root: RefObject<HTMLDivElement>) {
  const [entry, setEntry] = useState(() => {
    const reduce = typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return { showLoader: !reduce, loaderDone: reduce, ready: reduce };
  });

  useEffect(() => {
    if (entry.ready) return;
    const shell = root.current?.closest<HTMLElement>('.sd-root');
    const cover = shell?.querySelector<HTMLElement>('.sd-loader');
    const stage = shell?.querySelector<HTMLElement>('.sd-stage');
    if (!cover) {
      setEntry({ showLoader: false, loaderDone: true, ready: true });
      return;
    }

    const previousInert = stage?.inert ?? false;
    const previousOverflow = document.documentElement.style.overflow;
    if (stage) stage.inert = true;
    document.documentElement.style.overflow = 'hidden';
    let released = false;
    let finished = false;
    const releaseContent = () => {
      if (released) return;
      released = true;
      if (stage) stage.inert = previousInert;
      document.documentElement.style.overflow = previousOverflow;
    };
    const complete = () => {
      if (finished) return;
      finished = true;
      releaseContent();
      setEntry({ showLoader: false, loaderDone: true, ready: true });
    };
    // SdPixelWave sets this inline only when its timeline has fully cleared the screen.
    const observer = new MutationObserver(() => {
      if (cover.style.visibility === 'hidden') complete();
    });
    observer.observe(cover, { attributes: true, attributeFilter: ['style'] });
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = () => { if (motion.matches) complete(); };
    motion.addEventListener('change', onMotionChange);
    const reveal = window.setTimeout(() => {
      if (!finished) setEntry(previous => ({ ...previous, loaderDone: true }));
    }, 900);
    // A failed/interrupted transition must never leave the page inaccessible.
    const fallback = window.setTimeout(complete, 5000);
    if (motion.matches || cover.style.visibility === 'hidden') complete();

    return () => {
      finished = true;
      window.clearTimeout(reveal);
      window.clearTimeout(fallback);
      observer.disconnect();
      motion.removeEventListener('change', onMotionChange);
      releaseContent();
    };
  }, [root, entry.ready]);

  return entry;
}

const FILM: RecapMedia = { id: 'recap', kind: 'video', src: '/recap/recap-film.mp4', poster: '/recap/recap-film.webp', alt: 'Reviví Startup Day', caption: 'Startup Day · 11 de septiembre de 2026' };

function RecapFilm({ open, disabled }: { open: (m: RecapMedia) => void; disabled: boolean }) {
  return <section className="sr-film" id="pelicula" aria-labelledby="sr-film-heading"><div className="sr-film-frame">
    <h2 id="sr-film-heading" data-sr-reveal>Así se vivió <span>Startup Day.</span></h2>
    <div className="sr-film-stage">
      <div className="sr-film-photo" data-sr-reveal><Photo id="photo-26" alt="Participantes conversando en Startup Day" sizes="(min-width: 1000px) 32vw, 1px" /></div>
      <RecapVideoPreview className="sr-film-screen" src="/recap/hero-loop.mp4" poster="/recap/recap-film.webp" alt="Recap de Startup Day" width={720} height={1280} disabled={disabled} onOpen={() => open(FILM)} openLabel="Ver el recap completo"><span className="sr-play"><Play /></span><span className="sr-film-caption"><span>Ver recap completo</span><span>1 min</span></span></RecapVideoPreview>
      <div className="sr-film-photo" data-sr-reveal><Photo id="photo-30" alt="Una conversación frente al público de Startup Day" sizes="(min-width: 1000px) 32vw, 1px" /></div>
    </div>
  </div></section>;
}

export default function StartupDay() {
  const { logoUrl } = useSiteMedia();
  const root = useRef<HTMLDivElement>(null);
  const [media, setMedia] = useState<RecapMedia | null>(null);
  const [filter, setFilter] = useState('Todas');
  const [showAllBrands, setShowAllBrands] = useState(false);
  const gallery = useRef<HTMLDivElement>(null);
  const voices = useRef<HTMLDivElement>(null);
  const entrance = useRecapEntrance(root);
  const previewsDisabled = !entrance.ready || media !== null;
  useRecapMeta(); useRecapMotion(root, entrance.ready);
  const photos = RECAP_PHOTOS.filter(p => filter === 'Todas' || p.category === filter);
  const openPhoto = (index: number) => { const p = photos[index]; if (p) setMedia({ id: p.id, kind: 'image', src: `/recap/${p.id}-1920.webp`, alt: p.alt, caption: p.caption, credit: 'Fotografía: @ABRILMKT' }); };
  const cycle = (step: number) => { const index = photos.findIndex(p => p.id === media?.id); openPhoto((index + step + photos.length) % photos.length); };
  const scrollRail = (el: HTMLDivElement | null, dir: number) => el?.scrollBy({ left: dir * el.clientWidth * .78, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return <SdShell active="startupday" showLoader={entrance.showLoader} loaderDone={entrance.loaderDone} showCursor={false} cta={{ label: 'Sumarme', href: SD_XPLORA_SOCIALS.whatsapp }}><div className="sr-page" ref={root} aria-busy={!entrance.ready}>
    <a href="#recap" className="sr-skip">Ir al contenido</a>
    <main id="recap">
      <section className="sr-hero" aria-labelledby="sr-title">
        <picture><source media="(max-width: 599px)" srcSet="/recap/photo-28-640.webp 640w, /recap/photo-28-1280.webp 1280w" sizes="100vw" /><Photo id="hero" className="sr-hero-image" alt="Participantes de Startup Day reunidos en UCEMA" sizes="100vw" eager /></picture><div className="sr-hero-shade" />
        <div className="sr-hero-content"><div className="sr-hero-meta"><span>11 septiembre 2026</span><span>UCEMA · Buenos Aires</span></div>
          <h1 id="sr-title" aria-label="Startup Day"><span className="sr-title-line"><span>Startup</span></span><span className="sr-title-line"><span>Day<span className="sr-title-dot">.</span></span></span></h1><p className="sr-title-note">Así lo vivimos.</p>
          <div className="sr-hero-bottom"><p>Una idea nos trajo hasta acá.<br />Todo esto pasó cuando nos encontramos.</p><button onClick={() => setMedia(FILM)} className="sr-watch sr-watch--primary"><span className="sr-play"><Play /></span><span>Volvé a vivirlo</span></button></div>
        </div><a className="sr-hero-scroll" href="#historia"><span>El día terminó. La historia sigue.</span><Arrow direction="down" /></a>
      </section>

      <section className="sr-story sr-section" id="historia" aria-labelledby="sr-story-title"><div className="sr-story-copy"><h2 id="sr-story-title">{'Salimos con más preguntas. Más contactos. Más ganas de hacer.'.split(' ').map((word, i) => <span className="sr-story-word" key={i}>{word} </span>)}</h2></div><div className="sr-story-summary"><div className="sr-story-date"><span>Primera edición</span><time dateTime={SD_EVENT.dateISO}>11.09.26 · Buenos Aires</time></div><div className="sr-attendance" data-sr-reveal><span>360<span>+</span></span><p>personas acreditadas.</p></div></div></section>
      <RecapFilm open={setMedia} disabled={previewsDisabled} />

      <section className="sr-gallery sr-section" id="momentos" aria-labelledby="sr-gallery-title"><div className="sr-section-head" data-sr-reveal><h2 id="sr-gallery-title">Si estuviste, sabés.</h2></div>
        <div className="sr-gallery-tools"><div className="sr-filters" aria-label="Filtrar fotos">{['Todas', 'Encuentros', 'Charlas', 'Startups'].map(f => <button key={f} aria-pressed={filter === f} onClick={() => { setFilter(f); gallery.current?.scrollTo({ left: 0 }); }}>{f}</button>)}</div><div className="sr-rail-controls"><button onClick={() => scrollRail(gallery.current, -1)} aria-label="Ver fotos anteriores"><Arrow direction="right" /></button><button onClick={() => scrollRail(gallery.current, 1)} aria-label="Ver más fotos"><Arrow direction="right" /></button></div></div>
        <div className="sr-photo-rail" ref={gallery} aria-label="Fotografías del evento">{photos.map((photo, i) => <figure key={photo.id} className={`sr-photo sr-photo--${i % 3}`}><button aria-label={`Ampliar foto: ${photo.alt}`} onClick={() => openPhoto(i)}><Photo id={photo.id} alt={photo.alt} /><span className="sr-photo-expand"><Arrow /></span></button><figcaption><span>{String(i + 1).padStart(2, '0')}</span>{photo.caption}</figcaption></figure>)}</div><div className="sr-gallery-foot"><span>Deslizá para recorrer. Tocá para ampliar.</span><span>Fotos por @ABRILMKT</span></div>
      </section>

      <section className="sr-voices sr-section" id="voces" aria-labelledby="sr-voices-title"><div className="sr-section-head" data-sr-reveal><h2 id="sr-voices-title">Las voces de ese día.</h2><div className="sr-rail-controls"><button onClick={() => scrollRail(voices.current, -1)} aria-label="Videos anteriores"><Arrow direction="right" /></button><button onClick={() => scrollRail(voices.current, 1)} aria-label="Más videos"><Arrow direction="right" /></button></div></div><p className="sr-media-label">Fragmentos de las charlas.</p>
        <div className="sr-voice-rail" ref={voices}>{RECAP_VOICES.map(person => <article className="sr-voice" key={person.id}><RecapVideoPreview className="sr-voice-video" src={`/recap/preview-talk-${person.id}.mp4`} poster={`/recap/talk-${person.id}.webp`} alt={`${person.name}, de ${person.company}`} width={540} height={960} disabled={previewsDisabled} openLabel={`Ver a ${person.name}, ${person.company}`} onOpen={() => setMedia({ id: person.id, kind: 'video', src: `/recap/talk-${person.id}.mp4`, poster: `/recap/talk-${person.id}.webp`, alt: `${person.name} · ${person.company}`, caption: 'Un fragmento de su charla en Startup Day' })}><span className="sr-voice-play"><Play /><span>Ver charla</span><span>{person.duration}</span></span></RecapVideoPreview><div className="sr-voice-name"><h3>{person.name}</h3><span>{person.company}</span></div></article>)}</div>
      </section>

      <section className="sr-talks sr-section" aria-labelledby="sr-talks-title"><div className="sr-talks-intro" data-sr-reveal><h2 id="sr-talks-title">Las ideas tuvieron voz.</h2><p>Dos aulas. {SD_CHARLAS.length} charlas.</p></div><div className="sr-talk-list">{SD_CHARLAS.map(t => <div className="sr-talk" key={`${t.aula}-${t.from}`}><span>{t.name}</span><span>{t.speaker}</span></div>)}</div></section>

      <section className="sr-press sr-section" id="medios" aria-labelledby="sr-press-title"><div className="sr-section-head" data-sr-reveal><h2 id="sr-press-title">Xplora en los medios</h2></div><div className="sr-press-grid">{RECAP_PRESS.map(item => <article className="sr-press-item" key={item.id}><RecapVideoPreview className="sr-press-video" src={`/recap/preview-press-${item.id}.mp4`} poster={item.poster} alt={`Cobertura de Startup Day por ${item.title}`} width={1280} height={720} disabled={previewsDisabled} openLabel={`Ver cobertura de ${item.title}`} onOpen={() => setMedia({ id: item.id, kind: 'video', src: item.src, poster: item.poster, alt: item.title, caption: item.description })}><span className="sr-press-play"><Play /></span><span className="sr-press-watch">Ver cobertura</span></RecapVideoPreview><div className="sr-press-info"><div><h3>{item.title}</h3><p>{item.handle}</p></div><a href={item.href} target="_blank" rel="noopener noreferrer" aria-label={`Ver publicación original de ${item.title}`}><Arrow /></a></div></article>)}</div><a className="sr-press-mention" href="https://x.com/bd_rober/status/2099654373756342516" target="_blank" rel="noopener noreferrer"><span>La conversación siguió en X.</span><span>@bd_rober <Arrow /></span></a></section>

      <section className="sr-brands sr-section" id="marcas" aria-labelledby="sr-brands-title"><div className="sr-section-head" data-sr-reveal><h2 id="sr-brands-title">Los que dijeron «ahí estamos».</h2></div><div className="sr-brand-grid" id="sr-brand-grid">{(showAllBrands ? SD_STARTUPS : SD_STARTUPS.slice(0, 15)).map(company => <div key={company.id} className="sr-company"><img src={company.logoUrl} alt={company.name} loading="lazy" decoding="async" /><span>{company.name}</span></div>)}</div><button className="sr-text-link sr-brands-toggle" aria-expanded={showAllBrands} aria-controls="sr-brand-grid" onClick={() => setShowAllBrands(!showAllBrands)}>{showAllBrands ? 'Ver menos' : `Ver las ${SD_STARTUPS.length} organizaciones`}<Arrow direction={showAllBrands ? 'up' : 'down'} /></button><div className="sr-sponsors"><p>Gracias por hacerlo posible.</p><div>{SD_EDITION_SPONSORS.map(s => <a key={s.id} href={s.website} target="_blank" rel="noopener noreferrer"><img src={s.logoUrl} alt={s.name} loading="lazy" /></a>)}</div></div></section>
      <RecapOtherEvents />
      <section className="sr-community sr-section" id="comunidad" aria-labelledby="sr-community-title">
        <div className="sr-community-top"><img src={logoUrl || DEFAULT_LOGO_URL} alt="Xplora" width="72" height="72" /><span>Por y para emprendedores.</span></div>
        <h2 id="sr-community-title" data-sr-reveal>En el próximo,<br />enterate antes.</h2>
        <div className="sr-community-bottom">
          <div className="sr-community-invite">
            <p className="sr-community-proof">En Startup Day, los primeros <span>150</span> se llevaron la credencial de regalo.</p>
            <p className="sr-community-news">Sumate al newsletter de Xplora y recibí las novedades del próximo evento.</p>
            <a className="sr-watch sr-watch--primary sr-newsletter-cta" href={`${mainSiteUrl()}#newsletter`} aria-label="Quiero enterarme antes: suscribirme al newsletter de Xplora"><span>Quiero enterarme antes</span><Arrow direction="right" /></a>
          </div>
          <div className="sr-socials"><a href={SD_XPLORA_SOCIALS.instagram} target="_blank" rel="noopener noreferrer">Instagram<Arrow /></a><a href={SD_XPLORA_SOCIALS.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn<Arrow /></a><a href={SD_XPLORA_SOCIALS.whatsapp} target="_blank" rel="noopener noreferrer">La comunidad<Arrow /></a></div>
        </div>
      </section>
    </main>
    <RecapMediaDialog media={media} onClose={() => setMedia(null)} onNext={media?.kind === 'image' ? () => cycle(1) : undefined} onPrevious={media?.kind === 'image' ? () => cycle(-1) : undefined} />
  </div></SdShell>;
}
