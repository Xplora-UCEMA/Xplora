import { escapeHtml } from './emailHtmlEscape';
import type { EmailTemplateBuildInput } from './emailTemplateInput';
import type { PlatformFeatureBlock } from './emailTemplateTypes';
import { EMAIL_FOOTER_IMAGE_URL, EMAIL_LOGO_URL, EMAIL_ORG_TAGLINE } from './emailTemplateShared';

function featureRow(f: PlatformFeatureBlock): string {
  const icon = escapeHtml(f.icon.trim() || '✦');
  const title = escapeHtml(f.title.trim() || '—');
  const desc = escapeHtml(f.description.trim() || '—');
  return `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
          <tr>
            <td width="44" style="vertical-align:top;">
              <div class="feature-icon" style="width:40px;height:40px;background:#f9f7ff;border-radius:10px;text-align:center;line-height:40px;font-size:20px;">${icon}</div>
            </td>
            <td style="padding-left:16px;vertical-align:top;">
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1a1a1a;">${title}</p>
              <p style="margin:0;font-size:13px;color:#666666;line-height:1.6;">${desc}</p>
            </td>
          </tr>
        </table>`;
}

export function buildPlatformHtml(input: EmailTemplateBuildInput): string {
  const d = input.platform;
  const subject = escapeHtml(input.asunto.trim() || '—');
  const badgeText = escapeHtml(d.badgeText.trim() || 'Novedades');
  const heroTitle = escapeHtml(d.heroTitle.trim() || '—');
  const heroSubtitle = escapeHtml(d.heroSubtitle.trim() || '—');
  const introText = escapeHtml(d.introText.trim() || '…');
  const highlightText = escapeHtml(d.highlightText.trim() || '—');
  const ctaIntro = escapeHtml(d.ctaIntro.trim() || '—');
  const ctaLabel = escapeHtml(d.ctaLabel.trim() || 'Ir a Xplora');
  const ctaHref = escapeHtml(d.ctaUrl.trim() || '#');
  const unsubHref = '{{UNSUBSCRIBE_URL}}';

  const featuresHtml = d.features.map(featureRow).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    a { text-decoration: none !important; }
    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }
    body { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }

    @media only screen and (max-width: 620px) {
      .email-wrapper  { padding: 16px 8px !important; }
      .email-body     { border-radius: 0 !important; }
      .logo-cell      { padding: 28px 20px 20px !important; }
      .hero-cell      { padding: 28px 20px 16px !important; }
      .features-cell  { padding: 0 20px 20px !important; }
      .cta-cell       { padding: 0 20px 28px !important; }
      .signoff-cell   { padding: 12px 20px 28px !important; }
      .footer-img     { width: 100% !important; height: auto !important; }
      .hero-title     { font-size: 26px !important; line-height: 1.2 !important; }
      .feature-icon   { width: 36px !important; height: 36px !important; font-size: 18px !important; }
      .btn-cta {
        display: block !important;
        width: 100% !important;
        text-align: center !important;
        padding: 16px 20px !important;
        box-sizing: border-box !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
  <tr><td align="center" class="email-wrapper" style="padding:32px 16px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" class="email-body" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">

      <tr><td align="center" class="logo-cell" style="padding:40px 40px 32px;border-bottom:1px solid #eeeeee;">
        <img src="${EMAIL_LOGO_URL}" alt="Xplora UCEMA" width="56" style="display:block;margin:0 auto 12px auto;max-width:56px;height:auto;">
        <p style="margin:0;font-size:11px;color:#999999;letter-spacing:3px;text-transform:uppercase;">${escapeHtml(EMAIL_ORG_TAGLINE)}</p>
      </td></tr>

      <tr><td class="hero-cell" style="padding:40px 48px 24px;background:linear-gradient(135deg,#603ef9 0%,#8b6ffa 100%);">
        <p style="margin:0 0 10px;display:inline-block;background:rgba(255,255,255,0.15);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:6px 14px;border-radius:20px;">🌐 ${badgeText}</p>
        <p class="hero-title" style="margin:12px 0 16px;font-size:32px;font-weight:700;color:#ffffff;line-height:1.15;">${heroTitle}</p>
        <p style="margin:0;font-size:16px;color:rgba(255,255,255,0.88);line-height:1.65;">${heroSubtitle}</p>
      </td></tr>

      <tr><td style="padding:28px 48px 8px;">
        <p style="margin:0 0 16px;font-size:15px;color:#333333;line-height:1.7;">Hola:</p>
        <p style="margin:0 0 0;font-size:15px;color:#555555;line-height:1.7;">${introText}</p>
      </td></tr>

      <tr><td class="features-cell" style="padding:20px 48px 24px;">
        ${featuresHtml}
      </td></tr>

      <tr><td style="padding:0 48px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fef3c7;border-radius:8px;">
          <tr><td style="padding:14px 20px;">
            <p style="margin:0;font-size:14px;color:#92400e;line-height:1.6;">${highlightText}</p>
          </td></tr>
        </table>
      </td></tr>

      <tr><td align="center" class="cta-cell" style="padding:0 48px 32px;">
        <p style="margin:0 0 16px;font-size:15px;color:#333333;line-height:1.7;">${ctaIntro}</p>
        <a href="${ctaHref}" class="btn-cta" style="display:inline-block;background:#603ef9;color:#ffffff !important;text-decoration:none !important;font-size:15px;font-weight:700;padding:16px 40px;border-radius:8px;">${ctaLabel}</a>
      </td></tr>

      <tr><td class="signoff-cell" style="padding:16px 48px 40px;border-top:1px solid #eeeeee;">
        <p style="margin:20px 0 0;font-size:14px;color:#555555;line-height:1.7;">¡Nos vemos ahí!<br><strong>El equipo de Xplora – UCEMA</strong></p>
      </td></tr>

      <tr><td style="padding:0;line-height:0;">
        <img src="${EMAIL_FOOTER_IMAGE_URL}" alt="Xplora Footer" class="footer-img" width="600" style="display:block;width:100%;max-width:600px;height:auto;">
      </td></tr>

      <tr><td align="center" style="padding:16px 20px;background:#0a0914;">
        <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.3);">¿No querés recibir más emails? <a href="${unsubHref}" style="color:rgba(255,255,255,0.5) !important;text-decoration:none !important;">Desuscribite acá</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}
