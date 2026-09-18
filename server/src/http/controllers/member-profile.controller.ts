import type { RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import { createServiceSupabase } from '../../infra/supabase-clients.js';
import {
  fetchMemberEventHistory,
  findMemberById,
  linkExistingUsuario,
  toPublicProfile,
  type MemberJob,
  type MemberLanguage,
  type MemberStudy,
} from '../../services/member-accounts.service.js';
import { uploadCvBufferToCloudinary } from '../../services/cv-storage.service.js';
import { CloudinaryImageStorageService } from '../../services/cloudinary-image-storage.service.js';
import { BadRequestError, InternalError, UnauthorizedError } from '../errors/http-error.js';
import { asyncHandler } from '../middleware/async-handler.js';

const MAX = 240;

function cleanStr(v: unknown, max = MAX): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function parseStudies(v: unknown): MemberStudy[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      const o = item as Record<string, unknown>;
      return {
        institution: cleanStr(o.institution),
        degree: cleanStr(o.degree),
        year: cleanStr(o.year, 32) || undefined,
      };
    })
    .filter((s) => s.institution || s.degree)
    .slice(0, 20);
}

function parseJobs(v: unknown): MemberJob[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      const o = item as Record<string, unknown>;
      return {
        company: cleanStr(o.company),
        role: cleanStr(o.role),
        from: cleanStr(o.from, 32) || undefined,
        to: cleanStr(o.to, 32) || undefined,
        current: Boolean(o.current),
        description: cleanStr(o.description, 800) || undefined,
      };
    })
    .filter((j) => j.company || j.role)
    .slice(0, 30);
}

function parseLanguages(v: unknown): MemberLanguage[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      const o = item as Record<string, unknown>;
      return {
        name: cleanStr(o.name, 80),
        level: cleanStr(o.level, 80),
      };
    })
    .filter((l) => l.name)
    .slice(0, 20);
}

function parseSkills(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s) => cleanStr(s, 64))
    .filter(Boolean)
    .slice(0, 40);
}

/** GET /api/member/me */
export function createMemberMeHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const auth = req.memberAuth;
    if (!auth) throw new UnauthorizedError('Iniciá sesión.');
    const sb = createServiceSupabase(config);
    if (!sb) throw new InternalError('Base de datos no configurada.');

    let account = await findMemberById(sb, auth.accountId);
    if (!account) throw new UnauthorizedError('Cuenta no encontrada.');

    // Cruza con `usuarios` / inscripciones por email (historial de eventos previos)
    const usuarioId = await linkExistingUsuario(sb, account);
    if (usuarioId && account.usuario_id !== usuarioId) {
      account = (await findMemberById(sb, auth.accountId)) ?? account;
    }

    const events = await fetchMemberEventHistory(sb, usuarioId ?? account.usuario_id);
    res.json({ account: toPublicProfile(account), events });
  });
}

/** PATCH /api/member/me */
export function createMemberPatchMeHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const auth = req.memberAuth;
    if (!auth) throw new UnauthorizedError('Iniciá sesión.');
    const sb = createServiceSupabase(config);
    if (!sb) throw new InternalError('Base de datos no configurada.');

    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if ('displayName' in body) patch.display_name = cleanStr(body.displayName);
    if ('firstName' in body) patch.first_name = cleanStr(body.firstName, 80);
    if ('lastName' in body) patch.last_name = cleanStr(body.lastName, 80);
    if ('firstName' in body && 'lastName' in body) patch.display_name = `${cleanStr(body.firstName,80)} ${cleanStr(body.lastName,80)}`.trim();
    if ('phone' in body) patch.phone = cleanStr(body.phone, 64);
    if ('studies' in body) patch.studies = parseStudies(body.studies);
    if ('jobs' in body) patch.jobs = parseJobs(body.jobs);
    if ('languages' in body) patch.languages = parseLanguages(body.languages);
    if ('skills' in body) patch.skills = parseSkills(body.skills);

    const { data, error } = await sb
      .from('member_accounts')
      .update(patch)
      .eq('id', auth.accountId)
      .select('*')
      .single();
    if (error || !data) throw new BadRequestError(error?.message || 'No se pudo guardar.');

    res.json({ account: toPublicProfile(data as Parameters<typeof toPublicProfile>[0]) });
  });
}

/** POST /api/member/me/avatar — multipart field `file` */
export function createMemberAvatarUploadHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const auth = req.memberAuth;
    if (!auth) throw new UnauthorizedError('Iniciá sesión.');
    if (!config.cloudinary) throw new InternalError('Cloudinary no configurado.');

    const file = req.file as Express.Multer.File | undefined;
    if (!file?.buffer?.length) throw new BadRequestError('Subí una imagen.');

    const storage = new CloudinaryImageStorageService(config);
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const url = await storage.uploadDataUri(dataUri, { folder: 'xplora-landing/avatars' });

    const sb = createServiceSupabase(config);
    if (!sb) throw new InternalError('Base de datos no configurada.');
    const { data, error } = await sb
      .from('member_accounts')
      .update({ avatar_url: url, updated_at: new Date().toISOString() })
      .eq('id', auth.accountId)
      .select('*')
      .single();
    if (error || !data) throw new BadRequestError(error?.message || 'No se pudo guardar el avatar.');

    res.json({ account: toPublicProfile(data as Parameters<typeof toPublicProfile>[0]) });
  });
}

/** POST /api/member/me/cv — multipart field `cv` */
export function createMemberCvUploadHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const auth = req.memberAuth;
    if (!auth) throw new UnauthorizedError('Iniciá sesión.');

    const file = req.file as Express.Multer.File | undefined;
    if (!file?.buffer?.length) throw new BadRequestError('Subí tu CV (PDF o Word).');

    const cvUrl = await uploadCvBufferToCloudinary(config, {
      buffer: file.buffer,
      filename: file.originalname || 'cv',
    });

    const sb = createServiceSupabase(config);
    if (!sb) throw new InternalError('Base de datos no configurada.');
    const { data, error } = await sb
      .from('member_accounts')
      .update({ cv_url: cvUrl, updated_at: new Date().toISOString() })
      .eq('id', auth.accountId)
      .select('*')
      .single();
    if (error || !data) throw new BadRequestError(error?.message || 'No se pudo guardar el CV.');

    res.json({ account: toPublicProfile(data as Parameters<typeof toPublicProfile>[0]) });
  });
}
