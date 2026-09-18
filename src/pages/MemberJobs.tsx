/**
 * Bolsa de empleo — solo con cuenta de miembro.
 */
import { useEffect, useState } from 'react';
import { MemberEmptyState } from '../components/member/MemberEmptyState';
import { MemberShell } from '../components/member/MemberShell';
import { useMemberAuth } from '../context/MemberAuthContext';
import { memberFetch } from '../lib/memberAuth';
import { normalizePath } from '../lib/routes';
import '../styles/memberAccount.css';
import '../styles/points.css';

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  area: string;
  description: string;
  application_link: string;
};

export default function MemberJobs() {
  const { account, loading } = useMemberAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [err, setErr] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(false);

  useEffect(() => {
    if (!account) return;
    setLoadingJobs(true);
    setErr('');
    void (async () => {
      const res = await memberFetch('/api/member/jobs');
      setLoadingJobs(false);
      if (!res.ok) {
        setErr('No se pudieron cargar las ofertas. Probá de nuevo en un momento.');
        setJobs([]);
        return;
      }
      const data = (await res.json()) as { jobs: Job[] };
      setJobs(data.jobs ?? []);
    })();
  }, [account]);

  useEffect(() => {
    if (loading || account) return;
    if (normalizePath(window.location.pathname) === '/cuenta') return;
    window.history.replaceState({}, '', '/cuenta');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [loading, account]);

  if (loading) {
    return (
      <div className="ma-app">
        <p className="ma-empty">Cargando…</p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="ma-app">
        <div className="ma-panel ma-panel--narrow">
          <MemberEmptyState
            title="Iniciá sesión"
            copy="La bolsa de empleo es solo para miembros de Xplora."
            action={
              <a className="ma-btn ma-btn--ghost" href="/cuenta">
                Ir a mi cuenta
              </a>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <MemberShell active="empleo">
      <div className="ma-panel">
        <header className="ma-panel__head">
          <h1 className="ma-title">Bolsa de empleo</h1>
          <p className="ma-sub">Ofertas para miembros de Xplora.</p>
        </header>

        {loadingJobs ? <p className="ma-empty">Cargando ofertas…</p> : null}

        {!loadingJobs && err ? (
          <MemberEmptyState title="No se pudo cargar" copy={err} />
        ) : null}

        {!loadingJobs && !err && jobs.length === 0 ? (
          <MemberEmptyState
            title="Todavía no hay ofertas"
            copy="Cuando publiquemos roles de la comunidad, van a aparecer acá. Mientras tanto, completá tu perfil."
            action={
              <a className="ma-btn ma-btn--ghost" href="/cuenta/perfil">
                Completar perfil
              </a>
            }
          />
        ) : null}

        {!loadingJobs && !err && jobs.length > 0 ? (
          <ul className="ma-jobs">
            {jobs.map((job) => (
              <li key={job.id} className="ma-job">
                <div>
                  <h2 className="ma-job__title">{job.title}</h2>
                  <p className="ma-job__meta">
                    {[job.company, job.location, job.type, job.area].filter(Boolean).join(' · ')}
                  </p>
                  {job.description ? <p className="ma-job__desc">{job.description}</p> : null}
                  {job.application_link ? (
                    <a
                      className="ma-btn ma-btn--ghost"
                      href={job.application_link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Postularme
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </MemberShell>
  );
}
