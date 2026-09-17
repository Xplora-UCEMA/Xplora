/** Import ordinary CSV / XLSX / XLS contacts, normalized by email. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { BadRequestError } from '../http/errors/http-error.js';
import { booleanCell, columnIndex, EMAIL_HEADERS, personName, readSpreadsheetTable } from './spreadsheet-table.service.js';

type ParsedUsuarioCsvRow = {
  email: string;
  nombre?: string;
  carrera?: string;
  es_alumno_cema?: boolean | null;
  suscrito_newsletter?: boolean | null;
};
const normalizeEmail = (raw: string) => raw.trim().toLowerCase();
const normalizeNombre = (raw?: string) => raw?.trim() || null;
const normalizeCarrera = normalizeNombre;

export function parseUsuariosFileBuffer(buf: Buffer, opts?: { filename?: string }): { rows: ParsedUsuarioCsvRow[]; warnings: string[] } {
  const table = readSpreadsheetTable(buf, opts?.filename);
  const rows: ParsedUsuarioCsvRow[] = [];
  const seen = new Set<string>();
  const emailIdx = columnIndex(table.headers, EMAIL_HEADERS);
  for (const [index, cells] of table.rows.entries()) {
    if (cells.every(cell => !cell)) continue;
    const email = normalizeEmail(cells[emailIdx] ?? '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      table.warnings.push(`Fila ${table.firstDataRow + index}: email inválido; fila omitida.`);
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    const cell = (aliases: string[]) => cells[columnIndex(table.headers, aliases)] ?? '';
    rows.push({
      email, nombre: personName(table.headers, cells),
      carrera: cell(['carrera', 'career']),
      es_alumno_cema: booleanCell(cell(['es alumno cema', 'alumno ucema', 'ucema'])),
      suscrito_newsletter: booleanCell(cell(['suscrito newsletter', 'newsletter'])),
    });
  }
  return { rows, warnings: table.warnings };
}

export const parseUsuariosCsvBuffer = (buf: Buffer) => parseUsuariosFileBuffer(buf, { filename: 'usuarios.csv' });
export const parseUsuariosXlsxBuffer = (buf: Buffer) => parseUsuariosFileBuffer(buf, { filename: 'usuarios.xlsx' });
const UPSERT_CHUNK = 400;
const EXISTING_LOOKUP_CHUNK = 200;

async function fetchExistingUsers(sb: SupabaseClient, emails: string[]): Promise<Map<string, ParsedUsuarioCsvRow>> {
  const existing = new Map<string, ParsedUsuarioCsvRow>();
  for (let i = 0; i < emails.length; i += EXISTING_LOOKUP_CHUNK) {
    const chunk = emails.slice(i, i + EXISTING_LOOKUP_CHUNK);
    const { data, error } = await sb.from('usuarios').select('email, nombre, carrera, es_alumno_cema, suscrito_newsletter').in('email', chunk);
    if (error) throw new BadRequestError(error.message);
    for (const row of (data as ParsedUsuarioCsvRow[] | null) ?? []) {
      existing.set(normalizeEmail(row.email ?? ''), row);
    }
  }
  return existing;
}

function buildUsuarioUpsertRow(r: ParsedUsuarioCsvRow, previous?: ParsedUsuarioCsvRow): Record<string, unknown> {
  return {
    email: normalizeEmail(r.email),
    nombre: normalizeNombre(r.nombre) ?? normalizeNombre(previous?.nombre) ?? r.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    carrera: normalizeCarrera(r.carrera) ?? normalizeCarrera(previous?.carrera),
    es_alumno_cema: r.es_alumno_cema ?? previous?.es_alumno_cema ?? false,
    suscrito_newsletter: r.suscrito_newsletter ?? previous?.suscrito_newsletter ?? true,
  };
}

export async function upsertUsuariosFromCsv(
  sb: SupabaseClient,
  rows: ParsedUsuarioCsvRow[],
): Promise<{ upserted: number; inserted: number; updated: number }> {
  if (rows.length === 0) return { upserted: 0, inserted: 0, updated: 0 };

  const emails = rows.map(r => r.email);
  const existing = await fetchExistingUsers(sb, emails);
  const payload = rows.map(row => buildUsuarioUpsertRow(row, existing.get(row.email)));

  for (let i = 0; i < payload.length; i += UPSERT_CHUNK) {
    const chunk = payload.slice(i, i + UPSERT_CHUNK);
    const { error } = await sb.from('usuarios').upsert(chunk, { onConflict: 'email' });
    if (error) throw new BadRequestError(error.message);
  }

  const inserted = rows.filter(r => !existing.has(r.email)).length;
  const updated = rows.length - inserted;
  return { upserted: rows.length, inserted, updated };
}

