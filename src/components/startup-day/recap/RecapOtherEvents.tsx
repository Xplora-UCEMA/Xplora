import { useEffect, useState } from 'react';
import { publicFetch } from '../../../lib/serverApi';
import { mainSiteUrl } from '../../../lib/startupDayHost';
import { loadRecapEvents, type RecapEvent } from '../../../lib/recapEvents';

// Selected archive entries; short display titles keep the original names in accessible links.
const DISPLAY_TITLES: Record<string, string> = {
  '25b2d0e2-0e74-417c-8c20-687d8837f739': 'Despegar: cómo pensar en grande',
  'b9f08b6d-b81a-4dfe-9845-0cde21eb0c83': 'Workshop de Claude y Obsidian',
  '6a2735d7-c992-4b46-8940-47c3f3e1581e': 'Panel de mujeres líderes',
};

function ArrowUpRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 18 18 6M6 6h12v12" />
    </svg>
  );
}

function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function EventImage({ event }: { event: RecapEvent }) {
  const [unavailable, setUnavailable] = useState(false);
  const image = event.image;
  return (
    <div className="sr-event-image">
      {image && isWebUrl(image) && !unavailable ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          width={800}
          height={600}
          onError={() => setUnavailable(true)}
        />
      ) : <span className="sr-event-image-fallback" aria-hidden="true">Xplora</span>}
      <span className="sr-event-play" aria-hidden="true"><ArrowUpRight /></span>
    </div>
  );
}

function EventCard({ event }: { event: RecapEvent }) {
  const upcoming = event.kind === 'upcoming';
  const action = upcoming ? (event.href ? 'Inscribirme' : 'Avisame del evento') : 'Ver la charla';
  const label = upcoming
    ? `${event.href ? 'Inscribirme a' : 'Recibir novedades de'} ${event.title}`
    : `Ver grabación de ${event.title}`;
  return (
    <li className="sr-event">
      <a href={event.href || `${mainSiteUrl()}#newsletter`} target={event.href ? '_blank' : undefined} rel={event.href ? 'noopener noreferrer' : undefined} aria-label={`${label}${event.href ? ' (abre en otra pestaña)' : ''}`}>
        <EventImage event={event} />
        <div className="sr-event-info">
          {event.date ? <p className="sr-event-date">{event.date}</p> : null}
          <h3>{(!upcoming && DISPLAY_TITLES[event.id]) || event.title}</h3>
          {event.speaker ? <p className="sr-event-speaker">{event.speaker}</p> : null}
          {upcoming && event.location ? <p className="sr-event-location">{event.location}</p> : null}
          <span className="sr-event-action">{action} <ArrowUpRight /></span>
        </div>
      </a>
    </li>
  );
}

export function RecapOtherEvents() {
  const [events, setEvents] = useState<RecapEvent[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const selection = await loadRecapEvents(publicFetch, controller.signal);
        if (controller.signal.aborted) return;
        setEvents(selection);
        setStatus('ready');
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  return (
    <section id="otros-eventos" className="sr-other-events sr-section" aria-labelledby="sr-other-events-title">
      <div className="sr-section-heading sr-other-events-heading" data-sr-reveal>
        <h2 id="sr-other-events-title">Más encuentros de Xplora.</h2>
      </div>

      {events.length ? (
        <ul className="sr-event-list" data-count={events.length} aria-label={events[0].kind === 'upcoming' ? 'Próximos eventos de Xplora' : 'Charlas anteriores de Xplora'}>
          {events.map(event => <EventCard event={event} key={event.id} />)}
        </ul>
      ) : (
        <p className="sr-events-status" role="status">
          {status === 'loading'
            ? 'Buscando otros encuentros de Xplora…'
            : status === 'error'
              ? 'Ahora no pudimos cargar los encuentros. Podés seguir conociendo el club en Xplora.'
              : 'Las próximas conversaciones siguen en Xplora. Conocé el club y enterate de los nuevos encuentros.'}
        </p>
      )}

      <a className="sr-text-link sr-other-events-link" href={`${mainSiteUrl()}#que-es`}>
        Conocé Xplora <ArrowUpRight />
      </a>
    </section>
  );
}

export default RecapOtherEvents;
