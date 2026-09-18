import { Buffer } from 'node:buffer';
import type { AppConfig } from '../config/env.js';
import {
  sendOneResendEmailDetailed,
  type ResendSendResult,
} from './resend-send.service.js';
import {
  parseRewardDelivery,
  rewardQrFileName,
  type RewardQrFormat,
} from './reward-delivery.js';

export const POINTS_QR_CONTENT_ID = 'labitconf-ticket-qr';
export const MAX_POINTS_QR_ATTACHMENT_BYTES = 2 * 1024 * 1024;

export type PointsQrAttachment = {
  /** Raw Base64 content, without a data URL prefix. */
  contentBase64: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
};

export type PointsRedemptionEmail = {
  redemptionId: string;
  to: string;
  title: string;
  cost: number;
  delivery: string;
  qrAttachment?: PointsQrAttachment;
};

export type PointsRedemptionEmailResult = ResendSendResult;

const rejected = (error: string): PointsRedemptionEmailResult => ({
  status: 'rejected',
  error,
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mimeFor(format: RewardQrFormat): PointsQrAttachment['contentType'] {
  return format === 'jpg' ? 'image/jpeg' : `image/${format}`;
}

function validBase64Bytes(value: string): number | null {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 1 || bytes.length > MAX_POINTS_QR_ATTACHMENT_BYTES) return null;
  if (bytes.toString('base64') !== value) return null;
  return bytes.length;
}

function renderQrPanel(eventTitle: string, hasInlineQr: boolean): string {
  const safeEventTitle = escapeHtml(eventTitle);
  if (!hasInlineQr) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ded6e6;border-radius:18px;background:#f7f4f9"><tr><td align="center" style="padding:30px 24px">
      <p style="margin:0 0 8px;color:#6542ee;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Entrada digital</p>
      <p style="margin:0 0 8px;color:#1b1424;font-size:22px;font-weight:700">${safeEventTitle}</p>
      <p style="margin:0;color:#6c6375;font-size:14px;line-height:1.55">Tu QR está guardado de forma privada. Abrí Mis canjes para verlo o descargarlo.</p>
    </td></tr></table>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ded6e6;border-radius:18px;background:#f7f4f9"><tr><td align="center" style="padding:24px">
    <p style="margin:0 0 6px;color:#6542ee;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Entrada digital</p>
    <p style="margin:0 0 18px;color:#1b1424;font-size:22px;font-weight:700">${safeEventTitle}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:288px;border:1px solid #e3dce9;border-radius:14px;background:#ffffff"><tr><td style="padding:14px">
      <img src="cid:${POINTS_QR_CONTENT_ID}" width="260" height="260" alt="Código QR de tu entrada para ${safeEventTitle}" style="display:block;width:260px;max-width:100%;height:auto;border:0">
    </td></tr></table>
    <p style="margin:16px 0 0;color:#6c6375;font-size:13px;line-height:1.55">Presentalo desde tu celular al ingresar. No compartas este QR.</p>
  </td></tr></table>`;
}

export function renderPointsRedemptionEmail(
  input: Pick<PointsRedemptionEmail, 'title' | 'cost' | 'delivery'> & {
    accountUrl: string;
    hasInlineQr?: boolean;
  },
): string {
  const title = escapeHtml(input.title);
  const accountUrl = escapeHtml(input.accountUrl);
  const delivery = parseRewardDelivery(input.delivery);
  const isQr = delivery.kind === 'qr';
  const eventTitle = isQr ? delivery.value.eventTitle : input.title;
  const heading = isQr ? `Tu entrada para ${escapeHtml(eventTitle)}` : 'Canje confirmado';
  const preheader = isQr
    ? `Tu QR para ${escapeHtml(eventTitle)} ya está listo.`
    : 'Tu canje de Xplora Points fue confirmado.';
  const details = isQr
    ? renderQrPanel(eventTitle, input.hasInlineQr === true)
    : delivery.kind === 'legacy'
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ded6e6;border-radius:16px;background:#f7f4f9"><tr><td style="padding:20px 22px">
        <p style="margin:0 0 8px;color:#6542ee;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Cómo usar tu beneficio</p>
        <p style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:#292130;font-size:15px;line-height:1.6">${escapeHtml(delivery.text)}</p>
      </td></tr></table>`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #ded6e6;border-radius:16px;background:#f7f4f9"><tr><td style="padding:20px 22px">
        <p style="margin:0 0 8px;color:#6542ee;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Beneficio guardado</p>
        <p style="margin:0;color:#292130;font-size:15px;line-height:1.6">No pudimos mostrar las instrucciones en este email. Tu canje sigue guardado; abrí Mis canjes o contactá a Xplora.</p>
      </td></tr></table>`;
  const buttonLabel = isQr ? 'Ver mi QR en Mis canjes' : 'Ver Mis canjes';
  const accountFallback = isQr
    ? 'Si la imagen no aparece en tu correo, tu entrada sigue disponible de forma segura en Mis canjes.'
    : 'Tu beneficio queda guardado en Mis canjes para que puedas consultarlo cuando lo necesites.';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${heading}</title><style>@media only screen and (max-width:480px){.xplora-main{padding:30px 18px 28px!important}.xplora-title{font-size:29px!important}.xplora-footer{padding:18px!important}}</style></head>
  <body style="margin:0;background:#f4f1f6;color:#1b1424;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f6"><tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;overflow:hidden;border:1px solid #e1dbe5;border-radius:22px;background:#ffffff;box-shadow:0 18px 50px rgba(35,22,49,.08)">
      <tr><td style="padding:22px 30px;background:#1b1424;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-.02em">Xplora<span style="color:#bca9ff">.</span></td></tr>
      <tr><td class="xplora-main" style="padding:38px 34px 34px">
        <p style="margin:0 0 10px;color:#6542ee;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Canje confirmado</p>
        <h1 class="xplora-title" style="margin:0 0 14px;color:#1b1424;font-size:34px;line-height:1.12;letter-spacing:-.03em">${heading}</h1>
        <p style="margin:0 0 26px;color:#5e5667;font-size:16px;line-height:1.65">Usaste <strong style="color:#1b1424">${input.cost} Xplora Points</strong> para canjear <strong style="color:#1b1424">${title}</strong>.</p>
        ${details}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr><td style="border-radius:12px;background:#6542ee">
          <a href="${accountUrl}" style="display:inline-block;padding:15px 22px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">${buttonLabel}</a>
        </td></tr></table>
        <p style="margin:0;color:#766e7d;font-size:12px;line-height:1.6">${accountFallback}</p>
      </td></tr>
      <tr><td class="xplora-footer" style="padding:20px 34px;border-top:1px solid #ece7ef;background:#faf8fb;color:#665d6d;font-size:11px;line-height:1.55">Este es un mensaje transaccional de Xplora porque realizaste un canje con tu cuenta.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export async function sendPointsRedemptionEmail(
  config: AppConfig,
  input: PointsRedemptionEmail,
): Promise<PointsRedemptionEmailResult> {
  if (!config.resend) return rejected('Resend no configurado');
  try {
    const accountUrl = new URL('/cuenta?vista=recompensas#mis-canjes', config.publicSiteUrl).toString();
    const delivery = parseRewardDelivery(input.delivery);
    let attachment: { content: string; filename: string; contentType: string; contentId: string } | undefined;
    if (input.qrAttachment) {
      if (delivery.kind !== 'qr') return rejected('El adjunto QR no corresponde a un delivery estructurado.');
      if (input.qrAttachment.contentType !== mimeFor(delivery.value.format))
        return rejected('El tipo del adjunto QR no coincide con el delivery.');
      if (validBase64Bytes(input.qrAttachment.contentBase64) === null)
        return rejected('El adjunto QR es inválido o supera 2 MB.');
      attachment = {
        content: input.qrAttachment.contentBase64,
        filename: rewardQrFileName(delivery.value),
        contentType: input.qrAttachment.contentType,
        contentId: POINTS_QR_CONTENT_ID,
      };
    }
    return await sendOneResendEmailDetailed(config.resend, {
      to: input.to,
      subject: delivery.kind === 'qr'
        ? `Tu entrada para ${delivery.value.eventTitle} · Xplora`
        : `Canje confirmado: ${input.title} · Xplora`,
      html: renderPointsRedemptionEmail({
        title: input.title,
        cost: input.cost,
        delivery: input.delivery,
        accountUrl,
        hasInlineQr: Boolean(attachment),
      }),
      text: delivery.kind === 'qr'
        ? `Tu entrada para ${delivery.value.eventTitle} está lista.\n\nUsaste ${input.cost} Xplora Points para canjear ${input.title}.\n\nAbrí tu QR en Mis canjes: ${accountUrl}\n\nNo compartas tu entrada.`
        : delivery.kind === 'legacy'
          ? `Canje confirmado: ${input.title}.\n\nUsaste ${input.cost} Xplora Points.\n\n${delivery.text}\n\nMis canjes: ${accountUrl}`
          : `Canje confirmado: ${input.title}.\n\nUsaste ${input.cost} Xplora Points.\n\nAbrí Mis canjes para ver tu beneficio: ${accountUrl}`,
      idempotencyKey: `points-redemption/${input.redemptionId}`,
      ...(attachment ? { attachments: [attachment] } : {}),
    });
  } catch (error) {
    return rejected(error instanceof Error ? error.message : String(error));
  }
}
