/**
 * Editor de **campañas de email** (pestaña Campañas): formulario + vista previa HTML en vivo.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { authFetch, readApiError } from '../../lib/serverApi';
import EmailHtmlLivePreview from './EmailHtmlLivePreview';
import EmailCampaignEventFields from './EmailCampaignEventFields';
import EmailCampaignPlatformFields from './EmailCampaignPlatformFields';
import CustomEmailHtmlEditor from './CustomEmailHtmlEditor';
import CustomEmailHtmlLivePreview from './CustomEmailHtmlLivePreview';
import { emailSiteOrigin } from './emailCampaignHelpers';
import {
  CrmSection,
  Field,
  FormSection,
  Sel,
  useMediaQuery,
} from './crm/CrmUi';
import { crm } from './crm/crmTheme';
import { useToast } from '../../context/FeedbackContext';
import type { ContactListSummary } from '../../types';
import type { EmailCampaignEstadoId } from './emailCampaignTypes';
import type { EmailTemplateBuildInput } from './emailTemplateInput';
import { defaultPlatformData } from './emailTemplateInput';
import {
  buildEmailHtmlForTemplate,
  DEFAULT_EMAIL_TEMPLATE_ID,
  EMAIL_TEMPLATE_OPTIONS,
  type EmailTemplateId,
} from './emailTemplates/registry';
import { showCampaignField } from './emailTemplates/formFields';
import {
  DEFAULT_CUSTOM_EMAIL_HTML,
  findUnsupportedPreviewVariables,
  isValidOptionalHttpUrl,
  type CustomEmailPreviewVariables,
} from './customEmailTemplate';

const DISPATCH_LS_KEY = 'xplora_email_dispatch_job_v1';
const MAX_CUSTOM_HTML_LENGTH = 2_000_000;
type EmailContentMode = 'guided_template' | 'custom_html';

export type DispatchJobState = {
  jobId: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  campaignId: string;
  total: number;
  skipped_already_sent: number;
  attempted: number;
  sent: number;
  failed: { email: string; error: string; usuario_id: string }[];
  current_email: string | null;
  from: string;
  message?: string;
};

async function fetchDispatchJobStatus(jobId: string): Promise<DispatchJobState | null> {
  const res = await authFetch(`/api/admin/email-campaign-dispatch/jobs/${jobId}`);
  if (!res.ok) return null;
  return (await res.json()) as DispatchJobState;
}

export type EmailCampaignEditorProps = {
  bare?: boolean;
};

export default function EmailCampaignEditor({ bare = false }: EmailCampaignEditorProps) {
  const toast = useToast();
  const wide = useMediaQuery('(min-width: 960px)');
  const [saving, setSaving] = useState(false);
  const [lastCampaignId, setLastCampaignId] = useState<string | null>(null);
  const [listsLoading, setListsLoading] = useState(true);
  const [lists, setLists] = useState<ContactListSummary[]>([]);
  const [contactListId, setContactListId] = useState<'__ALL__' | string>('__ALL__');

  const [tituloInterno, setTituloInterno] = useState('');
  const [asunto, setAsunto] = useState('');
  const [contentMode, setContentMode] = useState<EmailContentMode>('guided_template');
  const [templateId, setTemplateId] = useState<EmailTemplateId>(DEFAULT_EMAIL_TEMPLATE_ID);
  const [estado, setEstado] = useState<EmailCampaignEstadoId>('nuevo_evento');
  const [flyerUrl, setFlyerUrl] = useState('');
  const [textoPrincipal, setTextoPrincipal] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [lugar, setLugar] = useState('');
  const [orador, setOrador] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [platform, setPlatform] = useState(defaultPlatformData);
  const [customHtml, setCustomHtml] = useState(DEFAULT_CUSTOM_EMAIL_HTML);
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [customLinkUrl, setCustomLinkUrl] = useState('');

  const [dispatchJob, setDispatchJob] = useState<DispatchJobState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  const clearPoll = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (jobId: string) => {
    clearPoll();
    const tick = async () => {
      const data = await fetchDispatchJobStatus(jobId);
      if (!data) {
        clearPoll();
        window.localStorage.removeItem(DISPATCH_LS_KEY);
        setDispatchJob(null);
        toast.error('No se pudo consultar el estado del envío.');
        return;
      }
      setDispatchJob(data);
      const prev = prevStatusRef.current;
      if (data.status === 'completed' && prev !== 'completed') {
        const failed = data.failed?.length ?? 0;
        const skipped = data.skipped_already_sent ?? 0;
        const from = data.from ? ` · desde ${data.from}` : '';
        if (failed > 0) {
          const reasons = data.failed
            .slice(0, 3)
            .map((f) => (f.error ? `${f.email}: ${f.error}` : f.email))
            .join(' · ');
          toast.error(`Envío terminado${from}. Enviados: ${data.sent}. Fallaron ${failed}: ${reasons}`);
        } else {
          toast.success(
            `Listo: ${data.sent} correos${from}.${skipped ? ` ${skipped} ya figuraban como enviados.` : ''}`.trim(),
          );
        }
        window.localStorage.removeItem(DISPATCH_LS_KEY);
        clearPoll();
      }
      if (data.status === 'failed' && prev !== 'failed') {
        toast.error(data.message ?? 'El envío falló en el servidor.');
        window.localStorage.removeItem(DISPATCH_LS_KEY);
        clearPoll();
      }
      prevStatusRef.current = data.status;
    };
    void tick();
    pollRef.current = setInterval(() => void tick(), 2000);
  };

  useEffect(() => {
    const raw = window.localStorage.getItem(DISPATCH_LS_KEY);
    if (!raw) return;
    let cancelled = false;
    void (async () => {
      try {
        const { jobId } = JSON.parse(raw) as { jobId?: string };
        if (!jobId) {
          window.localStorage.removeItem(DISPATCH_LS_KEY);
          return;
        }
        const st = await fetchDispatchJobStatus(jobId);
        if (cancelled || !st) {
          if (!st) window.localStorage.removeItem(DISPATCH_LS_KEY);
          return;
        }
        setDispatchJob(st);
        if (st.jobId && (st.status === 'queued' || st.status === 'running')) {
          prevStatusRef.current = st.status;
          startPolling(jobId);
        } else {
          window.localStorage.removeItem(DISPATCH_LS_KEY);
        }
      } catch {
        window.localStorage.removeItem(DISPATCH_LS_KEY);
      }
    })();
    return () => {
      cancelled = true;
      clearPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setListsLoading(true);
      const res = await authFetch('/api/admin/contact-lists/mine');
      if (cancelled) return;
      if (!res.ok) {
        setLists([]);
      } else {
        const data = (await res.json()) as { lists: ContactListSummary[] };
        setLists(data.lists ?? []);
      }
      setListsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (templateId !== 'minimal_notice') return;
    setHora('');
    setLugar('');
    setOrador('');
  }, [templateId]);

  useEffect(() => {
    if (templateId !== 'platform_features') return;
    const origin = emailSiteOrigin();
    if (!origin) return;
    setPlatform(prev => (prev.ctaUrl.trim() ? prev : { ...prev, ctaUrl: origin }));
  }, [templateId]);

  const buildInput = useMemo<EmailTemplateBuildInput>(
    () => ({
      tituloInterno,
      asunto,
      estado,
      flyerUrl,
      textoPrincipal,
      fecha,
      hora,
      lugar,
      orador,
      ctaUrl,
      platform,
    }),
    [
      tituloInterno,
      asunto,
      estado,
      flyerUrl,
      textoPrincipal,
      fecha,
      hora,
      lugar,
      orador,
      ctaUrl,
      platform,
    ],
  );

  const unsupportedCustomVariables = useMemo(
    () => findUnsupportedPreviewVariables(customHtml),
    [customHtml],
  );

  const customPreviewVariables = useMemo<CustomEmailPreviewVariables>(
    () => ({
      Nombre: 'María Xplora',
      Email: 'maria@ejemplo.com',
      Carrera: 'Marketing',
      Imagen: customImageUrl,
      Link: customLinkUrl || '#',
      Titulo: tituloInterno || 'Tu campaña Xplora',
      Asunto: asunto || 'Asunto del correo',
    }),
    [asunto, customImageUrl, customLinkUrl, tituloInterno],
  );

  const validateCampaignContent = (): boolean => {
    if (contentMode !== 'custom_html') return true;
    if (!customHtml.trim()) {
      toast.error('Pegá o importá el HTML personalizado.');
      return false;
    }
    if (customHtml.length > MAX_CUSTOM_HTML_LENGTH) {
      toast.error('El HTML supera el máximo de 2 MB.');
      return false;
    }
    if (unsupportedCustomVariables.length > 0) {
      toast.error(`Corregí las variables no reconocidas: ${unsupportedCustomVariables.map(name => `{{${name}}}`).join(', ')}.`);
      return false;
    }
    if (!isValidOptionalHttpUrl(customImageUrl)) {
      toast.error('La URL de {{Imagen}} debe comenzar con http:// o https://.');
      return false;
    }
    if (!isValidOptionalHttpUrl(customLinkUrl)) {
      toast.error('La URL de {{Link}} debe comenzar con http:// o https://.');
      return false;
    }
    return true;
  };

  const saveCampaign = async (): Promise<string | null> => {
    if (!tituloInterno.trim()) {
      toast.error('Completá el título de la campaña.');
      return null;
    }
    if (!asunto.trim()) {
      toast.error('Completá el asunto del correo.');
      return null;
    }
    if (!validateCampaignContent()) return null;
    setSaving(true);
    const res = await authFetch('/api/admin/email-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: tituloInterno.trim(),
        asunto: asunto.trim(),
        template_id: contentMode === 'custom_html' ? 'custom_html' : templateId,
        contact_list_id: contactListId === '__ALL__' ? null : contactListId,
      }),
    });
    if (!res.ok) {
      setSaving(false);
      toast.error(await readApiError(res));
      return null;
    }
    const created = (await res.json()) as { id?: string };
    const id = created?.id ?? null;
    if (id) setLastCampaignId(id);
    toast.success('Campaña guardada en la base de datos.');
    setSaving(false);
    return id;
  };

  const dispatchBusy =
    dispatchJob !== null &&
    (dispatchJob.status === 'queued' || dispatchJob.status === 'running');

  const dispatchCampaignEmails = async () => {
    if (dispatchBusy) return;
    const campaignId = lastCampaignId ?? (await saveCampaign());
    if (!campaignId) return;
    if (!validateCampaignContent()) return;
    const html = contentMode === 'custom_html'
      ? customHtml
      : buildEmailHtmlForTemplate(templateId, buildInput);
    setSaving(true);
    prevStatusRef.current = null;
    const res = await authFetch(`/api/admin/email-campaigns/${campaignId}/dispatch/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        asunto: asunto.trim(),
        content_mode: contentMode,
        ...(contentMode === 'custom_html'
          ? { custom_variables: { imagen: customImageUrl.trim(), link: customLinkUrl.trim() } }
          : {}),
        ...(contactListId === '__ALL__'
          ? { audience: 'all' }
          : { contact_list_id: contactListId }),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(await readApiError(res));
      return;
    }
    const data = (await res.json()) as DispatchJobState;
    setDispatchJob(data);
    if (data.jobId && (data.status === 'queued' || data.status === 'running')) {
      window.localStorage.setItem(DISPATCH_LS_KEY, JSON.stringify({ jobId: data.jobId, campaignId }));
      startPolling(data.jobId);
    } else {
      toast.success(data.message ?? 'No hay envíos nuevos.');
    }
  };

  const listOptions = useMemo(
    () => [
      { value: '__ALL__', label: 'Enviar a TODOS los usuarios' },
      { value: '', label: listsLoading ? 'Cargando listas…' : '— O elegí una lista guardada —' },
      ...lists.map((l) => ({
        value: l.id,
        label: `${l.nombre}${typeof l.member_count === 'number' ? ` · ${l.member_count} contactos` : ''}`,
      })),
    ],
    [lists, listsLoading],
  );

  const sectionSubtitle = useMemo(() => {
    if (contentMode === 'custom_html') {
      return 'HTML propio: importá o pegá el código, insertá variables y revisá el resultado en vivo antes de enviar.';
    }
    if (templateId === 'minimal_notice') {
      return 'Aviso corto: badge, texto y cuándo/dónde en una línea.';
    }
    if (templateId === 'editorial_event') {
      return 'Speaker destacado, franja violeta y CTA. Fecha multilínea: 1ª = barra corta, resto = detalle.';
    }
    if (templateId === 'platform_features') {
      return 'Aviso de plataforma: hero, bloques, tip amarillo y CTA. Maquetación responsive.';
    }
    return 'Layout completo 600px: flyer, fecha, recordatorios y pie con imagen.';
  }, [contentMode, templateId]);

  const editorGrid = (
      <div
        className="email-campaign-layout"
        style={{
          display: 'grid',
          gridTemplateColumns: wide ? 'minmax(0, 1fr) minmax(320px, 520px)' : '1fr',
          gap: wide ? 28 : 22,
          alignItems: 'start',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <FormSection title="Identificación y envío">
            <div style={crm.formField}>
              <span style={crm.label}>Tipo de contenido</span>
              <div style={crm.segmentTrack} role="group" aria-label="Tipo de contenido del email">
                <button
                  type="button"
                  className="xplora-admin-seg"
                  style={crm.segmentBtn(contentMode === 'guided_template')}
                  aria-pressed={contentMode === 'guided_template'}
                  onClick={() => setContentMode('guided_template')}
                >
                  <span style={crm.segmentLabel}>Plantilla guiada</span>
                </button>
                <button
                  type="button"
                  className="xplora-admin-seg"
                  style={crm.segmentBtn(contentMode === 'custom_html')}
                  aria-pressed={contentMode === 'custom_html'}
                  onClick={() => setContentMode('custom_html')}
                >
                  <span style={crm.segmentLabel}>HTML propio</span>
                </button>
              </div>
              <p style={crm.hint}>Usá una plantilla del panel o controlá por completo el HTML y sus variables.</p>
            </div>
            <Sel
              label="Lista de contactos (destinatarios)"
              hint="«Todos» se calcula al enviar (incluye usuarios nuevos). Si elegís una lista guardada, se usan solo esos contactos."
              value={contactListId}
              onChange={(v) => setContactListId(v as '__ALL__' | string)}
              options={listOptions}
            />
            {contentMode === 'guided_template' ? (
              <Sel
                label="Plantilla de email"
                hint={EMAIL_TEMPLATE_OPTIONS.find(o => o.id === templateId)?.description ?? ''}
                value={templateId}
                onChange={v => setTemplateId(v as EmailTemplateId)}
                options={EMAIL_TEMPLATE_OPTIONS.map(o => ({ value: o.id, label: o.label }))}
              />
            ) : null}
            {contentMode === 'custom_html' || showCampaignField('tituloInterno', templateId) ? (
              <Field
                label="Título de la campaña (solo base de datos)"
                hint="Nombre descriptivo para vos; no se muestra en el mail."
                value={tituloInterno}
                onChange={setTituloInterno}
                placeholder="Ej: Newsletter abril 2026 · Workshop UX"
              />
            ) : null}
            {contentMode === 'custom_html' || showCampaignField('asunto', templateId) ? (
              <Field
                label="Asunto del correo"
                hint="Lo que ve la persona en la bandeja de entrada."
                value={asunto}
                onChange={setAsunto}
                placeholder="Ej: Te esperamos el jueves en Xplora"
              />
            ) : null}
          </FormSection>

          {contentMode === 'guided_template' ? (
            <EmailCampaignEventFields
              templateId={templateId}
              estado={estado}
              onEstadoChange={setEstado}
              flyerUrl={flyerUrl}
              onFlyerUrlChange={setFlyerUrl}
              textoPrincipal={textoPrincipal}
              onTextoPrincipalChange={setTextoPrincipal}
              fecha={fecha}
              onFechaChange={setFecha}
              hora={hora}
              onHoraChange={setHora}
              lugar={lugar}
              onLugarChange={setLugar}
              orador={orador}
              onOradorChange={setOrador}
              ctaUrl={ctaUrl}
              onCtaUrlChange={setCtaUrl}
            />
          ) : null}

          {contentMode === 'guided_template' && templateId === 'platform_features' ? (
            <EmailCampaignPlatformFields platform={platform} onPlatformChange={setPlatform} />
          ) : null}

          {contentMode === 'custom_html' ? (
            <FormSection title="HTML personalizado">
              <CustomEmailHtmlEditor
                html={customHtml}
                imageUrl={customImageUrl}
                linkUrl={customLinkUrl}
                unsupportedVariables={unsupportedCustomVariables}
                onHtmlChange={setCustomHtml}
                onImageUrlChange={setCustomImageUrl}
                onLinkUrlChange={setCustomLinkUrl}
              />
            </FormSection>
          ) : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 8 }}>
            <button
              type="button"
              className="xplora-admin-primary"
              style={{ ...crm.primaryBtn, opacity: saving || dispatchBusy ? 0.75 : 1 }}
              disabled={saving || dispatchBusy}
              onClick={() => void dispatchCampaignEmails()}
            >
              {dispatchBusy ? 'Enviando en segundo plano…' : saving ? 'Guardando…' : 'Enviar correos (Resend)'}
            </button>
            {dispatchBusy && dispatchJob ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  minWidth: 0,
                  flex: '1 1 220px',
                }}
              >
                <span className="xplora-dispatch-spinner" aria-hidden />
                <div style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.45, minWidth: 0 }}>
                  <strong style={{ color: 'var(--ink-soft)' }}>
                    {dispatchJob.sent + dispatchJob.failed.length} de {dispatchJob.attempted}
                  </strong>
                  {dispatchJob.current_email ? (
                    <span>
                      {' '}
                      · último: <span style={{ wordBreak: 'break-all' }}>{dispatchJob.current_email}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div style={{ fontSize: 13, color: 'var(--ink-muted)', margin: 0, maxWidth: 520, lineHeight: 1.45 }}>
              <p style={{ margin: 0 }}>
                El servidor personaliza y envía por Resend el{' '}
                <strong>{contentMode === 'custom_html' ? 'HTML propio' : 'HTML de la plantilla'}</strong> que ves en la vista previa.
              </p>
              {lastCampaignId ? (
                <p style={{ margin: '10px 0 0', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
                  Última campaña · id: {lastCampaignId}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <aside
          className="email-campaign-preview-col"
          style={
            wide
              ? {
                  position: 'sticky' as const,
                  top: 8,
                  maxHeight: 'calc(100vh - 100px)',
                  overflowY: 'auto' as const,
                  minWidth: 0,
                }
              : { minWidth: 0 }
          }
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--ink-muted)',
              marginBottom: 10,
            }}
          >
            Vista previa del mail
          </p>
          {contentMode === 'custom_html' ? (
            <CustomEmailHtmlLivePreview
              html={customHtml}
              asunto={asunto}
              variables={customPreviewVariables}
            />
          ) : (
            <EmailHtmlLivePreview templateId={templateId} input={buildInput} asunto={asunto} />
          )}
        </aside>
      </div>
  );

  if (bare) {
    return editorGrid;
  }

  return (
    <CrmSection
      kicker="Comunicación"
      title="Campañas de email"
      subtitle={sectionSubtitle}
      onNew={() => {}}
      showNew={false}
    >
      {editorGrid}
    </CrmSection>
  );
}
