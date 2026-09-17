import type { AdminMemberRow, ContactListFilterSnapshot } from "../types";

export function parseOptionalPct(s: string): number | undefined {
  const t = s.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(100, Math.max(0, n));
}

export function normalizePctBounds(
  minStr: string,
  maxStr: string,
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

function effectivePct(row: AdminMemberRow): number | null {
  if (row.eventos_inscripto === 0) return null;
  return Math.round((1000 * row.eventos_asistio) / row.eventos_inscripto) / 10;
}

export function passesPctRange(
  row: AdminMemberRow,
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

export function passesCarrera(row: AdminMemberRow, carreraFilter: string): boolean {
  const c = (row.carrera || "").trim();
  if (carreraFilter === "__NONE__") return c === "";
  return c === carreraFilter;
}

function passesEsCema(row: AdminMemberRow, mode: ContactListFilterSnapshot["es_alumno_cema"] | undefined): boolean {
  if (mode === undefined || mode === "") return true;
  if (mode === "yes") return row.es_alumno_cema === true;
  return row.es_alumno_cema === false;
}

export function applyMemberFilters(
  rows: AdminMemberRow[],
  f: ContactListFilterSnapshot,
): AdminMemberRow[] {
  const q = (f.email_contains ?? "").trim().toLowerCase();
  const carrera = f.carrera ?? "";
  const pctBounds = normalizePctBounds(f.pct_min ?? "", f.pct_max ?? "");

  let list = rows;
  if (f.attendee_event_id) list = list.filter(r => r.inscripciones?.some(i => i.evento_id === f.attendee_event_id && i.asistio === true));
  if (q) list = list.filter((r) => (r.email || "").toLowerCase().includes(q));
  if (carrera) list = list.filter((r) => passesCarrera(r, carrera));
  list = list.filter((r) => passesPctRange(r, pctBounds.lo, pctBounds.hi));
  list = list.filter((r) => passesEsCema(r, f.es_alumno_cema));
  return list;
}

export function buildFilterSnapshot(
  emailQuery: string,
  carreraFilter: string,
  pctMin: string,
  pctMax: string,
  esAlumnoCema: "" | "yes" | "no",
  attendeeEventId = "",
): ContactListFilterSnapshot {
  return {
    attendee_event_id: attendeeEventId,
    email_contains: emailQuery.trim(),
    carrera: carreraFilter,
    pct_min: pctMin.trim(),
    pct_max: pctMax.trim(),
    es_alumno_cema: esAlumnoCema,
  };
}
