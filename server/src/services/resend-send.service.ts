import type { AppConfig } from '../config/env.js';
import type { CampaignRecipient } from './email-campaign-audience.service.js';

/** Único proveedor de envío de campañas: API Resend (no configurable). */
export const RESEND_SEND_URL = 'https://api.resend.com/emails' as const;

export type SendCampaignEmailResult = {
  sentIds: string[];
  failed: { usuario_id: string; email: string; error: string }[];
};

export type ResendEmailAttachment = {
  /** Raw Base64 content, without a data URL prefix. */
  content: string;
  filename: string;
  contentType: string;
  contentId?: string;
};

export type ResendSendResult =
  | { status: 'sent'; providerId: string | null }
  | { status: 'rejected'; error: string }
  | { status: 'ambiguous'; error: string };

type ResendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  /** Versión explícita para clientes sin HTML. Si falta, se deriva del markup. */
  text?: string;
  replyTo?: string;
  /** Resend deduplicates requests with the same key and payload. */
  idempotencyKey?: string;
  attachments?: ResendEmailAttachment[];
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildFromHeader(resend: NonNullable<AppConfig['resend']>): string {
  return resend.fromName ? `"${resend.fromName}" <${resend.from}>` : resend.from;
}

function responseError(status: number, body: string): string {
  let message = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === 'string' && parsed.message) message = parsed.message;
  } catch {
    if (body) message = body.slice(0, 500);
  }
  return message;
}

/**
 * Resultado detallado para flujos que deben diferenciar un rechazo confirmado de
 * una respuesta cuyo efecto externo no puede determinarse de manera segura.
 */
export async function sendOneResendEmailDetailed(
  resend: NonNullable<AppConfig['resend']>,
  opts: ResendEmailOptions,
): Promise<ResendSendResult> {
  const text = (opts.text ?? stripHtml(opts.html)).slice(0, 12_000);
  const fromHeader = buildFromHeader(resend);
  try {
    const res = await fetch(RESEND_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resend.apiKey}`,
        'Content-Type': 'application/json',
        ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: fromHeader,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        ...(opts.attachments?.length ? {
          attachments: opts.attachments.map((attachment) => ({
            content: attachment.content,
            filename: attachment.filename,
            content_type: attachment.contentType,
            ...(attachment.contentId ? { content_id: attachment.contentId } : {}),
          })),
        } : {}),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const error = responseError(res.status, body);
      return res.status === 408 || res.status === 409 || res.status >= 500
        ? { status: 'ambiguous', error }
        : { status: 'rejected', error };
    }
    let response: unknown;
    try {
      response = await res.json();
    } catch {
      return { status: 'ambiguous', error: 'Resend aceptó la solicitud pero devolvió una respuesta inválida.' };
    }
    if (!response || typeof response !== 'object' || Array.isArray(response))
      return { status: 'ambiguous', error: 'Resend aceptó la solicitud pero devolvió una respuesta inválida.' };
    const providerId = (response as { id?: unknown }).id;
    if (providerId !== undefined && providerId !== null &&
        (typeof providerId !== 'string' || !providerId.trim() || providerId.length > 255))
      return { status: 'ambiguous', error: 'Resend aceptó la solicitud pero devolvió un identificador inválido.' };
    return { status: 'sent', providerId: typeof providerId === 'string' ? providerId : null };
  } catch (e) {
    return { status: 'ambiguous', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * API compatible para campañas y callers existentes. Devuelve `null` si Resend
 * confirmó el envío; cualquier otro resultado conserva el contrato de error.
 */
export async function sendOneResendEmail(
  resend: NonNullable<AppConfig['resend']>,
  opts: ResendEmailOptions,
): Promise<string | null> {
  const result = await sendOneResendEmailDetailed(resend, opts);
  return result.status === 'sent' ? null : result.error;
}

/**
 * Envío secuencial (compat). Preferí cola + `sendOneResendEmail` por destinatario.
 */
export async function sendCampaignEmailsViaResend(
  resend: NonNullable<AppConfig['resend']>,
  opts: { to: CampaignRecipient[]; subject: string; html: string },
): Promise<SendCampaignEmailResult> {
  const sentIds: string[] = [];
  const failed: SendCampaignEmailResult['failed'] = [];

  for (const r of opts.to) {
    const err = await sendOneResendEmail(resend, { to: r.email, subject: opts.subject, html: opts.html });
    if (err) {
      console.warn(`[resend] fallo envío a ${r.email}:`, err);
      failed.push({ usuario_id: r.usuario_id, email: r.email, error: err });
    } else {
      sentIds.push(r.usuario_id);
    }
  }

  return { sentIds, failed };
}
