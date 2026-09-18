import { useCallback, useEffect, useState } from "react";
import { pointsLabel, pointsRequest, type PointsAction } from "../../lib/points";
import { MemberIcon } from './MemberIcon';
import { MemberEmptyState } from './MemberEmptyState';

type Task = {
  id: string; title: string; kind: 'event' | 'survey' | 'google_form'; points: number; date: string;
  status: 'available' | 'registered' | 'pending' | 'completed'; href: string | null;
};

export function MemberTasks({ closed, onSelect, refreshKey }: {
  closed: boolean; onSelect: (action: PointsAction) => void; refreshKey: object;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<'available' | 'completed'>('available');
  const load = useCallback(async () => {
    setError(false); setLoading(true);
    try { const result = await pointsRequest<{ tasks: Task[] }>('/api/member/points/tasks'); setTasks(result.tasks); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!closed) void load(); }, [load, closed, refreshKey]);
  const pending = tasks.filter(task => task.status !== 'completed');
  const completed = tasks.filter(task => task.status === 'completed');
  const rows = (items: Task[]) => <ul className="xp-task-list">{items.map(task => <li key={`${task.kind}:${task.id}`}>
    <span className="xp-task-icon"><MemberIcon name={task.status === 'completed' ? 'check' : task.kind === 'event' ? 'calendar' : 'form'} /></span>
    <div className="xp-task-copy"><h3>{task.title}</h3><p>
      {task.kind === 'google_form' ? 'Google Forms · hasta ' : task.kind === 'survey' ? 'Encuesta · hasta ' : 'Evento · '}
      <time dateTime={task.date}>{new Date(task.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}</time>
    </p>{task.kind === 'google_form' && task.status !== 'completed' ? <p>Usá el mismo correo de tu cuenta de Xplora.</p> : null}</div>
    <span className="xp-task-points">+{pointsLabel(task.points)} <small>{task.kind === 'event' ? 'pts base' : 'pts'}</small></span>
    <div className="xp-task-action">{task.status === 'completed' ? <span>Completada</span>
      : task.status === 'registered' ? <span>Ya estás inscripto</span>
      : task.status === 'pending' ? <span>Sin asistencia confirmada</span>
      : task.kind === 'survey' ? <button className="xp-button" onClick={() => onSelect({
        id: task.id, title: task.title, kind: 'survey', points: task.points, expires_at: task.date, event_id: null,
      })}>Completar encuesta</button>
      : task.href && new Date(task.date).getTime() > Date.now() ? <a className="xp-button" href={task.href} target="_blank" rel="noreferrer">{task.kind === 'google_form' ? 'Completar formulario' : 'Inscribirme'}</a>
      : <span>Inscripción no disponible</span>}
    </div>
  </li>)}</ul>;
  return <section className="xp-tasks" aria-labelledby="tasks-title">
    <h2 id="tasks-title" tabIndex={-1}>Sumá Points.</h2>
    {!closed ? <div className="xp-task-filters" role="group" aria-label="Filtrar acciones">
      <button type="button" aria-pressed={filter === 'available'} onClick={() => setFilter('available')}>Disponibles</button>
      <button type="button" aria-pressed={filter === 'completed'} onClick={() => setFilter('completed')}>Completadas{completed.length ? ` (${completed.length})` : ''}</button>
    </div> : null}
    {closed ? <p className="xp-empty">El programa finalizó.</p>
      : loading ? <p role="status">Cargando tareas…</p>
      : error ? <div className="xp-error" role="alert">No pudimos cargar las tareas. <button className="xp-text-button" onClick={() => void load()}>Reintentar tareas</button></div>
      : filter === 'available' ? pending.length ? rows(pending) : <MemberEmptyState headingLevel={3} title="Estás al día" copy="No hay tareas disponibles por ahora." action={<a className="xp-text-button" href="/#proximo">Explorar eventos</a>} />
        : completed.length ? rows(completed) : <MemberEmptyState headingLevel={3} title="Tu próxima acción cuenta" copy="Las acciones que completes van a aparecer acá." />}
  </section>;
}
