/**
 * Panel de administración: pestañas según permisos CRM (sitio, eventos, …, equipo).
 *
 * Cada bloque grande está en **funciones `*Section`** más abajo en este archivo (listados + formularios fullscreen).
 * Persistencia vía `authFetch` → `/api/admin/*` (ver `server/src/http/routes/register-api.routes.ts`).
 * Toasts y confirmaciones: `useToast` / `useConfirm` de `FeedbackContext`.
 */
import { useState, useEffect, useRef, useMemo, type CSSProperties } from 'react';
import { useStaffPermissions } from '../context/StaffPermissionsContext';
import { canSeeAdminSection, hasAnyPermission } from '../lib/crmPermissions';
import { fetchAdminEventos, fetchRawCharlas } from '../lib/db';
import { authFetch, readApiError } from '../lib/serverApi';
import type { DbEvento, DbCharla } from '../types';
import SiteImagesPanel from '../components/admin/SiteImagesPanel';
import ThumbnailUpload from '../components/admin/ThumbnailUpload';
import EmailCampaignsHub from '../components/admin/EmailCampaignsHub';
import DatabasePanel, { EventAudiencePanel } from '../components/admin/DatabasePanel';
import StaffAccountsPanel from '../components/admin/StaffAccountsPanel';
import CandidatesPanel from '../components/admin/CandidatesPanel';
import SponsorsPanel from '../components/admin/SponsorsPanel';
import AdminHome from '../components/admin/AdminHome';
import AdminShell, {
  type AdminSectionId,
  type AdminNavItem,
  type AdminDataTabId,
} from '../components/admin/crm/AdminShell';
import {
  CrmSection,
  FormScreen,
  SectionIntro,
  Field,
  TA,
  Sel,
  TwoCol,
  ThreeCol,
  FormSection,
  ActionBtn,
  Spinner,
  Empty,
  ListCard,
} from '../components/admin/crm/CrmUi';
import { crm } from '../components/admin/crm/crmTheme';
import { useToast, useConfirm } from '../context/FeedbackContext';

const NAV_ITEMS: AdminNavItem[] = [
  { id: 'inicio', title: 'Inicio', desc: 'Panorama y atajos' },
  { id: 'sitio', title: 'Web', desc: 'Hero, club y Luma de cuenta' },
  { id: 'data', title: 'Data', desc: 'Eventos, comunidad, email, leads…' },
];

const DATA_TABS: Array<{ id: AdminDataTabId; label: string }> = [
  { id: 'eventos', label: 'Eventos' },
  { id: 'comunidad', label: 'Comunidad' },
  { id: 'campanas_email', label: 'Email' },
  { id: 'sponsors', label: 'Sponsors' },
  { id: 'leads', label: 'Leads' },
  { id: 'charlas', label: 'Archivo' },
  { id: 'equipo', label: 'Equipo' },
];

const DATA_SECTION_IDS = new Set<AdminSectionId>(DATA_TABS.map((t) => t.id));

interface Props {
  signOut: () => void;
  goToSite: () => void;
}

export default function Admin({ signOut, goToSite }: Props) {
  const { loading, permissions, nombre, apellido, email } = useStaffPermissions();
  const staffDisplayName = useMemo(() => {
    const n = [nombre?.trim(), apellido?.trim()].filter(Boolean).join(' ');
    return n || (email?.trim() ?? '');
  }, [nombre, apellido, email]);
  const visibleNav = useMemo(() => NAV_ITEMS.filter(i => canSeeAdminSection(i.id, permissions)), [permissions]);
  const [section, setSection] = useState<AdminSectionId>('inicio');
  const [dataTab, setDataTab] = useState<AdminDataTabId>('eventos');

  const goTo = (id: AdminSectionId) => {
    if (DATA_SECTION_IDS.has(id)) {
      setDataTab(id as AdminDataTabId);
      setSection('data');
      return;
    }
    setSection(id);
  };

  useEffect(() => {
    if (loading) return;
    if (visibleNav.length === 0) return;
    if (!canSeeAdminSection(section, permissions)) {
      setSection(visibleNav[0]!.id);
    }
  }, [loading, permissions, section, visibleNav]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Instrument Sans', sans-serif",
          color: 'rgba(250,248,245,0.65)',
          background: '#0b0712',
        }}
      >
        Cargando panel…
      </div>
    );
  }

  if (visibleNav.length === 0) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: "'Instrument Sans', sans-serif",
          textAlign: 'center',
          color: 'rgba(250,248,245,0.8)',
          background: '#0b0712',
        }}
      >
        <div>
          <p style={{ marginBottom: 16 }}>Tu cuenta no tiene ninguna sección del panel habilitada.</p>
          <button type="button" style={crm.chipBtn} onClick={goToSite}>
            Volver al sitio
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminShell
      section={section}
      onSection={setSection}
      navItems={visibleNav}
      goToSite={goToSite}
      signOut={signOut}
      staffDisplayName={staffDisplayName}
    >
      {section === 'inicio' && <AdminHome onGo={goTo} />}
      {section === 'sitio' && (
        <>
          <SectionIntro
            kicker="Web pública"
            title="Sitio y cuenta"
            subtitle="Hero, fotos del club y embed Luma del overview de miembros. Publicás al pie."
          />
          <SiteImagesPanel />
        </>
      )}
      {section === 'data' && (
        <DataHub tab={dataTab} onTab={setDataTab} permissions={permissions} />
      )}
    </AdminShell>
  );
}

function DataHub({
  tab,
  onTab,
  permissions,
}: {
  tab: AdminDataTabId;
  onTab: (id: AdminDataTabId) => void;
  permissions: ReturnType<typeof useStaffPermissions>['permissions'];
}) {
  const visible = useMemo(
    () => DATA_TABS.filter((t) => canSeeAdminSection(t.id, permissions)),
    [permissions],
  );

  useEffect(() => {
    if (!visible.length) return;
    if (!visible.some((t) => t.id === tab)) onTab(visible[0]!.id);
  }, [visible, tab, onTab]);

  if (!visible.length) {
    return (
      <div style={crm.listCard}>Tu cuenta no tiene permisos para Data.</div>
    );
  }

  return (
    <>
      <SectionIntro
        kicker="Operaciones"
        title="Data"
        subtitle="Eventos, comunidad, campañas, leads y equipo. Todo lo que no es contenido visual de la home."
      />
      <div style={{ ...crm.listCard, marginBottom: 18, padding: 12 }}>
        <div style={{ ...crm.segmentRail, marginBottom: 0 }}>
          <div className="xplora-admin-segment-scroll">
            <div className="xplora-admin-segment-track" style={crm.segmentTrack}>
              {visible.map((t) => {
                const active = t.id === tab;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`xplora-admin-seg${active ? ' is-active' : ''}`}
                    style={crm.segmentBtn(active)}
                    onClick={() => onTab(t.id)}
                  >
                    <span style={crm.segmentLabel}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {tab === 'eventos' && <EventosSection />}
      {tab === 'comunidad' && <DatabasePanel />}
      {tab === 'campanas_email' && <EmailCampaignsHub />}
      {tab === 'sponsors' && <SponsorsPanel />}
      {tab === 'leads' && <CandidatesPanel />}
      {tab === 'charlas' && <CharlasSection />}
      {tab === 'equipo' && <StaffAccountsPanel />}
    </>
  );
}

// ── EVENTOS ────────────────────────────────────────────────────────────

const EVENTO_EMPTY: Omit<DbEvento, 'id' | 'created_at'> = {
  title: '',
  emoji: '',
  tag_type: 'p',
  tag_label: 'Charla',
  date_display: '',
  day: '',
  month: '',
  location: '',
  modality: 'Presencial',
  capacity: '',
  cost: 'Gratuito',
  registration_link: '',
  summary: '',
  about: '',
  speaker_name: '',
  speaker_role: '',
  speaker_initials: '',
  speaker_bio: '',
  speakers: [],
  thumbnail_url: null,
  home_poster_url: null,
  total_inscriptos: 0,
  total_asistieron: 0,
  luma_csv_imported_at: null,
  realizado: false,
};

function EventosSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<DbEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editRow, setEditRow] = useState<DbEvento | null>(null);
  const [form, setForm] = useState(EVENTO_EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setRows(await fetchAdminEventos());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm(EVENTO_EMPTY);
    setEditRow(null);
    setFormOpen(true);
    setError('');
  };
  const openEdit = (r: DbEvento) => {
    setForm({ ...EVENTO_EMPTY, ...r });
    setEditRow(r);
    setFormOpen(true);
    setError('');
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditRow(null);
  };

  const save = async () => {
    if (!form.title.trim()) {
      setError('El título es obligatorio');
      return;
    }
    if (!form.date_display.trim() && !form.day.trim()) {
      setError('Indicá la fecha (texto o día/mes).');
      return;
    }
    setSaving(true);
    setError('');
    const name = form.speaker_name.trim();
    const role = form.speaker_role.trim();
    const initials =
      form.speaker_initials.trim() ||
      (name
        ? name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]!.toUpperCase())
            .join('')
        : '');
    const speakers = name
      ? [{ name, role, initials, bio: form.speaker_bio || '' }]
      : [];
    const flyer = (form.home_poster_url || form.thumbnail_url || '').trim() || null;
    const payload = {
      ...form,
      speakers,
      speaker_name: name,
      speaker_role: role,
      speaker_initials: initials,
      speaker_bio: form.speaker_bio || '',
      home_poster_url: flyer,
      thumbnail_url: flyer,
      emoji: form.emoji || '',
      tag_type: form.tag_type || 'p',
      tag_label: form.tag_label || 'Evento',
      modality: form.modality || 'Presencial',
      cost: form.cost || 'Gratuito',
      capacity: form.capacity || '',
      about: form.about || '',
    };
    const res = editRow
      ? await authFetch(`/api/admin/eventos/${editRow.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await authFetch('/api/admin/eventos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
    if (!res.ok) {
      setError(await readApiError(res));
      setSaving(false);
      return;
    }
    setSaving(false);
    closeForm();
    load();
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: 'Eliminar evento',
      message: '¿Eliminar este evento? No podés deshacer esta acción.',
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!ok) return;
    const res = await authFetch(`/api/admin/eventos/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error(await readApiError(res));
      return;
    }
    toast.success('Evento eliminado.');
    load();
  };

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const { activeRows, pastRows } = useMemo(() => {
    const active: DbEvento[] = [];
    const past: DbEvento[] = [];
    for (const r of rows) {
      if (r.realizado) past.push(r);
      else active.push(r);
    }
    return { activeRows: active, pastRows: past };
  }, [rows]);

  return (
    <CrmSection
      kicker="Calendario"
      title="Eventos"
      subtitle="Lo esencial para el bloque «Próximo evento» de la home: título, fecha, lugar, flyer e inscripción."
      onNew={openCreate}
      newLabel="+ Nuevo evento"
    >
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty
          title="Todavía no hay eventos"
          text="Creá el primero: título, fecha y flyer alcanzan para publicarlo en la home."
        />
      ) : (
        <div style={crm.list}>
          {activeRows.length > 0 ? (
            <>
              <p style={{ ...crm.pageSubtitle, marginBottom: 12, maxWidth: 'none' }}>
                <strong>Activos</strong> · {activeRows.length}
              </p>
              {activeRows.map(r => (
                <ListCard
                  key={r.id}
                  title={r.title}
                  meta={`${r.date_display || 'Sin fecha'} · ${r.location || 'Sin lugar'}`}
                  actions={
                    <>
                      <ActionBtn onClick={() => openEdit(r)}>Editar</ActionBtn>
                      <ActionBtn danger onClick={() => remove(r.id)}>
                        Eliminar
                      </ActionBtn>
                    </>
                  }
                />
              ))}
            </>
          ) : (
            <p style={{ ...crm.pageSubtitle, marginBottom: 12, maxWidth: 'none', color: 'var(--ink-muted)' }}>
              No hay eventos activos.
            </p>
          )}

          {pastRows.length > 0 ? (
            <>
              <div style={{ height: 10 }} />
              <p style={{ ...crm.pageSubtitle, marginBottom: 12, maxWidth: 'none' }}>
                <strong>Realizados</strong> · {pastRows.length}
              </p>
              {pastRows.map(r => (
                <ListCard
                  key={r.id}
                  title={r.title}
                  meta={`${r.date_display || 'Sin fecha'} · Realizado`}
                  actions={
                    <>
                      <ActionBtn onClick={() => openEdit(r)}>Editar</ActionBtn>
                      <ActionBtn danger onClick={() => remove(r.id)}>
                        Eliminar
                      </ActionBtn>
                    </>
                  }
                />
              ))}
            </>
          ) : null}
        </div>
      )}

      {formOpen && (
        <FormScreen
          title={editRow ? 'Editar evento' : 'Nuevo evento'}
          subtitle="Solo lo que se muestra en la home. * obligatorio."
          onClose={closeForm}
          onSave={save}
          saving={saving}
          error={error}
        >
          <FormSection title="Evento">
            <Field
              label="Título *"
              value={form.title}
              onChange={v => f('title', v)}
              placeholder="Startup Day / Charla con…"
            />
            <Field
              label="Descripción corta"
              hint="Una o dos líneas bajo el título."
              value={form.summary}
              onChange={v => f('summary', v)}
              placeholder="De qué se trata"
            />
            <ThumbnailUpload
              label="Flyer"
              hint="Imagen del bloque Próximo evento (recomendado 4:3)."
              value={form.home_poster_url || form.thumbnail_url || ''}
              onChange={v =>
                setForm(p => ({
                  ...p,
                  home_poster_url: v || null,
                  thumbnail_url: v || null,
                }))
              }
            />
          </FormSection>

          <FormSection title="Cuándo y dónde">
            <ThreeCol>
              <Field
                label="Fecha (texto)"
                hint="Ej. 11 de septiembre de 2026"
                value={form.date_display}
                onChange={v => f('date_display', v)}
              />
              <Field label="Día" hint="Ej. 9" value={form.day} onChange={v => f('day', v)} />
              <Field label="Mes" hint="Ej. SEP" value={form.month} onChange={v => f('month', v)} />
            </ThreeCol>
            <TwoCol>
              <Field
                label="Lugar"
                value={form.location}
                onChange={v => f('location', v)}
                placeholder="Av. Alem 882"
              />
              <Sel
                label="Modalidad"
                value={form.modality}
                onChange={v => f('modality', v)}
                options={[
                  { value: 'Presencial', label: 'Presencial' },
                  { value: 'Online', label: 'Online' },
                  { value: 'Híbrido', label: 'Híbrido' },
                ]}
              />
            </TwoCol>
          </FormSection>

          <FormSection title="Inscripción">
            <TwoCol>
              <Field label="Costo" value={form.cost} onChange={v => f('cost', v)} placeholder="Gratuito" />
              <Field
                label="Link de inscripción"
                value={form.registration_link}
                onChange={v => f('registration_link', v)}
                placeholder="https://…"
              />
            </TwoCol>
          </FormSection>

          <FormSection title="Con (opcional)">
            <TwoCol>
              <Field
                label="Nombre"
                value={form.speaker_name}
                onChange={v => f('speaker_name', v)}
                placeholder="Nombre del speaker"
              />
              <Field
                label="Rol"
                value={form.speaker_role}
                onChange={v => f('speaker_role', v)}
                placeholder="Cargo / empresa"
              />
            </TwoCol>
          </FormSection>

          <FormSection title="Estado">
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(form.realizado)}
                onChange={(e) => setForm((p) => ({ ...p, realizado: e.target.checked }))}
              />
              Ya se realizó (no mostrar como próximo en la home)
            </label>
          </FormSection>
        </FormScreen>
      )}
    </CrmSection>
  );
}

// ── CHARLAS ────────────────────────────────────────────────────────────

const CHARLA_EMPTY: Omit<DbCharla, 'id' | 'created_at'> = {
  evento_id: undefined,
  title: '',
  emoji: '',
  speaker_name: '',
  speaker_initials: '',
  speaker_bio: '',
  tag_type: 'p',
  tag_label: 'Charla',
  date_display: '',
  about: '',
  topics: [],
  why_xplora: '',
  duration: '',
  attendees: '',
  recording_link: '',
  material_link: '',
  thumbnail_url: null,
};

function CharlasSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<DbCharla[]>([]);
  const [eventos, setEventos] = useState<DbEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editRow, setEditRow] = useState<DbCharla | null>(null);
  const [form, setForm] = useState(CHARLA_EMPTY);
  const [topicsText, setTopicsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [csvBusy, setCsvBusy] = useState(false);
  const [attendanceMode, setAttendanceMode] = useState('auto');
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const { permissions } = useStaffPermissions();
  const canArchivePasados = hasAnyPermission(permissions, ['past_events_create', 'past_events_edit_delete']);
  const canAudienciaEvento = hasAnyPermission(permissions, ['database_full', 'database_event_audience_only']);
  const showPasadosHubNav = canArchivePasados && canAudienciaEvento;
  const [pasadosTab, setPasadosTab] = useState<'archivo' | 'inscriptos'>('archivo');

  useEffect(() => {
    if (!canArchivePasados && canAudienciaEvento) setPasadosTab('inscriptos');
  }, [canArchivePasados, canAudienciaEvento]);

  const eventoSelectOptions = useMemo(() => {
    const sid = form.evento_id;
    const linked = sid ? eventos.find(e => e.id === sid) : undefined;
    let list = eventos.filter(e => !(e.realizado ?? false));
    if (linked && (linked.realizado ?? false) && !list.some(e => e.id === linked.id)) {
      list = [linked, ...list];
    }
    return [
      { value: '', label: '— Ninguno —' },
      ...list.map(e => ({
        value: e.id,
        label: e.realizado ? `${e.title} (ya archivado)` : e.title,
      })),
    ];
  }, [eventos, form.evento_id]);

  const load = async () => {
    setLoading(true);
    const [c, evs] = await Promise.all([fetchRawCharlas(), fetchAdminEventos()]);
    setRows(c);
    setEventos(evs);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm(CHARLA_EMPTY);
    setAttendanceMode('auto');
    setImportWarnings([]);
    setTopicsText('');
    setEditRow(null);
    setFormOpen(true);
    setError('');
  };
  const openEdit = (r: DbCharla) => {
    setAttendanceMode('auto');
    setImportWarnings([]);
    setForm({ ...CHARLA_EMPTY, ...r });
    setTopicsText((r.topics || []).join('\n'));
    setEditRow(r);
    setFormOpen(true);
    setError('');
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditRow(null);
  };

  const importEvento = (eventoId: string) => {
    const ev = eventos.find(e => e.id === eventoId);
    if (!ev) return;
    setForm(p => ({
      ...p,
      evento_id: ev.id,
      title: ev.title,
      emoji: ev.emoji,
      thumbnail_url: ev.thumbnail_url ?? null,
      speaker_name: ev.speaker_name,
      speaker_initials: ev.speaker_initials,
      speaker_bio: ev.speaker_bio,
      tag_type: ev.tag_type,
      tag_label: ev.tag_label,
      date_display: ev.date_display,
      about: ev.about,
    }));
  };

  const save = async () => {
    if (!form.title.trim()) {
      setError('El título es obligatorio');
      return;
    }
    setSaving(true);
    setError('');
    const payload = { ...form, topics: topicsText.split('\n').map(t => t.trim()).filter(Boolean) };
    const res = editRow
      ? await authFetch(`/api/admin/charlas/${editRow.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await authFetch('/api/admin/charlas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
    if (!res.ok) {
      setError(await readApiError(res));
      setSaving(false);
      return;
    }
    if (payload.evento_id) {
      const evRes = await authFetch(`/api/admin/eventos/${payload.evento_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realizado: true }),
      });
      if (!evRes.ok) {
        toast.error(await readApiError(evRes));
      }
    }
    setSaving(false);
    closeForm();
    load();
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: 'Eliminar entrada del Archivo',
      message: '¿Eliminar este registro del archivo? No podés deshacer esta acción.',
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!ok) return;
    const res = await authFetch(`/api/admin/charlas/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error(await readApiError(res));
      return;
    }
    toast.success('Registro eliminado.');
    load();
  };

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const importLumaCsv = async (file: File | null) => {
    if (!file) return;
    if (!form.evento_id) {
      toast.error('Elegí primero el evento al que pertenecen los participantes.');
      return;
    }
    setCsvBusy(true);
    setImportWarnings([]);
    setError('');
    try {
      const fd = new FormData();
      fd.append('csv', file);
      fd.append('attendance_mode', attendanceMode);
      const res = await authFetch(`/api/admin/eventos/${form.evento_id}/luma-csv`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const msg = await readApiError(res);
        setError(msg);
        toast.error(msg);
        return;
      }
      const data = (await res.json()) as {
        emails_procesados: number;
        usuarios_nuevos: number;
        usuarios_existentes: number;
        warnings?: string[];
      };
      toast.success(
        `Importación lista: ${data.emails_procesados} emails (${data.usuarios_nuevos} usuarios nuevos, ${data.usuarios_existentes} ya existían).`,
      );
      setImportWarnings(data.warnings ?? []);
      void load();
    } catch {
      const message = 'No se pudo completar la importación. Revisá la conexión e intentá nuevamente.';
      setError(message);
      toast.error(message);
    } finally {
      setCsvBusy(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const archivoDePasados = (
    <CrmSection
      kicker="Historial"
      title="Archivo en la web"
      subtitle="Vinculá el evento realizado, importá participantes desde CSV o Excel y archivá la fecha en el sitio público."
      onNew={openCreate}
      newLabel="+ Nueva entrada en Archivo"
    >
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty
          title="No hay contenido cargado en Archivo"
          text="Usá «Nueva entrada en Archivo». Si el meet ya estaba en Eventos, vinculalo: al guardar se marca como realizado y deja de mostrarse en la página de próximos eventos."
        />
      ) : (
        <div style={crm.list}>
          {rows.map(r => (
            <ListCard
              key={r.id}
              title={r.title}
              meta={`${r.speaker_name || 'Sin orador'} · ${r.date_display || 'Sin fecha'}`}
              actions={
                <>
                  <ActionBtn onClick={() => openEdit(r)}>Editar</ActionBtn>
                  <ActionBtn danger onClick={() => remove(r.id)}>
                    Eliminar
                  </ActionBtn>
                </>
              }
            />
          ))}
        </div>
      )}

      {formOpen && (
        <FormScreen
          title={editRow ? 'Editar entrada del Archivo' : 'Nueva entrada en Archivo'}
          subtitle="Vinculá el evento al que corresponden los participantes. Al guardar, ese evento deja el listado público de próximos."
          onClose={closeForm}
          onSave={save}
          saving={saving}
          error={error}
        >
          {eventos.length > 0 ? (
            <FormSection title="Evento en Xplora (origen)">
              <Sel
                label="Evento que ya publicaste"
                hint="Al guardar este formulario, ese evento pasa a «realizado» y ya no aparece en la web como próximo. Podés copiar título, fecha y orador."
                value={form.evento_id || ''}
                onChange={v => {
                  if (v) importEvento(v);
                  else setForm(p => ({ ...p, evento_id: undefined }));
                }}
                options={eventoSelectOptions}
              />
            </FormSection>
          ) : (
            <FormSection title="Evento en Xplora">
              <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: 0 }}>
                Todavía no hay eventos en la pestaña Eventos. Creá uno primero si querés vincular, o completá la tarjeta solo a mano.
              </p>
            </FormSection>
          )}

          <FormSection title="Importar participantes">
            <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
              Usá un CSV, XLSX o XLS de Luma o de tu propia planilla. Necesita una columna Email o Correo electrónico.
              La asistencia se reconoce por Asistió, Asistencia, Acreditado o el check-in de Luma.
            </p>
            <Sel
              label="Cómo registrar la asistencia"
              hint="Si tu planilla solo contiene asistentes y no tiene una columna de asistencia, elegí «Todos asistieron»."
              value={attendanceMode}
              onChange={setAttendanceMode}
              disabled={csvBusy}
              options={[
                { value: 'auto', label: 'Detectar desde las columnas del archivo' },
                { value: 'attended', label: 'Todos asistieron' },
                { value: 'registered', label: 'Solo inscripciones, sin marcar asistencia' },
              ]}
            />
            <TwoCol>
              <div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    color: 'var(--ink-muted)',
                  }}
                >
                  Archivo
                </span>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink-muted)' }}>
                  {form.evento_id
                    ? 'Listo para importar.'
                    : 'Primero elegí el evento de origen para habilitar la importación.'}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'flex-end' }}>
                <input
                  ref={csvInputRef}
                  type="file"
                  aria-label="Archivo de participantes"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  style={{ fontSize: 13 }}
                  disabled={csvBusy || !form.evento_id}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void importLumaCsv(file);
                  }}
                />
                {csvBusy && <Spinner />}
              </div>
            </TwoCol>
            {importWarnings.length > 0 && (
              <details style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-muted)' }}>
                <summary>{importWarnings.length} avisos de la importación</summary>
                <ul>{importWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
              </details>
            )}
          </FormSection>

          <FormSection title="Tarjeta y datos principales">
            <TwoCol>
              <Field
                label="Símbolo en la tarjeta (opcional)"
                value={form.emoji}
                onChange={v => f('emoji', v)}
              />
              <Field label="Etiqueta" value={form.tag_label} onChange={v => f('tag_label', v)} />
            </TwoCol>
            <ThumbnailUpload
              label="Miniatura"
              hint="Imagen de la tarjeta en Archivo y cabecera del detalle. Si no cargás, se usa el símbolo o un fondo."
              value={form.thumbnail_url ?? ''}
              onChange={v => setForm(p => ({ ...p, thumbnail_url: v || null }))}
            />
            <Field label="Título *" value={form.title} onChange={v => f('title', v)} />
            <TwoCol>
              <Sel
                label="Color de categoría"
                value={form.tag_type}
                onChange={v => f('tag_type', v)}
                options={[
                  { value: 'p', label: 'Morado' },
                  { value: 'g', label: 'Verde' },
                  { value: 'o', label: 'Naranja' },
                  { value: 'n', label: 'Gris' },
                ]}
              />
              <Field label="Fecha mostrada" hint="Ej: Nov 2024 o 12 mar 2024" value={form.date_display} onChange={v => f('date_display', v)} />
            </TwoCol>
          </FormSection>

          <FormSection title="Contenido de la charla">
            <TA label="Sobre la charla" value={form.about} onChange={v => f('about', v)} />
            <TA
              label="Temas tocados"
              hint="Un tema por línea. Aparecen como lista en el sitio."
              value={topicsText}
              onChange={v => setTopicsText(v)}
              rows={4}
              placeholder={'Fundraising en etapas tempranas\nCómo evaluar el product-market fit'}
            />
            <TA label="¿Por qué vino a Xplora?" value={form.why_xplora} onChange={v => f('why_xplora', v)} rows={2} />
          </FormSection>

          <FormSection title="Orador/a">
            <TwoCol>
              <Field label="Nombre" value={form.speaker_name} onChange={v => f('speaker_name', v)} />
              <Field label="Iniciales" value={form.speaker_initials} onChange={v => f('speaker_initials', v)} />
            </TwoCol>
            <TA label="Biografía" value={form.speaker_bio} onChange={v => f('speaker_bio', v)} rows={2} />
          </FormSection>

          <FormSection title="Métricas y enlaces">
            <TwoCol>
              <Field label="Duración" hint="Ej: 75 min" value={form.duration} onChange={v => f('duration', v)} />
              <Field label="Asistentes" hint="Ej: +120 o el número que quieras mostrar" value={form.attendees} onChange={v => f('attendees', v)} />
            </TwoCol>
            <Field
              label="Link a la grabación"
              hint="YouTube, Drive, etc."
              value={form.recording_link}
              onChange={v => f('recording_link', v)}
              placeholder="https://youtube.com/..."
            />
            <Field
              label="Link a material"
              hint="Presentación, PDF, carpeta compartida…"
              value={form.material_link}
              onChange={v => f('material_link', v)}
              placeholder="https://..."
            />
          </FormSection>
        </FormScreen>
      )}
    </CrmSection>
  );

  if (!canArchivePasados && canAudienciaEvento) {
    return (
      <>
        <SectionIntro
          kicker="Historial"
          title="Inscriptos por evento"
          subtitle="Eventos ya realizados: revisá quién se anotó y si hizo check-in. Para cargar charlas en la web usá la pestaña «Archivo» cuando tengas permiso de edición."
        />
        <EventAudiencePanel />
      </>
    );
  }

  if (!showPasadosHubNav) {
    return archivoDePasados;
  }

  const subNavPasados: CSSProperties = { marginBottom: 18 };

  return (
    <>
      <SectionIntro
        kicker="Historial"
        title="Archivo"
        subtitle="Dos vistas: el archivo público (charlas en la web) y la lista operativa de inscriptos y asistencia por cada meet."
      />
      <nav style={subNavPasados} aria-label="Vistas del Archivo">
        <div style={crm.segmentRail}>
          <div className="xplora-admin-segment-scroll">
            <div className="xplora-admin-segment-track" style={crm.segmentTrack} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={pasadosTab === 'archivo'}
                title="Tarjetas en sitio e importación de participantes"
                className={`xplora-admin-seg${pasadosTab === 'archivo' ? ' is-active' : ''}`}
                style={crm.segmentBtn(pasadosTab === 'archivo')}
                onClick={() => setPasadosTab('archivo')}
              >
                <span style={crm.segmentLabel}>Archivo en la web</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pasadosTab === 'inscriptos'}
                title="Inscriptos y check-in"
                className={`xplora-admin-seg${pasadosTab === 'inscriptos' ? ' is-active' : ''}`}
                style={crm.segmentBtn(pasadosTab === 'inscriptos')}
                onClick={() => setPasadosTab('inscriptos')}
              >
                <span style={crm.segmentLabel}>Inscriptos por evento</span>
              </button>
            </div>
          </div>
        </div>
      </nav>
      {pasadosTab === 'inscriptos' ? <EventAudiencePanel /> : archivoDePasados}
    </>
  );
}

