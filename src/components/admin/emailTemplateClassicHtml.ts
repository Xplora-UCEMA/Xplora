import { escapeHtml } from './emailHtmlEscape';
import type { EmailTemplateBuildInput } from './emailTemplateInput';
import {
  badgeParts,
  eventTitleFrom,
  splitBlocks,
  splitOrador,
} from './emailTemplateInput';

/** Logo y pie del boceto oficial (Cloudinary). */
const LOGO_URL =
  'https://res.cloudinary.com/doe1cks3v/image/upload/v1774141496/logo_sin_fondo_nlqlse.png';
const FOOTER_IMAGE_URL =
  'https://res.cloudinary.com/doe1cks3v/image/upload/v1774141495/WhatsApp_Image_2026-03-07_at_20.38.17_g1oisv.jpg';

const ORG_NAME = 'Xplora';
const ORG_TAGLINE = 'Innovación & comunidad';

/** Badge del wireframe: ámbar fijo + emoji y texto según “Estado”. */
const BADGE_BOX_STYLE =
  'margin:0 0 16px;display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:6px 14px;border-radius:20px;';

/**
 * Única plantilla disponible por ahora: tablas 600px según boceto compartido.
 * Textos de usuario escapados.
 */
export function buildClassicNewsletterHtml(input: EmailTemplateBuildInput): string {
  const { intro, body, closing } = splitBlocks(input.textoPrincipal);
  const { name: spName, role: spRole } = splitOrador(input.orador);
  const { emoji, text: badgeText } = badgeParts(input.estado);
  const eventTitle = eventTitleFrom(input);
  const subject = escapeHtml(input.asunto.trim() || '—');

  const introE = escapeHtml(intro);
  const bodyE = escapeHtml(body);
  const closingE = escapeHtml(closing);

  const dateLong = escapeHtml(input.fecha.trim() || '—');
  const timeLine = escapeHtml(input.hora.trim() || '—');
  const addrLine = escapeHtml(input.lugar.trim() || '—');

  const dayLine = escapeHtml(input.fecha.trim() || '—');
  const timeLocE = escapeHtml(
    [input.hora, input.lugar].filter(Boolean).join(' — ') || '— —',
  );

  const flyerBlock = input.flyerUrl.trim()
    ? `<tr><td style="padding:0;">
        <img src="${escapeHtml(input.flyerUrl.trim())}" alt="${escapeHtml(eventTitle)}" width="600" style="display:block;width:100%;">
      </td></tr>`
    : `<tr><td style="padding:48px 24px;background:#f3f4f6;text-align:center;font-size:14px;color:#9ca3af;">
        Subí un flyer para verlo en esta ubicación
      </td></tr>`;

  const speakerBlock =
    spName.trim().length > 0
      ? `<p style="margin:0 0 24px;font-size:22px;font-weight:700;color:#603ef9;line-height:1.3;">${escapeHtml(spName.trim())}${spRole.trim() ? `, <span style="font-weight:700;">${escapeHtml(spRole.trim())}</span>.` : '.'}</p>`
      : '';

  const eventLabel = escapeHtml('Tu próximo encuentro');
  const reminderTitle = escapeHtml('Recordá');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">

      <tr><td align="center" style="padding:40px 40px 32px;border-bottom:1px solid #eeeeee;">
        <img src="${LOGO_URL}" alt="${escapeHtml(ORG_NAME)}" width="56" style="display:block;margin:0 auto 12px auto;">
        <p style="margin:0;font-size:11px;color:#999999;letter-spacing:3px;text-transform:uppercase;">${escapeHtml(ORG_TAGLINE)}</p>
      </td></tr>

      ${flyerBlock}

      <tr><td style="padding:36px 48px 8px;">
        <p style="margin:0 0 16px;${BADGE_BOX_STYLE}">${escapeHtml(emoji)} ${escapeHtml(badgeText)}</p>
        <p style="margin:0 0 16px;font-size:15px;color:#333333;line-height:1.7;">Hola</p>
        <p style="margin:0 0 20px;font-size:15px;color:#333333;line-height:1.7;">${introE || '<span style="color:#9ca3af;">…</span>'}</p>
        ${speakerBlock}
        ${bodyE ? `<p style="margin:0 0 20px;font-size:15px;color:#555555;line-height:1.7;">${bodyE}</p>` : ''}
        <p style="margin:0 0 0;font-size:15px;color:#555555;line-height:1.7;">${closingE || ''}</p>
      </td></tr>

      <tr><td style="padding:28px 48px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#603ef9;border-radius:10px;">
          <tr><td style="padding:24px 28px;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:2px;text-transform:uppercase;">${eventLabel}</p>
            <p style="margin:0;font-size:26px;font-weight:700;color:#ffffff;">${dayLine}</p>
            <p style="margin:6px 0 0;font-size:16px;color:rgba(255,255,255,0.85);">${timeLocE}</p>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 48px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9f7ff;border-radius:8px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#603ef9;letter-spacing:2px;text-transform:uppercase;">${reminderTitle}</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="padding:5px 0;font-size:14px;color:#333333;">📅 &nbsp;${dateLong}</td></tr>
              <tr><td style="padding:5px 0;font-size:14px;color:#333333;">🕔 &nbsp;${timeLine}</td></tr>
              <tr><td style="padding:5px 0;font-size:14px;color:#333333;">📍 &nbsp;${addrLine}</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>

      <tr><td align="center" style="padding:0 48px 16px;">
        <p style="margin:0 0 16px;font-size:15px;color:#333333;line-height:1.7;">${escapeHtml('¿Ya te anotaste? Sumate desde el link.')}</p>
        <a href="#" style="display:inline-block;background:#603ef9;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 40px;border-radius:8px;">${escapeHtml('Confirmar asistencia')}</a>
      </td></tr>

      <tr><td style="padding:16px 48px 40px;border-top:1px solid #eeeeee;">
        <p style="margin:20px 0 0;font-size:14px;color:#555555;line-height:1.7;">${escapeHtml('Un abrazo,')}<br><strong>${escapeHtml('Equipo Xplora')}</strong></p>
      </td></tr>

      <tr><td style="padding:0;">
        <img src="${FOOTER_IMAGE_URL}" alt="${escapeHtml(ORG_NAME)} Footer" width="600" style="display:block;width:100%;">
      </td></tr>

      <tr><td align="center" style="padding:16px 40px;background:#0a0914;">
        <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3);">${escapeHtml('¿No querés recibir más emails?')} <a href="{{UNSUBSCRIBE_URL}}" style="color:rgba(255,255,255,0.5);text-decoration:none;">${escapeHtml('Desuscribite acá')}</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
