/**
 * Listado de campañas de email y audiencia (quién recibió cada envío vía `campanias_envios`).
 */
import type { RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAppConfig, loadEnvFromProjectRoot, type AppConfig } from '../../config/env.js';
import { fetchAllMemberRows } from '../../services/admin-member-rows.service.js';
import { createUserSupabase, createServiceSupabase } from '../../infra/supabase-clients.js';
import { BadRequestError, ForbiddenError, HttpError } from '../errors/http-error.js';
import { asyncHandler } from '../middleware/async-handler.js';
import {
  DEFAULT_EMAIL_TEMPLATE_ID,
  isValidEmailTemplateId,
  type EmailTemplateId,
} from '../../domain/email-template-ids.js';
import { getContactListById } from '../../services/contact-lists.service.js';
import {
  mapUsuarioIdsToRecipientsWithEmail,
  resolveCampaignUsuarioIdsFromBody,
} from '../../services/email-campaign-audience.service.js';
import {
  createDispatchJob,
  getDispatchJob,
  startDispatchJobRunner,
} from '../../services/email-dispatch-queue.service.js';
import {
  findUnsupportedCustomEmailVariables,
  type CustomEmailCampaignData,
} from '../../domain/custom-email-template.js';

const FETCH_PAGE = 1000;

function optionalTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validateOptionalHttpUrl(value: string, label: string): string {
  if (!value) return '';
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadRequestError(`${label} debe ser una URL válida.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestError(`${label} debe comenzar con http:// o https://.`);
  }
  return parsed.toString();
}

function parseCustomEmailCampaignData(
  body: Record<string, unknown>,
  titulo: string,
  asunto: string,
): CustomEmailCampaignData | null {
  if (body.content_mode !== 'custom_html') return null;
  const rawVariables =
    typeof body.custom_variables === 'object' && body.custom_variables !== null && !Array.isArray(body.custom_variables)
      ? (body.custom_variables as Record<string, unknown>)
      : {};
  return {
    imagen: validateOptionalHttpUrl(optionalTrimmedString(rawVariables.imagen), 'Imagen'),
    link: validateOptionalHttpUrl(optionalTrimmedString(rawVariables.link), 'Link'),
    titulo,
    asunto,
  };
}

function parseCampaignRouteId(req: { params: { id?: string | string[] } }): string {
  const rawId = req.params.id;
  const idRaw = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!idRaw || typeof idRaw !== 'string') throw new BadRequestError('Falta id de campaña.');
  return idRaw;
}

async function fetchUsuarioIdsEnvioCampaign(
  sb: SupabaseClient,
  campaniaId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('campanias_envios')
      .select('usuario_id')
      .eq('campania_id', campaniaId)
      .range(offset, offset + FETCH_PAGE - 1);
    if (error) throw new BadRequestError(error.message);
    const chunk = (data as { usuario_id: string }[] | null) ?? [];
    for (const row of chunk) out.add(row.usuario_id);
    if (chunk.length < FETCH_PAGE) break;
    offset += FETCH_PAGE;
  }
  return out;
}

function mapCampaignRow(raw: Record<string, unknown>): {
  id: string;
  titulo_interno: string | null;
  asunto: string | null;
  template_id: EmailTemplateId;
  contact_list_id?: string | null;
} {
  const rawTemplate =
    typeof raw.template_id === 'string' && isValidEmailTemplateId(raw.template_id)
      ? raw.template_id
      : DEFAULT_EMAIL_TEMPLATE_ID;
  return {
    id: String(raw.id),
    titulo_interno:
      (typeof raw.titulo_interno === 'string'
        ? raw.titulo_interno
        : typeof raw.nombre === 'string'
          ? raw.nombre
          : typeof raw.titulo === 'string'
            ? raw.titulo
            : null) ?? null,
    asunto: typeof raw.asunto === 'string' ? raw.asunto : null,
    template_id: rawTemplate,
    contact_list_id: typeof raw.contact_list_id === 'string' ? raw.contact_list_id : null,
  };
}

/** POST /api/admin/email-campaigns — solo `nombre` y `asunto` (created_at/updated_at los define la BD). */
export function createEmailCampaignInsertHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const sb = createUserSupabase(config, req.headers.authorization);
    const body = req.body as Record<string, unknown>;
    const nombre =
      (typeof body.nombre === 'string' ? body.nombre.trim() : '') ||
      (typeof body.titulo_interno === 'string' ? body.titulo_interno.trim() : '');
    const asunto = typeof body.asunto === 'string' ? body.asunto.trim() : '';
    if (!nombre) {
      throw new BadRequestError('El título de la campaña (nombre) es obligatorio.');
    }
    if (!asunto) {
      throw new BadRequestError('El asunto es obligatorio.');
    }

    const rawTemplateId = body.template_id;
    const template_id =
      typeof rawTemplateId === 'string' && isValidEmailTemplateId(rawTemplateId.trim())
        ? rawTemplateId.trim()
        : DEFAULT_EMAIL_TEMPLATE_ID;

    const row = { nombre, asunto, template_id };

    // Opcional: asociar campaña a una lista de contactos (audiencia objetivo).
    const rawListId = body.contact_list_id;
    if (typeof rawListId === 'string' && rawListId.trim()) {
      const listId = rawListId.trim();
      const uid = req.authUser?.id ?? null;
      if (!uid) throw new ForbiddenError('No hay usuario autenticado.');
      const list = await getContactListById(sb, listId);
      if (!list) throw new BadRequestError('Lista no encontrada.');
      if ((list.created_by_auth_user_id ?? null) !== uid) {
        throw new ForbiddenError('Solo podés usar tus propias listas de contactos.');
      }
      (row as Record<string, unknown>).contact_list_id = listId;
    }

    const { data, error } = await sb.from('campanias_email').insert(row).select().single();
    if (error) {
      throw new BadRequestError(error.message);
    }
    res.status(201).json(data);
  });
}

/** GET /api/admin/email-campaigns */
export function createEmailCampaignsListHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const sb = createUserSupabase(config, req.headers.authorization);
    const { data, error } = await sb.from('campanias_email').select('*').order('id', { ascending: false });
    if (error) {
      throw new BadRequestError(error.message);
    }
    const rows = ((data as Record<string, unknown>[]) ?? []).map(mapCampaignRow);
    res.json(rows);
  });
}

/**
 * POST /api/admin/email-campaigns/:id/envios
 * Registra en `campanias_envios` que esos usuarios ya recibieron esta campaña (tras envío real por Resend u otro).
 * Idempotente: no duplica filas (usuario ya registrado se cuenta en skipped_already_sent).
 */
export function createEmailCampaignLogEnviosHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const campaignId = parseCampaignRouteId(req);
    const body = req.body as Record<string, unknown>;
    const sb = createUserSupabase(config, req.headers.authorization);

    const usuario_ids = await resolveCampaignUsuarioIdsFromBody(sb, body, req.authUser?.id ?? null);

    const { data: campaignRow, error: cErr } = await sb
      .from('campanias_email')
      .select('id')
      .eq('id', campaignId)
      .maybeSingle();
    if (cErr) throw new BadRequestError(cErr.message);
    if (!campaignRow) throw new BadRequestError('Campaña no encontrada.');

    const existing = await fetchUsuarioIdsEnvioCampaign(sb, campaignId);
    const nuevos = usuario_ids.filter(uid => !existing.has(uid));
    const skipped_already_sent = usuario_ids.length - nuevos.length;

    if (nuevos.length === 0) {
      res.json({ inserted: 0, skipped_already_sent, total_recipients: usuario_ids.length });
      return;
    }

    const rows = nuevos.map(usuario_id => ({
      campania_id: campaignId,
      usuario_id,
    }));

    const { error: insErr } = await sb.from('campanias_envios').insert(rows);
    if (insErr) throw new BadRequestError(insErr.message);

    res.status(201).json({
      inserted: nuevos.length,
      skipped_already_sent,
      total_recipients: usuario_ids.length,
    });
  });
}

/** GET /api/admin/email-campaigns/:id/audience */
export function createEmailCampaignAudienceHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const id = parseCampaignRouteId(req);
    const sb = createUserSupabase(config, req.headers.authorization);

    const { data: rawCampaign, error: cErr } = await sb
      .from('campanias_email')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (cErr) throw new BadRequestError(cErr.message);
    if (!rawCampaign || typeof rawCampaign !== 'object') {
      throw new BadRequestError('Campaña no encontrada.');
    }

    const campaign = mapCampaignRow(rawCampaign as Record<string, unknown>);
    const [members, enviados] = await Promise.all([
      fetchAllMemberRows(sb),
      fetchUsuarioIdsEnvioCampaign(sb, id),
    ]);

    const rows = members.map(m => ({
      ...m,
      enviado: enviados.has(m.id),
    }));

    res.json({ campaign, rows });
  });
}

function parseDispatchJobId(req: { params: { jobId?: string | string[] } }): string {
  const raw = req.params.jobId;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || typeof id !== 'string' || !id.trim()) throw new BadRequestError('Falta jobId.');
  return id.trim();
}

/**
 * GET /api/admin/email-campaign-dispatch/jobs/:jobId
 * Estado de un envío en segundo plano (polling desde el panel).
 */
export function createEmailCampaignDispatchJobStatusHandler(_config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const jobId = parseDispatchJobId(req);
    const state = getDispatchJob(jobId);
    if (!state) {
      throw new HttpError(
        404,
        'Envío no encontrado o expiró (p. ej. reinicio del servidor).',
        'DISPATCH_JOB_NOT_FOUND',
      );
    }
    res.json(state);
  });
}

/**
 * POST /api/admin/email-campaigns/:id/dispatch/start
 * Encola envío por Resend (HTML + audiencia igual que antes). Responde 202 al toque; el trabajo sigue en el servidor.
 * Tras cada envío exitoso se inserta una fila en `campanias_envios`.
 */
export function createEmailCampaignDispatchStartHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    loadEnvFromProjectRoot();
    const live = getAppConfig();
    if (!live.resend) {
      throw new BadRequestError(
        'Envío de campañas: falta RESEND_API_KEY (o RESEND_KEY). En local: archivo `.env` en la raíz del repo (junto a package.json), sin espacios alrededor del =. Si el panel llama a un API en producción (Railway, etc.), definí la misma variable allí. Remitente: MAIL_FROM o RESEND_FROM.',
      );
    }
    if (!live.unsubscribeTokenSecret) {
      throw new BadRequestError(
        'Falta UNSUBSCRIBE_TOKEN_SECRET (o MEMBER_JWT_SECRET) en la configuración del servidor. No se pueden enviar campañas sin un enlace seguro de baja.',
      );
    }

    const campaignId = parseCampaignRouteId(req);
    const body = req.body as Record<string, unknown>;
    const sb =
      createServiceSupabase(config) ?? createUserSupabase(config, req.headers.authorization);

    const html = typeof body.html === 'string' ? body.html : '';
    if (!html.trim()) throw new BadRequestError('Falta html del correo (plantilla renderizada).');
    if (html.length > 2_500_000) throw new BadRequestError('HTML demasiado grande.');

    if (body.content_mode === 'custom_html') {
      const unsupportedVariables = findUnsupportedCustomEmailVariables(html);
      if (unsupportedVariables.length > 0) {
        throw new BadRequestError(
          `Variables HTML no reconocidas: ${unsupportedVariables.map(name => `{{${name}}}`).join(', ')}.`,
        );
      }
    }

    const { data: campaignRow, error: cErr } = await sb
      .from('campanias_email')
      .select('id, nombre, asunto')
      .eq('id', campaignId)
      .maybeSingle();
    if (cErr) throw new BadRequestError(cErr.message);
    if (!campaignRow) throw new BadRequestError('Campaña no encontrada.');

    const subject =
      typeof body.asunto === 'string' && body.asunto.trim()
        ? body.asunto.trim()
        : String((campaignRow as { asunto?: string }).asunto ?? '').trim();
    if (!subject) throw new BadRequestError('Falta asunto del correo (guardá la campaña con asunto o envialo en el JSON).');

    const campaignTitle = String((campaignRow as { nombre?: string }).nombre ?? '').trim();
    const customEmailCampaign = parseCustomEmailCampaignData(body, campaignTitle, subject);

    const usuarioIdsResolved = await resolveCampaignUsuarioIdsFromBody(sb, body, req.authUser?.id ?? null);
    const members = await fetchAllMemberRows(sb);
    const recipients = mapUsuarioIdsToRecipientsWithEmail(usuarioIdsResolved, members);
    if (recipients.length === 0) {
      throw new BadRequestError(
        'Ningún destinatario tiene un email válido en la tabla usuarios. Revisá los datos o la audiencia.',
      );
    }

    const existing = await fetchUsuarioIdsEnvioCampaign(sb, campaignId);
    const nuevos = recipients.filter(r => !existing.has(r.usuario_id));
    const skipped_already_sent = recipients.length - nuevos.length;

    if (nuevos.length === 0) {
      res.json({
        jobId: null,
        status: 'completed' as const,
        campaignId,
        total: recipients.length,
        skipped_already_sent,
        attempted: 0,
        sent: 0,
        failed: [],
        current_email: null,
        from: live.resend.from,
        message: 'No hay envíos nuevos: todos ya estaban registrados o la selección quedó vacía.',
      });
      return;
    }

    const jobId = createDispatchJob({
      campaignId,
      subject,
      html,
      customEmailCampaign,
      recipients: nuevos,
      skipped_already_sent,
      resend: live.resend,
      sb,
      unsubscribe: {
        siteUrl: live.publicSiteUrl,
        tokenSecret: live.unsubscribeTokenSecret,
      },
    });

    startDispatchJobRunner(jobId);

    const snapshot = getDispatchJob(jobId);
    if (!snapshot) throw new BadRequestError('No se pudo crear el trabajo de envío.');
    res.status(202).json(snapshot);
  });
}
