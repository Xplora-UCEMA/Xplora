/**
 * Lectura y borrado de **miembros** (`usuarios`) para el panel Database.
 * Lista con % y conteos derivados de `inscripciones_evento` + detalle por evento.
 */
import type { RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import { fetchAllMemberRows } from '../../services/admin-member-rows.service.js';
import { createServiceSupabase, createUserSupabase } from '../../infra/supabase-clients.js';
import { deleteContactData } from '../../services/contact-unsubscribe.service.js';
import { BadRequestError, InternalError } from '../errors/http-error.js';
import { asyncHandler } from '../middleware/async-handler.js';

export function createAdminMembersListHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const sb = createUserSupabase(config, req.headers.authorization);
    const rows = await fetchAllMemberRows(sb);
    res.json(rows);
  });
}

export function createAdminMemberDeleteHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) throw new BadRequestError('Falta id.');
    const sb = createServiceSupabase(config);
    if (!sb) throw new InternalError('La baja requiere acceso de servidor.');
    await deleteContactData(sb, String(id));
    res.status(204).send();
  });
}
