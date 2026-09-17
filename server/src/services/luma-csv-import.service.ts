/** Import event registrations from Luma or ordinary CSV / Excel spreadsheets. */
import { booleanCell, columnIndex, EMAIL_HEADERS, normalizeColumn, personName, readSpreadsheetTable } from './spreadsheet-table.service.js';

export type LumaRowKind = 'checked_in' | 'going' | 'other';
export type AttendanceMode = 'auto' | 'attended' | 'registered';
export interface ParsedLumaGuest { email: string; nombre: string; kind: LumaRowKind }
export interface ParseLumaCsvResult { guests: ParsedLumaGuest[]; warnings: string[]; delimiter: string }

export function classifyLumaStatus(raw: string): LumaRowKind {
  const value = normalizeColumn(raw);
  if (!value || /^(noasist|noingres|notattend|notchecked|noshow|ausente|absent|cancel|declin|rechaz)/.test(value)) return 'other';
  if (['registrado', 'checkedin', 'checkin', 'attended', 'asistio', 'ingreso', 'admitted', 'presente', 'acreditado'].includes(value)) return 'checked_in';
  if (['asistire', 'going', 'approved', 'confirmado', 'confirmada', 'invited', 'yes', 'si', 'registered', 'inscripto', 'inscrito'].includes(value)) return 'going';
  return 'other';
}

export function mergeGuestsByEmail(rows: ParsedLumaGuest[]): Map<string, ParsedLumaGuest> {
  const map = new Map<string, ParsedLumaGuest>();
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    const previous = map.get(email);
    const kinds = [previous?.kind, row.kind];
    map.set(email, {
      email, nombre: previous?.nombre.trim() || row.nombre,
      kind: kinds.includes('checked_in') ? 'checked_in' : kinds.includes('going') ? 'going' : 'other',
    });
  }
  return map;
}

export function parseLumaCsvFile(buffer: Buffer, options: { filename?: string; attendanceMode?: AttendanceMode } = {}): ParseLumaCsvResult {
  const { headers, rows, firstDataRow, warnings, delimiter } = readSpreadsheetTable(buffer, options.filename);
  const emailIdx = columnIndex(headers, EMAIL_HEADERS);
  const attendanceIdx = columnIndex(headers, ['asistio', 'asistencia', 'asistió al evento', 'asistente', 'presente', 'acreditado', 'acreditación', 'attended', 'checked in']);
  const checkedAtIdx = columnIndex(headers, ['checked in at', 'checkedinat', 'fecha de acreditación', 'fecha de ingreso']);
  const approvalIdx = columnIndex(headers, ['approval status']);
  const statusIdx = columnIndex(headers, ['status', 'estado', 'ticket status', 'registration status', 'estado del ticket', 'ticket']);
  const guests: ParsedLumaGuest[] = [];
  const mode = options.attendanceMode ?? 'auto';
  for (const [index, cells] of rows.entries()) {
    if (cells.every(cell => !cell)) continue;
    const email = (cells[emailIdx] ?? '').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warnings.push(`Fila ${firstDataRow + index}: email inválido; fila omitida.`);
      continue;
    }
    const approval = normalizeColumn(cells[approvalIdx] ?? '');
    const status = cells[statusIdx] ?? '';
    if (/declin|cancel|rechaz/.test(approval) || /^(declin|cancel|rechaz)/.test(normalizeColumn(status))) continue;
    const attendance = cells[attendanceIdx] ?? '';
    const checkedAt = cells[checkedAtIdx] ?? '';
    let kind: LumaRowKind = 'going';
    if (mode === 'attended') kind = 'checked_in';
    else if (mode === 'auto') {
      if (checkedAt && booleanCell(checkedAt) !== false) kind = 'checked_in';
      else if (attendance) kind = booleanCell(attendance) === true || classifyLumaStatus(attendance) === 'checked_in' ? 'checked_in' : 'going';
      else if (status) kind = classifyLumaStatus(status);
    }
    guests.push({ email, nombre: personName(headers, cells), kind });
  }
  if (mode === 'auto' && attendanceIdx < 0 && checkedAtIdx < 0 && statusIdx < 0) {
    warnings.push('No hay columna de asistencia: se importaron como inscriptos, sin marcar asistencia. Si esta es una lista de asistentes, elegí «Todos asistieron» antes de importar.');
  }
  return { guests, warnings, delimiter };
}
