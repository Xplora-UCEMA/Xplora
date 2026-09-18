import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useMemberAuth } from '../../context/MemberAuthContext';
import { fetchEventos } from '../../lib/db';
import { getEventDate, pickEarliestUpcoming } from '../../lib/eventDate';
import { memberFetch } from '../../lib/memberAuth';
import { isMemberHubPreview } from '../../lib/memberHubPreview';
import { pointsLabel, pointsRequest, type PointsSnapshot } from '../../lib/points';
import type { Evento } from '../../types';
import { MemberArrow } from './MemberArrow';
import { MemberIcon } from './MemberIcon';
import { PointMark } from './PointMark';

type DashboardTask = {
  id: string;
  title: string;
  kind: 'event' | 'survey' | 'google_form';
  points: number;
  date: string;
  status: 'available' | 'registered' | 'pending' | 'completed';
  href: string | null;
};

type DashboardJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  area: string;
};

type LoadState = {
  points: PointsSnapshot | null;
  pointsLoading: boolean;
  pointsUnavailable: boolean;
  pointsError: boolean;
  tasks: DashboardTask[];
  tasksLoading: boolean;
  tasksError: boolean;
  jobs: DashboardJob[];
  jobsLoading: boolean;
  jobsError: boolean;
  events: Evento[];
  eventsLoading: boolean;
  eventsError: boolean;
};

const initialState: LoadState = {
  points: null,
  pointsLoading: true,
  pointsUnavailable: false,
  pointsError: false,
  tasks: [],
  tasksLoading: true,
  tasksError: false,
  jobs: [],
  jobsLoading: true,
  jobsError: false,
  events: [],
  eventsLoading: true,
  eventsError: false,
};

const previewState: LoadState = {
  points: {
    balance: '150',
    streaks: { commitment: 2, consecutive: 1 },
    program: { notice: '', closes_at: null },
    rewards: [
      { id: 'preview-reward-1', title: 'Entrada a LaBitConf', description: 'Acceso a la comunidad.', cost: 150, active: true, per_member: 1, available: 3, redeemed: 0 },
      { id: 'preview-reward-2', title: 'Mentoría 1:1', description: 'Una conversación con un founder.', cost: 240, active: true, per_member: 1, available: 4, redeemed: 0 },
    ],
    ledger: [],
    redemptions: [],
  },
  pointsLoading: false,
  pointsUnavailable: false,
  pointsError: false,
  tasks: [{ id: 'preview-task', title: 'Contanos cómo estuvo Startup Day', kind: 'survey', points: 30, date: '2099-09-30T23:59:00Z', status: 'available', href: null }],
  tasksLoading: false,
  tasksError: false,
  jobs: [
    { id: 'preview-job-1', title: 'Product Analyst', company: 'Núcleo', location: 'Buenos Aires', type: 'Híbrido', area: 'Producto' },
    { id: 'preview-job-2', title: 'Founders Associate', company: 'Lumen', location: 'Remoto', type: 'Full time', area: 'Estrategia' },
  ],
  jobsLoading: false,
  jobsError: false,
  events: [{ id: 'preview-event', emoji: '✦', day: '28', month: 'SEP', tagLabel: 'Founder Sessions', tagType: 'p', title: 'De cero a tu primera venta', date: '28 de septiembre de 2099 · 18:30', location: 'UCEMA · Reconquista 775', desc: 'Una conversación honesta sobre los primeros clientes.', speakerInitials: 'XP', speakerName: 'Comunidad Xplora', speakerRole: '' }],
  eventsLoading: false,
  eventsError: false,
};

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] || 'Xplorer';
}

function formatEventDate(event: Evento): { day: string; month: string; long: string } {
  const value = getEventDate(event);
  if (!value) return { day: event.day || '—', month: event.month || '', long: event.date };
  return {
    day: value.toLocaleDateString('es-AR', { day: '2-digit' }),
    month: value.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase(),
    long: value.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }),
  };
}

function formatTaskDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function profileScore(account: NonNullable<ReturnType<typeof useMemberAuth>['account']>) {
  const profileName = account.firstName?.trim() || account.displayName?.trim() || '';
  const checks = [
    { label: 'tu nombre', done: Boolean(profileName && !profileName.includes('@')) },
    { label: 'tu teléfono', done: Boolean(account.phone) },
    { label: 'tu foto', done: Boolean(account.avatarUrl) },
    { label: 'tu formación', done: account.studies.length > 0 },
    { label: 'tu experiencia', done: account.jobs.length > 0 },
    { label: 'tus habilidades', done: account.skills.length > 0 },
    { label: 'tus idiomas', done: account.languages.length > 0 },
    { label: 'tu CV', done: Boolean(account.cvUrl) },
  ];
  const complete = checks.filter((item) => item.done).length;
  return {
    percent: Math.round((complete / checks.length) * 100),
    next: checks.find((item) => !item.done)?.label ?? '',
  };
}

export function MemberDashboard() {
  const { account, events: memberEvents, refresh } = useMemberAuth();
  const [data, setData] = useState<LoadState>(initialState);

  useEffect(() => {
    let alive = true;
    let run = 0;
    const update = (id: number, patch: Partial<LoadState>) => {
      if (alive && id === run) setData((current) => ({ ...current, ...patch }));
    };
    function load() {
      const id = ++run;
      if (isMemberHubPreview()) {
        setData(previewState);
        return;
      }
      setData((current) => ({
        ...current,
        pointsLoading: true, pointsError: false,
        tasksLoading: true, tasksError: false,
        jobsLoading: true, jobsError: false,
        eventsLoading: true, eventsError: false,
      }));
      void pointsRequest<PointsSnapshot | { available: false }>('/api/member/points')
        .then((result) => update(id, 'available' in result
          ? { points: null, pointsUnavailable: true }
          : { points: result, pointsUnavailable: false }))
        .catch(() => update(id, { pointsError: true }))
        .finally(() => update(id, { pointsLoading: false }));
      void pointsRequest<{ tasks: DashboardTask[] }>('/api/member/points/tasks')
        .then((result) => update(id, { tasks: result.tasks ?? [] }))
        .catch(() => update(id, { tasksError: true }))
        .finally(() => update(id, { tasksLoading: false }));
      void memberFetch('/api/member/jobs').then(async (response) => {
          if (!response.ok) throw new Error('jobs');
          return response.json() as Promise<{ jobs: DashboardJob[] }>;
        })
        .then((result) => update(id, { jobs: result.jobs ?? [] }))
        .catch(() => update(id, { jobsError: true }))
        .finally(() => update(id, { jobsLoading: false }));
      void fetchEventos()
        .then((events) => update(id, { events }))
        .catch(() => update(id, { eventsError: true }))
        .finally(() => update(id, { eventsLoading: false }));
    }
    load();
    const refreshOnReturn = () => {
      if (document.hidden) return;
      void refresh();
      load();
    };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      alive = false;
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [refresh]);

  const nextEvent = useMemo(() => pickEarliestUpcoming(data.events), [data.events]);
  const eventDate = nextEvent ? formatEventDate(nextEvent) : null;
  const registered = Boolean(nextEvent && memberEvents.some((event) => event.eventoId === nextEvent.id));
  const balance = BigInt(data.points?.balance ?? '0');
  const programClosed = Boolean(data.points?.program.closes_at && new Date(data.points.program.closes_at).getTime() <= Date.now());
  const availableTasks = data.tasks.filter((task) => task.status === 'available').slice(0, 3);
  const allRewards = data.points?.rewards.filter((reward) => reward.active && reward.available > 0) ?? [];
  const eligibleRewards = programClosed ? [] : allRewards
    .filter((reward) => reward.redeemed < reward.per_member)
    .sort((a, b) => {
      const missingA = BigInt(a.cost) > balance ? BigInt(a.cost) - balance : 0n;
      const missingB = BigInt(b.cost) > balance ? BigInt(b.cost) - balance : 0n;
      return missingA < missingB ? -1 : missingA > missingB ? 1 : a.cost - b.cost;
    });
  const rewards = eligibleRewards.slice(0, 2);
  const nextReward = eligibleRewards[0] ?? null;
  const nextRewardCost = BigInt(nextReward?.cost ?? 0);
  const nextRewardReady = Boolean(nextReward && balance >= nextRewardCost);
  const nextRewardProgress = nextRewardReady ? 100 : nextReward && nextRewardCost > 0n
    ? Math.min(100, Number((balance * 100n) / nextRewardCost)) : 0;
  const profile = account ? profileScore(account) : { percent: 0, next: '' };
  const accountName = account?.firstName?.trim() || account?.displayName?.trim() || '';
  const displayName = accountName && !accountName.includes('@') ? accountName : 'Xplorer';
  const greeting = new Date().getHours() < 12 ? 'Buen día' : new Date().getHours() < 20 ? 'Buenas tardes' : 'Buenas noches';

  if (!account) return null;

  return (
    <div className="mh-dashboard">
      <header className="mh-welcome">
        <div>
          <p className="mh-eyebrow">Tu espacio en Xplora</p>
          <h1>{greeting}, {firstName(displayName)}.</h1>
          <p>Todo lo que necesitás para aprovechar la comunidad, en un solo lugar.</p>
        </div>
        <a className="mh-profile-chip" href="/cuenta/perfil" aria-label={`Perfil completo al ${profile.percent}%`}>
          <span className="mh-avatar" aria-hidden="true">
            {account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : firstName(displayName).slice(0, 1).toUpperCase()}
          </span>
          <span><small>Mi perfil</small><strong>{profile.percent}% completo</strong></span>
          <MemberArrow />
        </a>
      </header>

      <>
          <section className="mh-spotlight" aria-label="Resumen de tu cuenta">
            <article className="mh-points-card">
              <div className="mh-points-card__glow" aria-hidden="true" />
              <header className="mh-points-card__header">
                <div><p className="mh-card-kicker">Xplora Points</p><span>Tu saldo en la comunidad</span></div>
                <div className="mh-points-card__mark"><PointMark large /></div>
              </header>

              {data.points ? (
                <>
                  <div className="mh-balance" aria-label={`${pointsLabel(data.points.balance)} points disponibles`}>
                    <strong>{pointsLabel(data.points.balance)}</strong>
                    <span><b>XP</b><small>disponibles</small></span>
                  </div>

                  {nextReward ? (
                    <div className={`mh-points-card__reward${nextRewardReady ? ' is-ready' : ''}`}>
                      <div className="mh-points-card__reward-head">
                        <div><span>{nextRewardReady ? 'Beneficio desbloqueado' : 'Próximo beneficio'}</span><strong>{nextReward.title}</strong></div>
                        <b>{nextRewardReady ? 'Listo' : `${nextRewardProgress}%`}</b>
                      </div>
                      <div className="mh-points-card__progress" aria-hidden="true"><span style={{ width: `${nextRewardProgress}%` }} /></div>
                      <p>{nextRewardReady
                        ? 'Ya tenés los points necesarios para canjearlo.'
                        : `Te faltan ${pointsLabel(String(nextRewardCost - balance))} points para llegar.`}</p>
                    </div>
                  ) : <p className="mh-points-card__hint">{programClosed
                    ? 'Los canjes están cerrados por ahora.'
                    : allRewards.length ? 'Ya aprovechaste los beneficios disponibles.' : 'Sumá points participando de la comunidad.'}</p>}
                </>
              ) : (
                <p className="mh-points-card__hint" role={data.pointsLoading ? 'status' : undefined}>
                  {data.pointsLoading ? 'Cargando tu saldo…' : data.pointsUnavailable ? 'Points estará disponible muy pronto.' : 'No pudimos cargar tu saldo ahora.'}
                </p>
              )}

              <div className="mh-points-card__actions">
                <a href="/cuenta?vista=recompensas">Explorar beneficios <MemberArrow /></a>
                <a href="/cuenta?vista=movimientos">Ver movimientos</a>
              </div>
            </article>

            <article className="mh-event-card">
              {nextEvent ? (
                <>
                  <div className="mh-event-card__media">
                    {nextEvent.homePosterUrl || nextEvent.thumbnailUrl ? (
                      <img src={nextEvent.homePosterUrl || nextEvent.thumbnailUrl} alt="" />
                    ) : <span aria-hidden="true">{nextEvent.emoji || '✦'}</span>}
                  </div>
                  <div className="mh-event-card__body">
                    <div className="mh-section-label"><span>Próximo evento</span>{registered ? <strong>Ya estás inscripto</strong> : null}</div>
                    <div className="mh-event-card__date" aria-label={eventDate?.long}>
                      <strong>{eventDate?.day}</strong><span>{eventDate?.month}</span>
                    </div>
                    <div className="mh-event-card__content">
                      <p>{nextEvent.tagLabel || 'Evento Xplora'}</p>
                      <h2>{nextEvent.title}</h2>
                      <span>{[eventDate?.long, nextEvent.location].filter(Boolean).join(' · ')}</span>
                    </div>
                    <a className="mh-card-action" href={registered ? '/cuenta/eventos' : nextEvent.registrationLink || '/#proximo'} target={!registered && nextEvent.registrationLink ? '_blank' : undefined} rel="noreferrer">
                      {registered ? 'Ver mis eventos' : nextEvent.registrationLink ? 'Reservar mi lugar' : 'Conocer el evento'} <MemberArrow up={!registered && Boolean(nextEvent.registrationLink)} />
                    </a>
                  </div>
                </>
              ) : (
                <div className="mh-card-empty">
                  <span className="mh-card-empty__icon"><MemberIcon name="calendar" /></span>
                  <p className="mh-card-kicker">Próximos eventos</p>
                  <h2>{data.eventsLoading ? 'Buscando la próxima fecha…' : data.eventsError ? 'No pudimos cargar la agenda.' : 'La próxima fecha se está cocinando.'}</h2>
                  <p>{data.eventsLoading ? 'Un momento, ya casi está.' : data.eventsError ? 'Podés revisar la agenda pública mientras tanto.' : 'Te avisamos apenas haya un nuevo encuentro.'}</p>
                  <a href="/cuenta/eventos">Ver mis eventos <MemberArrow /></a>
                </div>
              )}
            </article>
          </section>

          <div className="mh-content-grid">
            <div className="mh-content-grid__main">
              <section className="mh-card mh-actions" aria-labelledby="mh-actions-title">
                <header className="mh-card-head">
                  <div><p className="mh-card-kicker">Para vos</p><h2 id="mh-actions-title">Próximas acciones</h2></div>
                  <a href="/cuenta?vista=tasks">Ver todas <MemberArrow /></a>
                </header>
                {data.tasksLoading && !data.tasks.length ? <p className="mh-inline-state" role="status">Cargando tus acciones…</p>
                  : data.tasksError ? <p className="mh-inline-state">No pudimos cargar las acciones ahora.</p>
                  : availableTasks.length ? <ul className="mh-action-list">{availableTasks.map((task) => (
                    <li key={`${task.kind}:${task.id}`}>
                      <span className="mh-list-icon"><MemberIcon name={task.kind === 'event' ? 'calendar' : 'form'} /></span>
                      <div><h3>{task.title}</h3><p>{task.kind === 'event' ? 'Evento' : task.kind === 'survey' ? 'Encuesta' : 'Formulario'}{formatTaskDate(task.date) ? ` · ${formatTaskDate(task.date)}` : ''}</p></div>
                      <strong>+{pointsLabel(task.points)} <small>pts</small></strong>
                      <a href={task.kind === 'survey' || !task.href || new Date(task.date).getTime() <= Date.now() ? '/cuenta?vista=tasks' : task.href} target={task.href && task.kind !== 'survey' && new Date(task.date).getTime() > Date.now() ? '_blank' : undefined} rel="noreferrer" aria-label={`Abrir ${task.title}`}><MemberArrow up={Boolean(task.href && task.kind !== 'survey' && new Date(task.date).getTime() > Date.now())} /></a>
                    </li>
                  ))}</ul>
                  : <div className="mh-inline-empty"><span>✓</span><div><h3>Estás al día</h3><p>No tenés acciones pendientes por ahora.</p></div></div>}
              </section>

              <section className="mh-card mh-jobs-preview" aria-labelledby="mh-jobs-title">
                <header className="mh-card-head">
                  <div><p className="mh-card-kicker">Comunidad</p><h2 id="mh-jobs-title">Oportunidades para vos</h2></div>
                  <a href="/empleo">Ver la bolsa <MemberArrow /></a>
                </header>
                {data.jobsLoading && !data.jobs.length ? <p className="mh-inline-state" role="status">Cargando oportunidades…</p>
                  : data.jobsError ? <p className="mh-inline-state">No pudimos cargar las oportunidades ahora.</p>
                  : data.jobs.length ? <ul>{data.jobs.slice(0, 3).map((job) => (
                    <li key={job.id}><a href="/empleo"><span className="mh-list-icon"><MemberIcon name="briefcase" /></span><div><h3>{job.title}</h3><p>{[job.company, job.location, job.type].filter(Boolean).join(' · ')}</p></div><MemberArrow /></a></li>
                  ))}</ul>
                  : <div className="mh-inline-empty"><span>↗</span><div><h3>Nuevas búsquedas, pronto</h3><p>Completá tu perfil para estar listo cuando aparezcan.</p></div></div>}
              </section>
            </div>

            <aside className="mh-content-grid__rail" aria-label="Beneficios y perfil">
              <section className="mh-card mh-rewards-preview" aria-labelledby="mh-rewards-title">
                <header className="mh-card-head">
                  <div><p className="mh-card-kicker">Beneficios</p><h2 id="mh-rewards-title">Podés llegar a esto</h2></div>
                </header>
                {data.pointsLoading && !data.points ? <p className="mh-inline-state" role="status">Cargando beneficios…</p>
                  : programClosed ? <p className="mh-inline-state">Los canjes están cerrados por ahora.</p> : rewards.length ? <ul>{rewards.map((reward) => {
                  const missing = BigInt(reward.cost) - balance;
                  return <li key={reward.id}><div><h3>{reward.title}</h3><p>{missing <= 0n ? 'Disponible para canjear' : `Te faltan ${pointsLabel(String(missing))} points`}</p></div><strong>{pointsLabel(reward.cost)} <small>pts</small></strong></li>;
                })}</ul> : <p className="mh-inline-state">{allRewards.length
                  ? 'Ya aprovechaste los beneficios disponibles.' : 'Estamos preparando nuevos beneficios para la comunidad.'}</p>}
                <a className="mh-card-link" href="/cuenta?vista=recompensas">Explorar beneficios <MemberArrow /></a>
              </section>

              <section className="mh-card mh-profile-progress" aria-labelledby="mh-profile-title">
                <div className="mh-progress-ring" style={{ '--mh-progress': `${profile.percent}%` } as CSSProperties}><span>{profile.percent}%</span></div>
                <div>
                  <p className="mh-card-kicker">Tu perfil</p>
                  <h2 id="mh-profile-title">Mostrá lo que sabés hacer.</h2>
                  <p>{profile.next ? `Sumá ${profile.next} para que la comunidad te conozca mejor.` : 'Tu perfil está completo y listo para conectar.'}</p>
                  <a href="/cuenta/perfil">{profile.percent === 100 ? 'Revisar mi perfil' : 'Completar mi perfil'} <MemberArrow /></a>
                </div>
              </section>

              <section className="mh-community-links" aria-label="Más de tu comunidad">
                <a href="/cuenta/eventos"><span><MemberIcon name="calendar" /></span><div><strong>Mis eventos</strong><small>{memberEvents.length ? `${memberEvents.length} en tu historial` : 'Tu historial de encuentros'}</small></div><MemberArrow /></a>
                <a href="/cuenta/propuestas"><span><MemberIcon name="bulb" /></span><div><strong>Proponer una idea</strong><small>Ayudanos a construir lo próximo</small></div><MemberArrow /></a>
              </section>
            </aside>
          </div>
      </>
    </div>
  );
}
