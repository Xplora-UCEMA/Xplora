/**
 * POST multipart `csv` + evento id en URL: importa invitados desde CSV o Excel.
 * Crea usuarios faltantes, upsert `inscripciones_evento`, actualiza totales en `eventos`.
 */
import type { RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../../config/env.js';
import { createUserSupabase } from '../../infra/supabase-clients.js';
import { BadRequestError } from '../errors/http-error.js';
import { asyncHandler } from '../middleware/async-handler.js';
import {
  mergeGuestsByEmail,
  parseLumaCsvFile,
  type AttendanceMode,
  type ParsedLumaGuest,
} from '../../services/luma-csv-import.service.js';

const IMPORT_CHUNK_SIZE = 200;

type UsuarioMini = { id: string; email: string };
type InscripcionMini = {
  id: string;
  usuario_id: string;
  asistio: boolean;
  asistio_at: string | null;
  registered_at: string;
};

function defaultNombreFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'Usuario';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function chunks<T>(items: T[], size = IMPORT_CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function fetchUsuariosByEmail(
  sb: SupabaseClient,
  emails: string[],
): Promise<Map<string, UsuarioMini>> {
  const result = new Map<string, UsuarioMini>();
  for (const batch of chunks(emails)) {
    const { data, error } = await sb.from('usuarios').select('id, email').in('email', batch);
    if (error) throw new BadRequestError(error.message);
    for (const row of (data as UsuarioMini[] | null) ?? []) result.set(row.email.toLowerCase(), row);
  }
  return result;
}

async function createMissingUsuarios(
  sb: SupabaseClient,
  guests: ParsedLumaGuest[],
  usersByEmail: Map<string, UsuarioMini>,
): Promise<number> {
  const missing = guests.filter(guest => !usersByEmail.has(guest.email));
  for (const batch of chunks(missing)) {
    const { data, error } = await sb
      .from('usuarios')
      .insert(batch.map(guest => ({
        nombre: guest.nombre.trim() || defaultNombreFromEmail(guest.email),
        email: guest.email,
        es_alumno_cema: false,
        carrera: null,
        suscrito_newsletter: true,
      })))
      .select('id, email');
    if (error) throw new BadRequestError(error.message);
    for (const row of (data as UsuarioMini[] | null) ?? []) usersByEmail.set(row.email.toLowerCase(), row);
  }
  const unresolved = missing.find(guest => !usersByEmail.has(guest.email));
  if (unresolved) throw new BadRequestError(`No se pudo crear el usuario ${unresolved.email}.`);
  return missing.length;
}

async function fetchEventRegistrations(
  sb: SupabaseClient,
  eventoId: string,
): Promise<Map<string, InscripcionMini>> {
  const result = new Map<string, InscripcionMini>();
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('inscripciones_evento')
      .select('id, usuario_id, asistio, asistio_at, registered_at')
      .eq('evento_id', eventoId)
      .range(offset, offset + IMPORT_CHUNK_SIZE - 1);
    if (error) throw new BadRequestError(error.message);
    const batch = (data as InscripcionMini[] | null) ?? [];
    for (const row of batch) result.set(row.usuario_id, row);
    if (batch.length < IMPORT_CHUNK_SIZE) return result;
    offset += IMPORT_CHUNK_SIZE;
  }
}

async function syncEventRegistrations(
  sb: SupabaseClient,
  eventoId: string,
  guests: ParsedLumaGuest[],
  usersByEmail: Map<string, UsuarioMini>,
): Promise<void> {
  const previousByUser = await fetchEventRegistrations(sb, eventoId);
  const nowIso = new Date().toISOString();
  const missing: Record<string, unknown>[] = [];
  const markAttended: string[] = [];
  const restoreMissingAttendanceTimestamp: string[] = [];
  const clearAttendanceTimestamp: string[] = [];

  for (const guest of guests) {
    const user = usersByEmail.get(guest.email);
    if (!user) throw new BadRequestError(`No se encontró el usuario ${guest.email}.`);
    const previous = previousByUser.get(user.id);
    const attended = guest.kind === 'checked_in';
    if (!previous) {
      missing.push({
        usuario_id: user.id,
        evento_id: eventoId,
        registered_at: nowIso,
        asistio: attended,
        asistio_at: attended ? nowIso : null,
      });
    } else if (attended && !previous.asistio) {
      markAttended.push(user.id);
    } else if (attended && !previous.asistio_at) {
      restoreMissingAttendanceTimestamp.push(user.id);
    } else if (!attended && !previous.asistio && previous.asistio_at) {
      clearAttendanceTimestamp.push(user.id);
    }
  }

  for (const batch of chunks(missing)) {
    const { error } = await sb.from('inscripciones_evento').insert(batch);
    if (error) throw new BadRequestError(error.message);
  }
  for (const batch of chunks(markAttended)) {
    const { error } = await sb.from('inscripciones_evento')
      .update({ asistio: true, asistio_at: nowIso })
      .eq('evento_id', eventoId)
      .eq('asistio', false)
      .in('usuario_id', batch);
    if (error) throw new BadRequestError(error.message);
  }
  for (const batch of chunks(restoreMissingAttendanceTimestamp)) {
    const { error } = await sb.from('inscripciones_evento')
      .update({ asistio_at: nowIso })
      .eq('evento_id', eventoId)
      .in('usuario_id', batch);
    if (error) throw new BadRequestError(error.message);
  }
  for (const batch of chunks(clearAttendanceTimestamp)) {
    const { error } = await sb.from('inscripciones_evento')
      .update({ asistio_at: null })
      .eq('evento_id', eventoId)
      .eq('asistio', false)
      .in('usuario_id', batch);
    if (error) throw new BadRequestError(error.message);
  }
}


export function createAdminLumaCsvImportHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const rawId = req.params.eventoId;
    const eventoId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!eventoId) throw new BadRequestError('Falta evento id.');

    const file = req.file;
    if (!file?.buffer?.length) {
      throw new BadRequestError('Subí un archivo CSV, XLSX o XLS.');
    }

    const sb = createUserSupabase(config, req.headers.authorization);

    const { data: evento, error: evErr } = await sb
      .from('eventos')
      .select('id')
      .eq('id', eventoId)
      .maybeSingle();
    if (evErr) throw new BadRequestError(evErr.message);
    if (!evento) throw new BadRequestError('No existe ese evento.');

    const attendanceMode = req.body?.attendance_mode ?? 'auto';
    if (!['auto', 'attended', 'registered'].includes(attendanceMode)) throw new BadRequestError('Modo de asistencia inválido.');
    const parsed = parseLumaCsvFile(file.buffer, { filename: file.originalname, attendanceMode: attendanceMode as AttendanceMode });
    if (parsed.guests.length === 0) {
      throw new BadRequestError(`No hay participantes válidos para importar. ${parsed.warnings[0] ?? 'Revisá los emails y las filas del archivo.'}`);
    }

    const merged = mergeGuestsByEmail(parsed.guests);
    const guests = [...merged.values()];
    const usersByEmail = await fetchUsuariosByEmail(sb, guests.map(guest => guest.email));
    const nuevos = await createMissingUsuarios(sb, guests, usersByEmail);
    const existentes = guests.length - nuevos;
    await syncEventRegistrations(sb, eventoId, guests, usersByEmail);

    // A new file may contain only part of the event; keep totals based on all saved registrations.
    const [registered, attended] = await Promise.all([
      sb.from('inscripciones_evento').select('id', { count: 'exact', head: true }).eq('evento_id', eventoId),
      sb.from('inscripciones_evento').select('id', { count: 'exact', head: true }).eq('evento_id', eventoId).eq('asistio', true),
    ]);
    if (registered.error || attended.error) throw new BadRequestError((registered.error ?? attended.error)!.message);
    const totalInscriptos = registered.count ?? 0;
    const totalAsistieron = attended.count ?? 0;

    const importedAt = new Date().toISOString();
    const { error: upEvErr } = await sb
      .from('eventos')
      .update({
        total_inscriptos: totalInscriptos,
        total_asistieron: totalAsistieron,
        luma_csv_imported_at: importedAt,
      })
      .eq('id', eventoId);
    if (upEvErr) throw new BadRequestError(upEvErr.message);

    res.status(200).json({
      ok: true,
      filas_leidas: parsed.guests.length,
      emails_procesados: merged.size,
      usuarios_nuevos: nuevos,
      usuarios_existentes: existentes,
      inscripciones_actualizadas: merged.size,
      asistieron_marcados: [...merged.values()].filter(r => r.kind === 'checked_in').length,
      total_inscriptos_evento: totalInscriptos,
      total_asistieron_evento: totalAsistieron,
      warnings: parsed.warnings,
    });
  });
}
