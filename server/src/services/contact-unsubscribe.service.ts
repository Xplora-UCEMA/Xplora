import { SignJWT, jwtVerify } from 'jose';
import type { SupabaseClient } from '@supabase/supabase-js';

const TOKEN_AUDIENCE = 'xplora-contact-unsubscribe';
const TOKEN_TTL = '180d';
const UNSUBSCRIBE_URL_MARKER = '{{UNSUBSCRIBE_URL}}';

function signingKey(secret: string): Uint8Array {
  if (secret.trim().length < 16) {
    throw new Error('El secreto para bajas de contactos no está configurado correctamente.');
  }
  return new TextEncoder().encode(secret);
}

/** Token firmado, temporal y limitado a borrar un único contacto. */
export async function createUnsubscribeToken(secret: string, usuarioId: string): Promise<string> {
  return new SignJWT({ purpose: 'delete-contact' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuarioId)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(signingKey(secret));
}

/** Devuelve el id del contacto únicamente si el enlace fue emitido por Xplora y sigue vigente. */
export async function verifyUnsubscribeToken(secret: string, token: string): Promise<string> {
  const { payload } = await jwtVerify(token, signingKey(secret), { audience: TOKEN_AUDIENCE });
  if (payload.purpose !== 'delete-contact' || !payload.sub) {
    throw new Error('El enlace para eliminar datos no es válido.');
  }
  return payload.sub;
}

export function createUnsubscribeUrl(siteUrl: string, token: string): string {
  const url = new URL('/api/public/unsubscribe', siteUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Inserta la URL individual de baja en el HTML que se envía a cada destinatario. */
export function injectUnsubscribeUrl(html: string, unsubscribeUrl: string): string {
  const url = escapeHtmlAttribute(unsubscribeUrl);
  if (html.includes(UNSUBSCRIBE_URL_MARKER)) {
    return html.replaceAll(UNSUBSCRIBE_URL_MARKER, url);
  }

  const footer = `<p style="margin:24px 0 0;text-align:center;font:11px Arial,sans-serif;color:#777777;">¿No querés recibir más emails? <a href="${url}" style="color:#603ef9;">Desuscribite acá</a></p>`;
  return html.includes('</body>') ? html.replace('</body>', `${footer}</body>`) : `${html}${footer}`;
}

export async function personalizeCampaignHtml(
  html: string,
  params: { siteUrl: string; tokenSecret: string; usuarioId: string },
): Promise<string> {
  const token = await createUnsubscribeToken(params.tokenSecret, params.usuarioId);
  return injectUnsubscribeUrl(html, createUnsubscribeUrl(params.siteUrl, token));
}

type ContactRow = { id: string; email: string | null };

function missingOptionalTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { code?: unknown; message?: unknown };
  return row.code === 'PGRST205' || /could not find the table|relation .* does not exist/i.test(String(row.message ?? ''));
}

async function deleteRows(
  sb: SupabaseClient,
  table: string,
  column: string,
  value: string,
  optional = false,
): Promise<void> {
  const { error } = await sb.from(table).delete().eq(column, value);
  if (error && !(optional && missingOptionalTable(error))) throw new Error(error.message);
}

/**
 * Borra el contacto y el historial que lo referencia. Es idempotente para que un enlace
 * ya usado responda sin error y no deje datos de campaña, listas o eventos asociados.
 */
export async function deleteContactData(
  sb: SupabaseClient,
  usuarioId: string,
): Promise<'deleted' | 'already_deleted'> {
  const { data, error } = await sb
    .from('usuarios')
    .select('id, email')
    .eq('id', usuarioId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const user = data as ContactRow | null;
  if (!user) return 'already_deleted';

  await deleteRows(sb, 'contact_list_members', 'usuario_id', usuarioId);
  await deleteRows(sb, 'campanias_envios', 'usuario_id', usuarioId);
  await deleteRows(sb, 'inscripciones_evento', 'usuario_id', usuarioId);

  const email = user.email?.trim().toLowerCase();
  if (email) {
    await deleteRows(sb, 'member_auth_challenges', 'email', email, true);
  }
  await deleteRows(sb, 'member_accounts', 'usuario_id', usuarioId, true);
  if (email) {
    await deleteRows(sb, 'member_accounts', 'email', email, true);
  }
  await deleteRows(sb, 'usuarios', 'id', usuarioId);
  return 'deleted';
}
