import type { SupabaseClient } from '@supabase/supabase-js';
import { InternalError } from '../http/errors/http-error.js';

export type MemberStudy = {
  institution: string;
  degree: string;
  year?: string;
};

export type MemberJob = {
  company: string;
  role: string;
  from?: string;
  to?: string;
  current?: boolean;
  description?: string;
};

export type MemberLanguage = {
  name: string;
  level: string;
};

export type MemberAccountRow = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  usuario_id: string | null;
  display_name: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  avatar_url: string | null;
  studies: MemberStudy[] | unknown;
  jobs: MemberJob[] | unknown;
  languages: MemberLanguage[] | unknown;
  skills: string[] | null;
  cv_url: string | null;
  created_at: string;
  updated_at: string;
};

export type MemberPublicProfile = {
  id: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  phone: string;
  avatarUrl: string;
  studies: MemberStudy[];
  jobs: MemberJob[];
  languages: MemberLanguage[];
  skills: string[];
  cvUrl: string;
  emailConfirmed: boolean;
  createdAt: string;
};

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function toPublicProfile(row: MemberAccountRow): MemberPublicProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name?.trim() || '',
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    phone: row.phone?.trim() || '',
    avatarUrl: row.avatar_url?.trim() || '',
    studies: asArray<MemberStudy>(row.studies),
    jobs: asArray<MemberJob>(row.jobs),
    languages: asArray<MemberLanguage>(row.languages),
    skills: Array.isArray(row.skills) ? row.skills : [],
    cvUrl: row.cv_url?.trim() || '',
    emailConfirmed: Boolean(row.email_confirmed_at),
    createdAt: row.created_at,
  };
}

export async function findMemberByEmail(
  sb: SupabaseClient,
  email: string,
): Promise<MemberAccountRow | null> {
  const { data, error } = await sb
    .from('member_accounts')
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) {
    if (error.code === 'PGRST205' || /Could not find the table/i.test(error.message)) {
      throw new InternalError(
        'Faltan tablas de miembros en Supabase. Ejecutá supabase-setup-member-accounts.sql en el SQL Editor.',
      );
    }
    throw error;
  }
  return (data as MemberAccountRow | null) ?? null;
}

export async function findMemberById(
  sb: SupabaseClient,
  id: string,
): Promise<MemberAccountRow | null> {
  const { data, error } = await sb.from('member_accounts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as MemberAccountRow | null) ?? null;
}

/** Escapa comodines de ILIKE (%, _) para match exacto case-insensitive. */
function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Busca en `usuarios` por email sin importar mayúsculas/espacios. */
export async function findUsuarioByEmail(
  sb: SupabaseClient,
  email: string,
): Promise<{ id: string; email: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data: exact } = await sb
    .from('usuarios')
    .select('id, email')
    .eq('email', normalized)
    .maybeSingle();
  if (exact?.id) return { id: exact.id as string, email: String(exact.email) };

  const { data: fuzzy, error } = await sb
    .from('usuarios')
    .select('id, email')
    .ilike('email', escapeIlikeExact(normalized))
    .limit(20);
  if (error || !fuzzy?.length) return null;

  const match =
    fuzzy.find((r) => String(r.email ?? '').trim().toLowerCase() === normalized) ?? fuzzy[0];
  if (!match?.id) return null;
  return { id: match.id as string, email: String(match.email ?? normalized) };
}

/**
 * Vincula la cuenta miembro con el `usuarios` del mismo email (historial de eventos).
 * Sólo vincula contactos existentes: no crea ni modifica filas del CRM.
 */
export async function linkExistingUsuario(
  sb: SupabaseClient,
  account: Pick<MemberAccountRow, 'id' | 'email' | 'usuario_id'>,
): Promise<string | null> {
  const existing = await findUsuarioByEmail(sb, account.email);
  if (!existing) return null;
  if (account.usuario_id !== existing.id) {
    const { data, error } = await sb.from('member_accounts')
      .update({ usuario_id: existing.id, updated_at: new Date().toISOString() })
      .eq('id', account.id).select('id').single();
    if (error || !data) throw new InternalError('No pudimos vincular tu historial. Contactá a Xplora.');
  }
  return existing.id;
}

/** Legacy registration integration. New passwordless access never creates CRM contacts. */
export async function linkOrCreateUsuario(
  sb: SupabaseClient,
  account: MemberAccountRow,
): Promise<string | null> {
  const email = account.email.trim().toLowerCase();
  const persistLink = async (usuarioId: string): Promise<void> => {
    const { data, error } = await sb.from('member_accounts')
      .update({ usuario_id: usuarioId, updated_at: new Date().toISOString() })
      .eq('id', account.id).select('id').single();
    if (error || !data) throw new InternalError('No pudimos vincular tu historial. Contactá a Xplora.');
  };
  const existing = await findUsuarioByEmail(sb, email);

  if (existing?.id) {
    if (account.usuario_id !== existing.id) {
      await persistLink(existing.id);
    }
    // Normaliza email en usuarios para futuros matches exactos
    if (String(existing.email).trim().toLowerCase() !== email) {
      await sb.from('usuarios').update({ email }).eq('id', existing.id);
    }
    return existing.id;
  }

  const nombre = account.display_name?.trim() || email.split('@')[0] || 'Miembro';
  const { data: created, error } = await sb
    .from('usuarios')
    .insert({
      email,
      nombre,
      suscrito_newsletter: false,
    })
    .select('id')
    .single();
  if (error || !created?.id) {
    // Carrera: otro proceso creó el usuario entre el select y el insert
    const again = await findUsuarioByEmail(sb, email);
    if (again?.id) {
      await persistLink(again.id);
      return again.id;
    }
    console.warn('[member] linkOrCreateUsuario insert failed:', error?.message);
    return null;
  }

  await persistLink(created.id);
  return created.id as string;
}

export type MemberEventHistoryItem = {
  id: string;
  eventoId: string;
  title: string;
  dateDisplay: string;
  day: string;
  month: string;
  location: string;
  modality: string;
  tagLabel: string;
  summary: string;
  thumbnailUrl: string;
  registeredAt: string | null;
  asistio: boolean;
};

export async function fetchMemberEventHistory(
  sb: SupabaseClient,
  usuarioId: string | null,
): Promise<MemberEventHistoryItem[]> {
  if (!usuarioId) return [];
  const { data: insc, error } = await sb
    .from('inscripciones_evento')
    .select('id, evento_id, registered_at, asistio')
    .eq('usuario_id', usuarioId)
    .order('registered_at', { ascending: false });
  if (error || !insc?.length) return [];

  const eventoIds = [...new Set(insc.map((r) => r.evento_id as string).filter(Boolean))];
  const { data: eventos } = await sb
    .from('eventos')
    .select(
      'id, title, date_display, day, month, location, modality, tag_label, summary, thumbnail_url, home_poster_url',
    )
    .in('id', eventoIds);
  const byId = new Map((eventos ?? []).map((e) => [e.id as string, e]));

  return insc.map((r) => {
    const ev = byId.get(r.evento_id as string) as
      | {
          title?: string;
          date_display?: string;
          day?: string;
          month?: string;
          location?: string;
          modality?: string;
          tag_label?: string;
          summary?: string;
          thumbnail_url?: string;
          home_poster_url?: string;
        }
      | undefined;
    return {
      id: r.id as string,
      eventoId: r.evento_id as string,
      title: ev?.title || 'Evento',
      dateDisplay: ev?.date_display || '',
      day: ev?.day || '',
      month: ev?.month || '',
      location: ev?.location || '',
      modality: ev?.modality || '',
      tagLabel: ev?.tag_label || '',
      summary: ev?.summary || '',
      thumbnailUrl: ev?.thumbnail_url || ev?.home_poster_url || '',
      registeredAt: (r.registered_at as string | null) ?? null,
      asistio: Boolean(r.asistio),
    };
  });
}
