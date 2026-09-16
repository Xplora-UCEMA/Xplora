/**
 * Reserva de lugar Startup Day → `public.startup_day_waitlist` + mail Resend.
 * Tabla exclusiva del funnel; no reutiliza `usuarios` ni otras leads.
 */
import type { RequestHandler } from 'express';
import type { AppConfig } from '../../config/env.js';
import { createServiceSupabase } from '../../infra/supabase-clients.js';
import { BadRequestError, InternalError } from '../errors/http-error.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { sendOneResendEmail } from '../../services/resend-send.service.js';
import { buildStartupDayWaitlistConfirmHtml } from '../../services/startup-day-waitlist-email.service.js';

const MAX_LEN = 240;
const MAX_CREATING = 800;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export function createPublicStartupDayWaitlistHandler(config: AppConfig): RequestHandler {
  return asyncHandler(async (req, res) => {
    const sb = createServiceSupabase(config);
    if (!sb) {
      throw new InternalError(
        'El servidor no tiene configurada la escritura a la base (SUPABASE_SERVICE_ROLE_KEY).',
      );
    }

    const body = req.body as Record<string, unknown>;
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : '';
    if (!emailRaw || !EMAIL_RE.test(emailRaw) || emailRaw.length > MAX_LEN) {
      throw new BadRequestError('Email inválido.');
    }
    const email = emailRaw.toLowerCase();

    const nombreCompleto = optStr(body.nombreCompleto ?? body.nombre_completo, MAX_LEN);
    const universidad = optStr(body.universidad, MAX_LEN);
    const queEstanCreando = optStr(
      body.queEstanCreando ?? body.que_estan_creando,
      MAX_CREATING,
    );
    const carrera = optStr(body.carrera, MAX_LEN);

    const { data: existing, error: qErr } = await sb
      .from('startup_day_waitlist')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    if (qErr) {
      throw new BadRequestError(qErr.message);
    }
    if (existing) {
      res.status(200).json({ ok: true, alreadyRegistered: true });
      return;
    }

    const row = {
      email,
      nombre_completo: nombreCompleto,
      universidad,
      que_estan_creando: queEstanCreando,
      carrera,
    };

    const { error: insErr } = await sb.from('startup_day_waitlist').insert(row);
    if (insErr) {
      const code = 'code' in insErr ? String((insErr as { code?: string }).code) : '';
      if (code === '23505' || /duplicate key/i.test(insErr.message)) {
        res.status(200).json({ ok: true, alreadyRegistered: true });
        return;
      }
      throw new BadRequestError(insErr.message);
    }

    let emailSent = false;
    if (config.resend) {
      const html = buildStartupDayWaitlistConfirmHtml({
        email,
        nombreCompleto,
      });
      const err = await sendOneResendEmail(config.resend, {
        to: email,
        subject: 'Estás en la lista del próximo Startup Day — Xplora',
        html,
      });
      if (err) {
        console.warn(`[startup-day-waitlist] Resend falló para ${email}:`, err);
      } else {
        emailSent = true;
      }
    } else {
      console.warn('[startup-day-waitlist] Resend no configurado; reserva guardada sin mail.');
    }

    res.status(201).json({ ok: true, emailSent });
  });
}
