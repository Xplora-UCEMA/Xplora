import * as XLSX from 'xlsx';
import { BadRequestError } from '../http/errors/http-error.js';

export const EMAIL_HEADERS = ['email', 'e-mail', 'mail', 'correo', 'correo electrónico', 'dirección de correo electrónico', 'email address', 'mail address'];
export const normalizeColumn = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]/g, '');

export function columnIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const index = headers.findIndex(h => normalizeColumn(h) === normalizeColumn(alias));
    if (index >= 0) return index;
  }
  return -1;
}

export function personName(headers: string[], cells: string[]): string {
  const cell = (aliases: string[]) => cells[columnIndex(headers, aliases)]?.trim() ?? '';
  const full = cell(['nombre completo', 'nombre y apellido', 'nombre y apellidos', 'full name', 'name']);
  if (full) return full;
  return [cell(['nombre', 'nombres', 'first name', 'given name']), cell(['apellido', 'apellidos', 'last name', 'surname'])].filter(Boolean).join(' ');
}

export function booleanCell(value: string): boolean | null {
  const key = normalizeColumn(value);
  if (['1', 'true', 't', 'yes', 'y', 'si', 's', 'x'].includes(key)) return true;
  if (['0', 'false', 'f', 'no', 'n'].includes(key)) return false;
  return null;
}

/** Locate an email header after optional title rows, including workbooks with a cover sheet. */
export function readSpreadsheetTable(buffer: Buffer, filename?: string): {
  headers: string[]; rows: string[][]; firstDataRow: number; warnings: string[]; delimiter: string;
} {
  if (!buffer.length) throw new BadRequestError('El archivo está vacío.');
  const name = (filename ?? '').toLowerCase();
  const binary = /\.xlsx?$/.test(name) || buffer.subarray(0, 2).equals(Buffer.from('PK')) || buffer.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  let workbook: XLSX.WorkBook;
  let delimiter = ',';
  try {
    if (binary) workbook = XLSX.read(buffer, { type: 'buffer' });
    else {
      const utf16 = buffer[0] === 0xff && buffer[1] === 0xfe;
      let text = buffer.toString(utf16 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
      if (!utf16 && text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(buffer);
      const separator = text.match(/^sep=([;,\t])\r?\n/i);
      if (separator) { delimiter = separator[1]; text = text.slice(separator[0].length); }
      workbook = XLSX.read(text, { type: 'string', raw: true, ...(separator ? { FS: delimiter } : {}) });
    }
  } catch {
    throw new BadRequestError('No se pudo leer el archivo. Usá un CSV, XLSX o XLS válido, sin contraseña.');
  }
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
      .map(row => row.map(cell => String(cell ?? '').trim()));
    const headerRow = matrix.slice(0, 50).findIndex(row => columnIndex(row, EMAIL_HEADERS) >= 0);
    if (headerRow < 0) continue;
    return {
      headers: matrix[headerRow], rows: matrix.slice(headerRow + 1), firstDataRow: headerRow + 2, delimiter,
      warnings: workbook.SheetNames.length > 1 ? [`Se importó la hoja «${sheetName}». Las demás hojas no se importaron.`] : [],
    };
  }
  throw new BadRequestError('No encontré una columna de email. Usá «Email», «Correo electrónico» o «Dirección de correo electrónico» en los encabezados.');
}
