/**
 * Plantilla **editorial**: flyer, orador destacado, franja fecha, cuerpo + CTA (HTML provisto por diseño).
 * Saludo fijo (no usamos merge por nombre).
 */
import { escapeHtml } from './emailHtmlEscape';
import type { EmailTemplateBuildInput } from './emailTemplateInput';
import { eventTitleFrom, fechaCortaYLarga, splitOrador } from './emailTemplateInput';
import { labelForEstado } from './emailCampaignTypes';

const LOGO_URL =
  'https://res.cloudinary.com/doe1cks3v/image/upload/v1774141496/logo_sin_fondo_nlqlse.png';
const FOOTER_IMAGE_URL =
  'https://res.cloudinary.com/doe1cks3v/image/upload/v1774141495/WhatsApp_Image_2026-03-07_at_20.38.17_g1oisv.jpg';

function bodyHtml(text: string): string {
  const t = text.trim();
  if (!t) return '<span style="color:#999999;">…</span>';
  return escapeHtml(t).replace(/\r?\n/g, '<br>');
}

export function buildEditorialEventHtml(input: EmailTemplateBuildInput): string {
  const { name: orName, role: orRole } = splitOrador(input.orador);
  const title = eventTitleFrom(input);
  const tipoEvento = escapeHtml(labelForEstado(input.estado).toUpperCase());
  const { corta: fechaCorta, larga: fechaLarga } = fechaCortaYLarga(input.fecha);
  const horaE = escapeHtml(input.hora.trim() || '—');
  const lugarE = escapeHtml(input.lugar.trim() || '—');
  const fechaCortaE = escapeHtml(fechaCorta);
  const fechaLargaE = escapeHtml(fechaLarga);

  const speakerName = orName.trim() ? escapeHtml(orName.trim()) : '—';
  const speakerRoleBlock = orRole.trim()
    ? `<p style="margin:10px 0 0;font-family:Arial,sans-serif;font-size:14px;color:rgba(255,255,255,0.5);">${escapeHtml(orRole.trim())}</p>`
    : '';

  const flyerBlock = input.flyerUrl.trim()
    ? `<tr><td style="padding:0;line-height:0;">
        <img src="${escapeHtml(input.flyerUrl.trim())}" alt="${escapeHtml(title)}" width="600" style="display:block;width:100%;">
      </td></tr>`
    : `<tr><td style="padding:0;line-height:0;background:#e5e5e5;">
        <div style="padding:48px 24px;text-align:center;font-size:14px;color:#9ca3af;font-family:Arial,sans-serif;">Subí un flyer para verlo acá</div>
      </td></tr>`;

  const ctaHref = escapeHtml(input.ctaUrl.trim() || '#');
  const unsubHref = '{{UNSUBSCRIBE_URL}}';

  const subject = escapeHtml(input.asunto.trim() || 'Xplora UCEMA');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:'Arial Black',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f0f0;">
  <tr><td align="center" style="padding:32px 16px 48px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

      <tr><td style="background:#ffffff;border-left:8px solid #603ef9;padding:24px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:middle;">
              <img src="${LOGO_URL}" alt="Xplora UCEMA" width="38" style="display:block;">
            </td>
            <td align="right" style="vertical-align:middle;">
              <span style="display:inline-block;background:#603ef9;color:#ffffff;font-family:'Arial Black',Arial,sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;padding:6px 14px;">${tipoEvento}</span>
            </td>
          </tr>
        </table>
      </td></tr>

      ${flyerBlock}

      <tr><td style="background:#111111;padding:36px 32px 28px;">
        <p style="margin:0 0 6px;font-family:'Arial Black',Arial,sans-serif;font-size:9px;color:#603ef9;letter-spacing:4px;text-transform:uppercase;">Speaker</p>
        <p style="margin:0;font-family:'Arial Black',Arial,sans-serif;font-size:44px;color:#ffffff;line-height:1.0;text-transform:uppercase;word-break:break-word;">${speakerName}</p>
        ${speakerRoleBlock}
      </td></tr>

      <tr><td style="background:#603ef9;padding:18px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <p style="margin:0;font-family:'Arial Black',Arial,sans-serif;font-size:18px;color:#ffffff;">${fechaCortaE}</p>
            </td>
            <td align="right" style="vertical-align:middle;">
              <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:rgba(255,255,255,0.8);">${horaE} &nbsp;·&nbsp; ${lugarE}</p>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="background:#ffffff;padding:36px 32px 28px;border-left:8px solid #603ef9;">
        <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:12px;color:#999999;">Hola:</p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#222222;line-height:1.85;">${bodyHtml(input.textoPrincipal)}</p>
      </td></tr>

      <tr><td style="background:#f7f7f7;padding:20px 32px;border-left:8px solid #eeeeee;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="8" style="background:#603ef9;border-radius:2px;">&nbsp;</td>
            <td style="padding:0 0 0 16px;">
              <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#333333;line-height:2.0;">
                📅 &nbsp;<strong>${fechaLargaE}</strong><br>
                🕔 &nbsp;<strong>${horaE}</strong><br>
                📍 &nbsp;<strong>${lugarE}</strong>
              </p>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="background:#ffffff;padding:28px 32px 36px;">
        <a href="${ctaHref}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-family:'Arial Black',Arial,sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;padding:18px 48px;border-bottom:4px solid #603ef9;">RESERVÁ TU LUGAR</a>
      </td></tr>

      <tr><td style="background:#ffffff;padding:0 32px 32px;border-top:1px solid #eeeeee;">
        <p style="margin:16px 0 0;font-family:Arial,sans-serif;font-size:13px;color:#888888;line-height:1.7;">Nos vemos ahí,<br><strong style="color:#111111;">El equipo de Xplora UCEMA</strong></p>
      </td></tr>

      <tr><td style="padding:0;line-height:0;">
        <img src="${FOOTER_IMAGE_URL}" alt="Xplora UCEMA" width="600" style="display:block;width:100%;">
      </td></tr>

      <tr><td align="center" style="padding:18px 0 0;">
        <p style="margin:0;font-size:10px;color:#aaaaaa;font-family:Arial,sans-serif;">¿No querés recibir más emails? <a href="${unsubHref}" style="color:#603ef9;text-decoration:none;">Desuscribite acá</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
