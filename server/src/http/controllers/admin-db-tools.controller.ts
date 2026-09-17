/**
 * Herramientas de DB para el panel: export CSV/JSON, import CSV (usuarios) y SQL select (read-only).
 */
import type { RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { BadRequestError, InternalError } from '../errors/http-error.js';
import { createServiceSupabase, createUserSupabase } from '../../infra/supabase-clients.js';
import { fetchAllMemberRows } from '../../services/admin-member-rows.service.js';
import { parseUsuariosFileBuffer, upsertUsuariosFromCsv } from '../../services/usuarios-csv-import.service.js';

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (x: unknown) => {
    const s = x == null ? '' : String(x);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.join(',');
  const lines = rows.map(r => columns.map(c => esc(r[c])).join(','));
  // BOM + CRLF (Excel-friendly)
  return `\ufeff${header}\r\n${lines.join('\r\n')}\r\n`;
}

/** GET /api/admin/db/export/usuarios?format=csv|json */
export function createAdminDbExportUsuariosHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const format = asString(req.query.format).toLowerCase() || 'csv';
    const sb = createUserSupabase(config, req.headers.authorization);
    const rows = await fetchAllMemberRows(sb);

    if (format === 'json') {
      res.json({ rows });
      return;
    }
    if (format !== 'csv') {
      throw new BadRequestError('format inválido (usa csv o json).');
    }

    const csv = toCsv(rows as unknown as Record<string, unknown>[], [
      'id',
      'nombre',
      'email',
      'carrera',
      'es_alumno_cema',
      'created_at',
      'updated_at',
      'eventos_inscripto',
      'eventos_asistio',
      'pct_asistencia',
      'usuario_eventos_anotado',
      'usuario_eventos_asistio',
    ]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="xplora_usuarios_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.status(200).send(csv);
  });
}

/** POST /api/admin/db/import/usuarios-csv (multipart field "csv") */
export function createAdminDbImportUsuariosCsvHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file?.buffer?.length) {
      throw new BadRequestError('Subí un archivo CSV, XLSX o XLS.');
    }

    const svc = createServiceSupabase(config);
    if (!svc) {
      throw new InternalError('Falta SUPABASE_SERVICE_ROLE_KEY para importar CSV.');
    }

    const parsed = parseUsuariosFileBuffer(file.buffer, { filename: file.originalname });
    const result = await upsertUsuariosFromCsv(svc, parsed.rows);
    res.status(200).json({
      ok: true,
      filas_leidas: parsed.rows.length,
      warnings: parsed.warnings,
      ...result,
    });
  });
}

/** POST /api/admin/db/sql/select { sql: string } */
export function createAdminDbSqlSelectHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const sql = (req.body as Record<string, unknown>)?.sql;
    if (typeof sql !== 'string' || !sql.trim()) {
      throw new BadRequestError('Enviá JSON con { "sql": "SELECT ..." }.');
    }
    const svc = createServiceSupabase(config);
    if (!svc) {
      throw new InternalError('Falta SUPABASE_SERVICE_ROLE_KEY para ejecutar SQL.');
    }
    const { data, error } = await svc.rpc('crm_sql_select', {
      query: sql.trim(),
      max_rows: 300,
    });
    if (error) throw new BadRequestError(error.message);
    res.json({ rows: (data as unknown) ?? null });
  });
}

