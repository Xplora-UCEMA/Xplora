import { useEffect, useState, type ReactNode } from 'react';
import { useSiteMedia } from '../../context/SiteMediaContext';
import { DEFAULT_CLUB_MODES } from '../../lib/defaultsMedia';

const MODE_COPY = [
  { id: 'net', title: 'Networking', text: 'Founders, peers e inversores. Cara a cara.' },
  { id: 'jobs', title: 'Empleo', text: 'Oportunidades en startups y tech del ecosistema.' },
  { id: 'build', title: 'Emprender', text: 'Workshops, pitch y stands. Aprendés haciendo.' },
  { id: 'voices', title: 'Referentes', text: 'Charlas de primera mano con quien ya construyó.' },
] as const;

/** Paneles que se expanden al hover / focus. Fotos desde site media (panel Web). */
export function XploraModes() {
  const { clubModes } = useSiteMedia();
  const [active, setActive] = useState(0);

  const modes = MODE_COPY.map((m, i) => ({
    ...m,
    img: clubModes[i]?.url || DEFAULT_CLUB_MODES[i]!.url,
  }));

  return (
    <div className="xp-modes" role="tablist" aria-label="Qué hace Xplora">
      {modes.map((m, i) => {
        const on = i === active;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={on}
            className={`xp-mode${on ? ' is-on' : ''}`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
          >
            <span className="xp-mode__media" aria-hidden>
              <img src={m.img} alt="" loading="lazy" decoding="async" />
            </span>
            <span className="xp-mode__veil" aria-hidden />
            <span className="xp-mode__meta">
              <span className="xp-mode__n">{String(i + 1).padStart(2, '0')}</span>
              <span className="xp-mode__title">{m.title}</span>
              <span className="xp-mode__text">{m.text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
/** Hero foto full-bleed — sin RAF / parallax (performance). */
export function XploraHeroPhoto({
  src,
  alt,
  children,
}: {
  src: string;
  alt: string;
  children: ReactNode;
}) {
  return (
    <section className="xp-hero">
      <img
        className="xp-hero__img"
        src={src}
        alt={alt}
        fetchPriority="high"
        decoding="async"
      />
      <div className="xp-hero__veil" aria-hidden />
      <div className="xp-hero__content">{children}</div>
    </section>
  );
}

/** Secciones cream: el rail pasa a tinta para no perderse. */
const RAIL_LIGHT_IDS = new Set(['proximo', 'empresas', 'faq']);

/** Rail de capítulos — estándar de landings tech largas. */
export function XploraRail({
  items,
}: {
  items: { id: string; label: string }[];
}) {
  const [current, setCurrent] = useState(items[0]?.id ?? '');
  const light = RAIL_LIGHT_IDS.has(current);

  useEffect(() => {
    const nodes = items
      .map((it) => document.getElementById(it.id))
      .filter((n): n is HTMLElement => Boolean(n));
    if (!nodes.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setCurrent(visible.target.id);
      },
      { rootMargin: '-40% 0px -45% 0px', threshold: 0 },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav
      className={`xp-rail${light ? ' is-light' : ''}`}
      aria-label="Secciones"
    >
      {items.map((it) => (
        <a
          key={it.id}
          href={`#${it.id}`}
          className={`xp-rail__dot${current === it.id ? ' is-on' : ''}`}
          aria-current={current === it.id ? 'true' : undefined}
          title={it.label}
        >
          <span className="xp-rail__label">{it.label}</span>
        </a>
      ))}
    </nav>
  );
}
