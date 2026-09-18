import { MemberEmptyState } from './MemberEmptyState';
import { useMemberAuth } from '../../context/MemberAuthContext';

export function MemberEventsPanel() {
  const { events } = useMemberAuth();

  return (
    <div className="ma-panel ma-panel--events">
      <header className="ma-panel__head">
        <h1 className="ma-title">Eventos</h1>
        <p className="ma-sub">Inscripciones y asistencias asociadas a tu email.</p>
      </header>

      {events.length === 0 ? (
        <MemberEmptyState
          title="Nos vemos en el próximo encuentro"
          copy="Inscribite con el email de tu cuenta para ver tus eventos acá."
          action={
            <a className="xp-button" href="/#proximo">
              Explorar eventos
            </a>
          }
        />
      ) : (
        <ul className="ma-event-grid">
          {events.map((ev) => (
            <li key={ev.id} className="ma-event-card">
              <div className="ma-event-card__media">
                {ev.thumbnailUrl ? (
                  <img src={ev.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <div className="ma-event-card__ph" aria-hidden>
                    <span>{ev.month || 'XP'}</span>
                    <strong>{ev.day || '—'}</strong>
                  </div>
                )}
                <span className={`ma-event-card__status${ev.asistio ? ' is-yes' : ''}`}>
                  {ev.asistio ? 'Asististe' : 'Inscripto'}
                </span>
              </div>

              <div className="ma-event-card__body">
                {ev.tagLabel ? <p className="ma-event-card__tag">{ev.tagLabel}</p> : null}
                <h2 className="ma-event-card__title">{ev.title}</h2>
                <ul className="ma-event-card__meta">
                  {ev.dateDisplay ? <li>{ev.dateDisplay}</li> : null}
                  {ev.location ? <li>{ev.location}</li> : null}
                  {ev.modality ? <li>{ev.modality}</li> : null}
                </ul>
                {ev.summary ? <p className="ma-event-card__summary">{ev.summary}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
