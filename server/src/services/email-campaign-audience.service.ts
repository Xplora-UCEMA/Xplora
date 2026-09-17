/**
 * Resolución de destinatarios para campañas (`audience` / lista / ids explícitos).
 * Misma lógica que `POST .../envios` para mantener comportamiento alineado.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { BadRequestError, ForbiddenError } from '../http/errors/http-error.js';
import { fetchAllMemberRows, type AdminMemberRowDTO } from './admin-member-rows.service.js';
import { getContactListById, listMembersForList } from './contact-lists.service.js';

export type CampaignRecipient = {
  usuario_id: string;
  email: string;
  nombre: string;
  carrera: string;
};

/** Devuelve los `usuario_id` elegidos por el cuerpo de la petición (sin filtrar por email). */
export async function resolveCampaignUsuarioIdsFromBody(
  sb: SupabaseClient,
  body: Record<string, unknown>,
  authUserId: string | null,
): Promise<string[]> {
  const rawListId = body.contact_list_id;
  const rawIds = body.usuario_ids;
  const rawAudience = body.audience;

  let usuario_ids: string[] = [];

  if (rawAudience === 'all') {
    const members = await fetchAllMemberRows(sb);
    usuario_ids = members.map(m => m.id).filter(Boolean);
    if (usuario_ids.length === 0) {
      throw new BadRequestError('No hay usuarios en la base para registrar envíos.');
    }
  } else if (typeof rawListId === 'string' && rawListId.trim()) {
    const listId = rawListId.trim();
    if (!authUserId) throw new ForbiddenError('No hay usuario autenticado.');
    const list = await getContactListById(sb, listId);
    if (!list) throw new BadRequestError('Lista no encontrada.');
    if ((list.created_by_auth_user_id ?? null) !== authUserId) {
      throw new ForbiddenError('Solo podés enviar a listas creadas por tu usuario.');
    }
    const members = await listMembersForList(sb, listId);
    usuario_ids = members
      .map(m => m.usuario_id)
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    if (usuario_ids.length === 0) {
      throw new BadRequestError('La lista elegida no tiene usuarios con id para registrar envíos.');
    }
  } else if (Array.isArray(rawIds)) {
    usuario_ids = rawIds
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map(s => s.trim());
    if (usuario_ids.length === 0) {
      throw new BadRequestError('usuario_ids no puede estar vacío.');
    }
  } else {
    throw new BadRequestError("Enviá JSON con audience:'all', contact_list_id o usuario_ids (array de UUIDs).");
  }

  return usuario_ids;
}

/** Mapa id → fila miembro (para resolver emails). */
export function mapUsuarioIdsToRecipientsWithEmail(
  usuarioIds: string[],
  members: AdminMemberRowDTO[],
): CampaignRecipient[] {
  const byId = new Map(members.map(m => [m.id, m]));
  const out: CampaignRecipient[] = [];
  const seen = new Set<string>();
  for (const uid of usuarioIds) {
    if (seen.has(uid)) continue;
    seen.add(uid);
    const row = byId.get(uid);
    const email = (row?.email ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) continue;
    out.push({
      usuario_id: uid,
      email,
      nombre: (row?.nombre ?? '').trim(),
      carrera: (row?.carrera ?? '').trim(),
    });
  }
  return out;
}
