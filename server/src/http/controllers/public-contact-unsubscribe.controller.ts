import type { RequestHandler, Response } from 'express';
import type { AppConfig } from '../../config/env.js';
import { createServiceSupabase } from '../../infra/supabase-clients.js';
import {
  deleteContactData,
  verifyUnsubscribeToken,
} from '../../services/contact-unsubscribe.service.js';
import { InternalError } from '../errors/http-error.js';
import { asyncHandler } from '../middleware/async-handler.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tokenFromRequest(req: { query: { token?: string | string[] } }): string {
  const raw = req.query.token;
  return (Array.isArray(raw) ? raw[0] : raw ?? '').trim();
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} · Xplora</title>
</head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f7f5ff;color:#161123;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;">
  <main style="width:min(100%,500px);box-sizing:border-box;background:#fff;border:1px solid #e9e4ff;border-radius:20px;padding:40px 32px;box-shadow:0 18px 50px rgba(49,27,104,.08);">
    <p style="margin:0 0 12px;color:#603ef9;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;">Xplora</p>
    ${body}
  </main>
</body>
</html>`;
}

function sendPage(res: Response, status: number, html: string): void {
  res
    .set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    })
    .status(status)
    .type('html')
    .send(html);
}

function invalidLinkPage(): string {
  return page(
    'Enlace no disponible',
    `<h1 style="margin:0 0 14px;font-size:28px;letter-spacing:-.04em;">Este enlace ya no está disponible.</h1>
     <p style="margin:0;color:#635d70;font-size:16px;line-height:1.6;">Pedí un correo nuevo o escribinos a Xplora si necesitás ayuda.</p>`,
  );
}

function confirmationPage(token: string): string {
  const action = `/api/public/unsubscribe?token=${encodeURIComponent(token)}`;
  return page(
    'Eliminar mis datos',
    `<h1 style="margin:0 0 14px;font-size:28px;letter-spacing:-.04em;">¿Querés eliminar tus datos de Xplora?</h1>
     <p style="margin:0 0 26px;color:#635d70;font-size:16px;line-height:1.6;">Vamos a quitar tu contacto, historial de eventos, listas y registros de campañas. Esta acción no se puede deshacer.</p>
     <form method="post" action="${escapeHtml(action)}">
       <button type="submit" style="width:100%;border:0;border-radius:10px;background:#603ef9;color:#fff;cursor:pointer;font:700 15px Arial,Helvetica,sans-serif;padding:15px 20px;">Confirmar eliminación</button>
     </form>
     <p style="margin:18px 0 0;color:#938ca0;font-size:13px;line-height:1.5;">Si abriste este enlace por error, simplemente cerrá esta página.</p>`,
  );
}

function successPage(alreadyDeleted: boolean): string {
  return page(
    'Datos eliminados',
    `<h1 style="margin:0 0 14px;font-size:28px;letter-spacing:-.04em;">${alreadyDeleted ? 'La baja ya estaba procesada.' : 'Tus datos fueron eliminados.'}</h1>
     <p style="margin:0;color:#635d70;font-size:16px;line-height:1.6;">${alreadyDeleted ? 'No queda ninguna acción pendiente para este contacto.' : 'No vas a recibir nuevos emails de Xplora con este contacto.'}</p>`,
  );
}

async function usuarioIdFromToken(config: AppConfig, token: string): Promise<string | null> {
  if (!token || !config.unsubscribeTokenSecret) return null;
  try {
    return await verifyUnsubscribeToken(config.unsubscribeTokenSecret, token);
  } catch {
    return null;
  }
}

/** GET público: muestra una confirmación para evitar bajas provocadas por scanners de correo. */
export function createPublicContactUnsubscribePageHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const token = tokenFromRequest(req);
    const usuarioId = await usuarioIdFromToken(config, token);
    if (!usuarioId) {
      sendPage(res, 400, invalidLinkPage());
      return;
    }
    sendPage(res, 200, confirmationPage(token));
  });
}

/** POST público: elimina el contacto y las filas dependientes del contacto confirmado por el enlace. */
export function createPublicContactUnsubscribeDeleteHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const token = tokenFromRequest(req);
    const usuarioId = await usuarioIdFromToken(config, token);
    if (!usuarioId) {
      sendPage(res, 400, invalidLinkPage());
      return;
    }
    const sb = createServiceSupabase(config);
    if (!sb) throw new InternalError('No está configurado el acceso seguro para procesar bajas de contactos.');
    const result = await deleteContactData(sb, usuarioId);
    sendPage(res, 200, successPage(result === 'already_deleted'));
  });
}
