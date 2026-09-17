/**
 * Misma lógica que el panel «Ver miembros» / listas de contacto: filtrar filas de miembros.
 */
import type { AdminMemberRowDTO } from './admin-member-rows.service.js';

export type MemberFilterSnapshot = {
  attendee_event_id?: string;
  email_contains?: string;
  carrera?: string;
  pct_min?: string;
  pct_max?: string;
  es_alumno_cema?: '' | 'yes' | 'no';
};

function parseOptionalPct(s: string | undefined): number | undefined {
  if (s == null) return undefined;
  const t = s.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(100, Math.max(0, n));
}

function effectivePct(row: AdminMemberRowDTO): number | null {
  if (row.eventos_inscripto === 0) return null;
  return Math.round((1000 * row.eventos_asistio) / row.eventos_inscripto) / 10;
}

function normalizePctBounds(
  minStr: string | undefined,
  maxStr: string | undefined,
): { lo: number | null; hi: number | null } {
  let lo = parseOptionalPct(minStr);
  let hi = parseOptionalPct(maxStr);
  if (lo !== undefined && hi !== undefined && lo > hi) {
    const t = lo;
    lo = hi;
    hi = t;
  }
  return {
    lo: lo ?? null,
    hi: hi ?? null,
  };
}

function passesPctRange(
  row: AdminMemberRowDTO,
  lo: number | null,
  hi: number | null,
): boolean {
  if (lo == null && hi == null) return true;
  const v = effectivePct(row);
  if (v === null) return false;
  if (lo != null && v < lo) return false;
  if (hi != null && v > hi) return false;
  return true;
}

function passesCarrera(row: AdminMemberRowDTO, carreraFilter: string): boolean {
  const c = (row.carrera || '').trim();
  if (carreraFilter === '__NONE__') return c === '';
  return c === carreraFilter;
}

function passesEsCema(
  row: AdminMemberRowDTO,
  mode: '' | 'yes' | 'no' | undefined,
): boolean {
  if (mode === undefined || mode === '') return true;
  if (mode === 'yes') return row.es_alumno_cema === true;
  return row.es_alumno_cema === false;
}

/** Aplica filtros como en el panel Database (email, carrera, %, alumno UCEMA). */
export function applyMemberFilterSnapshot(
  rows: AdminMemberRowDTO[],
  f: MemberFilterSnapshot | null | undefined,
): AdminMemberRowDTO[] {
  if (!f || typeof f !== 'object') return rows;
  const q = typeof f.email_contains === 'string' ? f.email_contains.trim().toLowerCase() : '';
  const carrera = typeof f.carrera === 'string' ? f.carrera : '';
  const pctBounds = normalizePctBounds(f.pct_min, f.pct_max);
  const esMode = f.es_alumno_cema;

  let list = rows;
  if (f.attendee_event_id) list = list.filter(r => r.inscripciones.some(i => i.evento_id === f.attendee_event_id && i.asistio === true));
  if (q) list = list.filter(r => (r.email || '').toLowerCase().includes(q));
  if (carrera) list = list.filter(r => passesCarrera(r, carrera));
  list = list.filter(r => passesPctRange(r, pctBounds.lo, pctBounds.hi));
  list = list.filter(r => passesEsCema(r, esMode));
  return list;
}
