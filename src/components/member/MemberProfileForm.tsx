import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMemberAuth } from '../../context/MemberAuthContext';
import {
  MEMBER_LANGUAGE_LEVELS,
  MEMBER_LANGUAGE_POOL,
  MEMBER_SKILL_POOL,
  joinDisplayName,
  memberYearOptions,
  splitDisplayName,
} from '../../data/memberProfileOptions';
import { memberFetch, type MemberProfile } from '../../lib/memberAuth';

type Study = { institution: string; degree: string; year?: string };
type Job = {
  company: string;
  role: string;
  from?: string;
  to?: string;
  current?: boolean;
  description?: string;
};
type Lang = { name: string; level: string };

function emptyStudy(): Study {
  return { institution: '', degree: '', year: '' };
}
function emptyJob(): Job {
  return { company: '', role: '', from: '', to: '', current: false, description: '' };
}
function emptyLang(): Lang {
  return { name: '', level: '' };
}

function Avatar({ account }: { account: MemberProfile }) {
  if (account.avatarUrl) {
    return <img className="ma-avatar" src={account.avatarUrl} alt="" />;
  }
  const letter = (account.displayName || account.email || '?').slice(0, 1).toUpperCase();
  return (
    <div className="ma-avatar ma-avatar--ph" aria-hidden>
      {letter}
    </div>
  );
}

export function MemberProfileForm() {
  const { account, refresh } = useMemberAuth();
  const years = useMemo(() => memberYearOptions(), []);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [skillQuery, setSkillQuery] = useState('');
  const [studies, setStudies] = useState<Study[]>([emptyStudy()]);
  const [jobs, setJobs] = useState<Job[]>([emptyJob()]);
  const [languages, setLanguages] = useState<Lang[]>([emptyLang()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!account) return;
    const { firstName: f, lastName: l } = splitDisplayName(account.displayName);
    setFirstName(account.firstName || f);
    setLastName(account.lastName || l);
    setPhone(account.phone);
    setSkills(account.skills);
    setStudies(account.studies.length ? account.studies.map((s) => ({ ...s })) : [emptyStudy()]);
    setJobs(
      account.jobs.length
        ? account.jobs.map((j) => ({
            company: j.company,
            role: j.role,
            from: j.from || '',
            to: j.to || '',
            current: Boolean(j.current),
            description: j.description || '',
          }))
        : [emptyJob()],
    );
    setLanguages(account.languages.length ? account.languages.map((x) => ({ ...x })) : [emptyLang()]);
  }, [account]);

  if (!account) return null;

  const skillSuggestions = MEMBER_SKILL_POOL.filter((s) => {
    const q = skillQuery.trim().toLowerCase();
    if (!q) return false;
    if (skills.some((x) => x.toLowerCase() === s.toLowerCase())) return false;
    return s.toLowerCase().includes(q);
  }).slice(0, 8);

  const addSkill = (raw: string) => {
    const s = raw.trim().replace(/\s+/g, ' ').slice(0, 64);
    if (!s) return;
    if (skills.some((x) => x.toLowerCase() === s.toLowerCase())) {
      setSkillQuery('');
      return;
    }
    setSkills((prev) => [...prev, s].slice(0, 40));
    setSkillQuery('');
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setMsg('');
    const displayName = joinDisplayName(firstName, lastName);
    if (!firstName.trim() || !lastName.trim()) {
      setBusy(false);
      setErr('Completá nombre y apellido.');
      return;
    }
    const res = await memberFetch('/api/member/me', {
      method: 'PATCH',
      body: JSON.stringify({
        displayName,
        firstName,
        lastName,
        phone: phone.trim(),
        skills,
        studies: studies
          .map((s) => ({
            institution: s.institution.trim(),
            degree: s.degree.trim(),
            year: s.year?.trim() || undefined,
          }))
          .filter((s) => s.institution || s.degree),
        jobs: jobs
          .map((j) => ({
            company: j.company.trim(),
            role: j.role.trim(),
            from: j.from?.trim() || undefined,
            to: j.current ? undefined : j.to?.trim() || undefined,
            current: Boolean(j.current),
            description: j.description?.trim() || undefined,
          }))
          .filter((j) => j.company || j.role),
        languages: languages
          .map((l) => ({ name: l.name.trim(), level: l.level.trim() }))
          .filter((l) => l.name),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error || 'No se pudo guardar');
      return;
    }
    setMsg('Perfil guardado');
    await refresh();
  };

  const onAvatar = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setErr('');
    const fd = new FormData();
    fd.append('file', file);
    const res = await memberFetch('/api/member/me/avatar', { method: 'POST', body: fd });
    setBusy(false);
    if (!res.ok) {
      setErr('No se pudo subir la foto');
      return;
    }
    await refresh();
  };

  const onCv = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setErr('');
    setMsg('');
    const fd = new FormData();
    fd.append('cv', file);
    const res = await memberFetch('/api/member/me/cv', { method: 'POST', body: fd });
    setBusy(false);
    if (!res.ok) {
      setErr('No se pudo subir el CV');
      return;
    }
    setMsg('CV actualizado');
    await refresh();
  };

  return (
    <div className="ma-panel">
      <header className="ma-panel__head">
        <h1 className="ma-title">Mi perfil</h1>
        <p className="ma-sub">Tu información en la comunidad.</p>
      </header>

      <div className="ma-profile-hero">
        <Avatar account={account} />
        <div>
          <p className="ma-muted">{account.email}</p>
          <label className="ma-file-btn">
            Cambiar foto
            <input
              type="file"
              accept="image/*"
              className="ma-file-input"
              disabled={busy}
              onChange={(e) => void onAvatar(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>

      <form className="ma-profile-form" onSubmit={onSave}>
        <section className="ma-block">
          <h2 className="ma-block__title">Identidad</h2>
          <div className="ma-grid-2">
            <label>
              Nombre
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                maxLength={80}
              />
            </label>
            <label>
              Apellido
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                maxLength={80}
              />
            </label>
            <label className="ma-span-2">
              Teléfono
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s()-]/g, '').slice(0, 32))}
                autoComplete="tel"
                inputMode="tel"
                placeholder="+54 11 …"
              />
            </label>
          </div>
        </section>

        <section className="ma-block">
          <h2 className="ma-block__title">Skills</h2>
          <p className="ma-help">Elegí del pool o escribí una skill nueva y agregala.</p>
          <div className="ma-bubbles">
            {skills.map((s) => (
              <button
                key={s}
                type="button"
                className="ma-bubble is-on"
                onClick={() => setSkills((prev) => prev.filter((x) => x !== s))}
                title="Quitar"
              >
                {s} ×
              </button>
            ))}
          </div>
          <div className="ma-skill-add">
            <input
              value={skillQuery}
              onChange={(e) => setSkillQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSkill(skillQuery);
                }
              }}
              placeholder="Buscar o agregar skill…"
              aria-label="Buscar o agregar skill"
              list="ma-skill-pool"
            />
            <datalist id="ma-skill-pool">
              {MEMBER_SKILL_POOL.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <button type="button" className="ma-btn ma-btn--ghost" onClick={() => addSkill(skillQuery)}>
              Agregar
            </button>
          </div>
          {skillSuggestions.length ? (
            <div className="ma-bubbles ma-bubbles--suggest">
              {skillSuggestions.map((s) => (
                <button key={s} type="button" className="ma-bubble" onClick={() => addSkill(s)}>
                  + {s}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="ma-block">
          <div className="ma-block__row">
            <h2 className="ma-block__title">Estudios</h2>
            <button
              type="button"
              className="ma-linkish"
              onClick={() => setStudies((prev) => [...prev, emptyStudy()].slice(0, 20))}
            >
              + Agregar
            </button>
          </div>
          {studies.map((s, i) => (
            <div key={i} className="ma-entry">
              <div className="ma-grid-2">
                <label>
                  Institución
                  <input
                    value={s.institution}
                    onChange={(e) =>
                      setStudies((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, institution: e.target.value } : row)),
                      )
                    }
                    placeholder="UCEMA, UBA…"
                  />
                </label>
                <label>
                  Carrera
                  <input
                    value={s.degree}
                    onChange={(e) =>
                      setStudies((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, degree: e.target.value } : row)),
                      )
                    }
                    placeholder="Lic. en…"
                  />
                </label>
                <label>
                  Año esperado de egreso
                  <select
                    value={s.year || ''}
                    onChange={(e) =>
                      setStudies((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, year: e.target.value } : row)),
                      )
                    }
                  >
                    <option value="">Elegir año</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {studies.length > 1 ? (
                <button
                  type="button"
                  className="ma-linkish ma-linkish--danger"
                  onClick={() => setStudies((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  Quitar
                </button>
              ) : null}
            </div>
          ))}
        </section>

        <section className="ma-block">
          <div className="ma-block__row">
            <h2 className="ma-block__title">Empleos</h2>
            <button
              type="button"
              className="ma-linkish"
              onClick={() => setJobs((prev) => [...prev, emptyJob()].slice(0, 30))}
            >
              + Agregar
            </button>
          </div>
          {jobs.map((j, i) => (
            <div key={i} className="ma-entry">
              <div className="ma-grid-2">
                <label>
                  Empresa
                  <input
                    value={j.company}
                    onChange={(e) =>
                      setJobs((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, company: e.target.value } : row)),
                      )
                    }
                  />
                </label>
                <label>
                  Puesto
                  <input
                    value={j.role}
                    onChange={(e) =>
                      setJobs((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, role: e.target.value } : row)),
                      )
                    }
                  />
                </label>
                <label>
                  Año de inicio
                  <select
                    value={j.from || ''}
                    onChange={(e) =>
                      setJobs((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, from: e.target.value } : row)),
                      )
                    }
                  >
                    <option value="">Elegir año</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Año de fin
                  <select
                    value={j.to || ''}
                    disabled={j.current}
                    onChange={(e) =>
                      setJobs((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, to: e.target.value } : row)),
                      )
                    }
                  >
                    <option value="">Elegir año</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ma-check ma-span-2">
                  <input
                    type="checkbox"
                    checked={Boolean(j.current)}
                    onChange={(e) =>
                      setJobs((prev) =>
                        prev.map((row, idx) =>
                          idx === i ? { ...row, current: e.target.checked, to: e.target.checked ? '' : row.to } : row,
                        ),
                      )
                    }
                  />
                  Actualmente trabajo ahí
                </label>
                <label className="ma-span-2">
                  Descripción breve
                  <textarea
                    rows={3}
                    maxLength={800}
                    value={j.description || ''}
                    onChange={(e) =>
                      setJobs((prev) =>
                        prev.map((row, idx) =>
                          idx === i ? { ...row, description: e.target.value } : row,
                        ),
                      )
                    }
                    placeholder="Qué hiciste / hacés en el rol…"
                  />
                </label>
              </div>
              {jobs.length > 1 ? (
                <button
                  type="button"
                  className="ma-linkish ma-linkish--danger"
                  onClick={() => setJobs((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  Quitar
                </button>
              ) : null}
            </div>
          ))}
        </section>

        <section className="ma-block">
          <div className="ma-block__row">
            <h2 className="ma-block__title">Idiomas</h2>
            <button
              type="button"
              className="ma-linkish"
              onClick={() => setLanguages((prev) => [...prev, emptyLang()].slice(0, 20))}
            >
              + Agregar
            </button>
          </div>
          {languages.map((l, i) => (
            <div key={i} className="ma-entry">
              <div className="ma-grid-2">
                <label>
                  Idioma
                  <select
                    value={l.name}
                    onChange={(e) =>
                      setLanguages((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, name: e.target.value } : row)),
                      )
                    }
                  >
                    <option value="">Elegir</option>
                    {MEMBER_LANGUAGE_POOL.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    {l.name && !(MEMBER_LANGUAGE_POOL as readonly string[]).includes(l.name) ? (
                      <option value={l.name}>{l.name}</option>
                    ) : null}
                  </select>
                </label>
                <label>
                  Nivel
                  <select
                    value={l.level}
                    onChange={(e) =>
                      setLanguages((prev) =>
                        prev.map((row, idx) => (idx === i ? { ...row, level: e.target.value } : row)),
                      )
                    }
                  >
                    <option value="">Elegir</option>
                    {MEMBER_LANGUAGE_LEVELS.map((lv) => (
                      <option key={lv} value={lv}>
                        {lv}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {languages.length > 1 ? (
                <button
                  type="button"
                  className="ma-linkish ma-linkish--danger"
                  onClick={() => setLanguages((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  Quitar
                </button>
              ) : null}
            </div>
          ))}
        </section>

        <section className="ma-block ma-block--cv">
          <h2 className="ma-block__title">Curriculum vitae</h2>
          <p className="ma-help">PDF o Word. Se muestra a reclutadores de la bolsa cuando aplique.</p>
          <div className="ma-cv-box">
            {account.cvUrl ? (
              <a className="ma-cv-box__link" href={account.cvUrl} target="_blank" rel="noopener noreferrer">
                Ver CV cargado
              </a>
            ) : (
              <p className="ma-cv-box__empty">Todavía no cargaste un CV.</p>
            )}
            <label className="ma-btn ma-cv-box__btn">
              {account.cvUrl ? 'Reemplazar CV' : 'Subir CV'}
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf"
                className="ma-file-input"
                disabled={busy}
                onChange={(e) => void onCv(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </section>

        {err ? <p className="ma-err">{err}</p> : null}
        {msg ? <p className="ma-ok">{msg}</p> : null}

        <button className="ma-btn" type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar perfil'}
        </button>
      </form>
    </div>
  );
}
