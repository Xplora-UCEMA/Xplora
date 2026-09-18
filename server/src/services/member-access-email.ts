const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Table layout remains usable in email clients without web fonts or scripts. */
export function renderMemberAccessEmail(
  code: string,
  link: string,
  site: string,
  options: { pointsEnabled?: boolean } = {},
): string {
  const pointsEnabled = options.pointsEnabled !== false;
  const intro = pointsEnabled
    ? "Entrá a tu cuenta para ver tus eventos, sumar Xplora Points y descubrir recompensas. Sin contraseñas para recordar."
    : "Usá este acceso para crear tu cuenta o iniciar sesión y completar tu perfil. Sin contraseñas para recordar.";
  const welcome = pointsEnabled
    ? "Si es tu primera vez, al confirmar tu cuenta te damos <strong>20 Xplora Points</strong>. Tus puntos no vencen."
    : "El mismo acceso sirve si ya tenés cuenta o si es tu primera vez. Tu cuenta es gratuita.";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tu acceso a Xplora</title></head>
  <body style="margin:0;background:#faf8f5;color:#1a1028;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden">Tu acceso a la comunidad Xplora. Entrá sin contraseña.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:Arial,Helvetica,sans-serif">
  <tr><td style="background:#1a1028;border-radius:16px 16px 0 0;padding:30px 32px;color:#faf8f5">
    <a href="${escape(site)}" style="font-size:26px;font-weight:bold;color:#faf8f5;text-decoration:none">Xplora<span style="color:#c4b5ff">.</span></a>
    <h1 style="font-size:36px;line-height:1.15;font-weight:normal;letter-spacing:-1px;margin:38px 0 12px">Todo empieza<br>por encontrarnos.</h1>
    <p style="color:#ded5f7;font-size:16px;line-height:1.65;margin:0">Tu acceso a la comunidad está acá.</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px">
    <p style="font-size:16px;line-height:1.7;margin:0 0 24px">${intro}</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#603ef9" style="border-radius:10px"><a href="${escape(link)}" style="display:inline-block;color:#ffffff;padding:17px 26px;font-size:16px;text-decoration:none;font-weight:bold">Entrar a Xplora &rarr;</a></td></tr></table>
    <p style="font-size:14px;color:#685d74;margin:28px 0 12px;line-height:1.6">¿Abriste Xplora en otro dispositivo? Usá este código:</p>
    <p style="background:#f3efff;border-radius:10px;padding:20px 12px;margin:0;text-align:center;font-size:32px;letter-spacing:8px;font-weight:bold;color:#3e24aa">${escape(code)}</p>
    <p style="font-size:13px;line-height:1.6;color:#685d74;margin:18px 0 0">El enlace y el código vencen en <strong>10 minutos</strong>. Son de un solo uso. No los compartas.</p>
  </td></tr>
  <tr><td style="background:#eee8ff;border-radius:0 0 16px 16px;padding:24px 32px;font-size:14px;line-height:1.65;color:#3e286b">${welcome}</td></tr>
  <tr><td style="padding:24px 20px;text-align:center;font-size:12px;line-height:1.7;color:#685d74">Si no solicitaste este acceso, podés ignorar el correo.<br>Xplora · Comunidad emprendedora de UCEMA</td></tr>
  </table></td></tr></table></body></html>`;
}
