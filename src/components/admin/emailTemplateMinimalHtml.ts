import { escapeHtml } from './emailHtmlEscape';
import type { EmailTemplateBuildInput } from './emailTemplateInput';
import { badgeParts, eventTitleFrom, splitBlocks, splitOrador } from './emailTemplateInput';

const LOGO_URL =
  'https://res.cloudinary.com/doe1cks3v/image/upload/v1774141496/logo_sin_fondo_nlqlse.png';
const ORG_NAME = 'Xplora';

/**
 * Plantilla **alternativa** (aviso corto). Misma entrada de formulario que la clásica; maquetación distinta.
 * Podés reemplazar el cuerpo de esta función cuando tengas el HTML definitivo.
 */
export function buildMinimalNoticeHtml(input: EmailTemplateBuildInput): string {
  const { intro, body, closing } = splitBlocks(input.textoPrincipal);
  const { name: spName, role: spRole } = splitOrador(input.orador);
  const { emoji, text: badgeText } = badgeParts(input.estado);
  const eventTitle = eventTitleFrom(input);
  const subject = escapeHtml(input.asunto.trim() || '—');

  const introE = escapeHtml(intro);
  const bodyE = escapeHtml(body);
  const closingE = escapeHtml(closing);

  const whenWhere = escapeHtml(
    [input.fecha, input.hora, input.lugar].filter(s => s.trim()).join(' · ') || '—',
  );

  const speakerLine =
    spName.trim().length > 0
      ? `<p style="margin:0 0 20px;font-size:16px;font-weight:600;color:#1e1b4b;">${escapeHtml(spName.trim())}${spRole.trim() ? ` <span style="font-weight:500;color:#4b5563;">· ${escapeHtml(spRole.trim())}</span>` : ''}</p>`
      : '';

  const flyer =
    input.flyerUrl.trim().length > 0
      ? `<tr><td style="padding:0 0 20px;">
          <img src="${escapeHtml(input.flyerUrl.trim())}" alt="${escapeHtml(eventTitle)}" width="560" style="display:block;width:100%;max-width:560px;border-radius:8px;">
        </td></tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f0eeea;font-family:Georgia,'Times New Roman',serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0eeea;">
  <tr><td align="center" style="padding:28px 16px 40px;">
    <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e0d8;">

      <tr><td align="center" style="padding:28px 32px 8px;border-bottom:1px solid #f0ebe3;">
        <img src="${LOGO_URL}" alt="${escapeHtml(ORG_NAME)}" width="48" style="display:block;margin:0 auto 8px;">
        <p style="margin:0;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;">Aviso</p>
      </td></tr>

      <tr><td style="padding:20px 32px 0;">
        <p style="margin:0 0 12px;display:inline-block;font-size:11px;font-weight:600;color:#92400e;background:#fef3c7;padding:4px 10px;border-radius:999px;">${escapeHtml(emoji)} ${escapeHtml(badgeText)}</p>
        <p style="margin:0 0 16px;font-size:16px;color:#1c1917;line-height:1.65;">${introE || '<span style="color:#a8a29e;">…</span>'}</p>
        ${speakerLine}
        ${bodyE ? `<p style="margin:0 0 16px;font-size:15px;color:#44403c;line-height:1.65;">${bodyE}</p>` : ''}
        <p style="margin:0 0 8px;font-size:15px;color:#44403c;line-height:1.65;">${closingE || ''}</p>
      </td></tr>

      ${flyer}

      <tr><td style="padding:0 32px 24px;">
        <p style="margin:0;font-size:13px;color:#78716c;line-height:1.5;border-top:1px solid #f0ebe3;padding-top:16px;">${whenWhere}</p>
      </td></tr>

      <tr><td style="padding:0 32px 28px;">
        <p style="margin:0;font-size:14px;color:#57534e;">Un abrazo,<br><strong>Equipo Xplora</strong></p>
      </td></tr>

      <tr><td align="center" style="padding:0 32px 22px;border-top:1px solid #f0ebe3;">
        <p style="margin:16px 0 0;font-size:11px;color:#a8a29e;">¿No querés recibir más emails? <a href="{{UNSUBSCRIBE_URL}}" style="color:#603ef9;text-decoration:none;">Desuscribite acá</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
