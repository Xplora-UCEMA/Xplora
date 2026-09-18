import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import rateLimit from 'express-rate-limit';
import { GoogleFormsHandler } from '../../services/google-forms/handler.js';
import { registerGoogleCentralRoutes } from './google-central.controller.js';
import type { AppConfig } from "../../config/env.js";
import { createServiceSupabase } from "../../infra/supabase-clients.js";
import {
  findMemberById,
  linkExistingUsuario,
  toPublicProfile,
} from "../../services/member-accounts.service.js";
import {
  hashSecret,
  signMemberAccessToken,
} from "../../services/member-jwt.service.js";
import { sendOneResendEmail } from "../../services/resend-send.service.js";
import { renderMemberAccessEmail } from "../../services/member-access-email.js";
import { buildEventTasks, buildSurveyTasks, type EventTaskRow, type AttendanceRow, type SurveyTaskRow } from "../../services/points-tasks.service.js";
import {
  BadRequestError,
  InternalError,
  UnauthorizedError,
} from "../errors/http-error.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { createRequireMemberAuthMiddleware } from "../middleware/require-member-auth.middleware.js";
import {
  memberLoginRequestLimiter,
  memberLoginVerifyLimiter,
  memberNoStoreHeaders,
  memberReadLimiter,
  memberWriteLimiter,
} from "../middleware/member-security.middleware.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new BadRequestError("Identificador inválido.");
  return value;
}
function str(value: unknown, max = 160): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new BadRequestError("Completá los campos con valores válidos.");
  return value.trim();
}
function int(value: unknown, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > max
  )
    throw new BadRequestError(`Ingresá un número entero entre 1 y ${max}.`);
  return value;
}
function checked(error: { code?: string; message: string } | null): void {
  if (!error) return;
  if (error.code === "P0001") throw new BadRequestError(error.message);
  if (error.code === "23505")
    throw new BadRequestError("Este registro ya existe.");
  if (error.code === "23514")
    throw new BadRequestError("Los valores exceden los límites permitidos.");
  throw new InternalError(
    "No se pudo completar la operación de Points. Verificá que la migración esté aplicada y reintentá.",
  );
}

/** Server-only routes. Never trust an amount, member id, multiplier or inventory code from a member. */
export function registerPointsRoutes(
  app: Express,
  config: AppConfig,
  admin: RequestHandler[],
): void {
  app.use("/api/admin/points", memberNoStoreHeaders, memberWriteLimiter);
  registerGoogleCentralRoutes(app, config, admin);
  const member = createRequireMemberAuthMiddleware(config);
  const db = () => {
    const sb = createServiceSupabase(config);
    if (!sb) throw new InternalError("Base de datos no configurada.");
    return sb;
  };
  const secret = () => {
    if (
      !config.memberJwtSecret ||
      config.memberJwtSecret.length < 32 ||
      !config.resend
    )
      throw new InternalError(
        "El acceso por email todavía no está configurado.",
      );
    return config.memberJwtSecret;
  };
  const hashAccess = (id: string, value: string) =>
    createHmac("sha256", secret()).update(`${id}:${value}`).digest("hex");

  app.post('/api/integrations/points/google-forms/:id', memberNoStoreHeaders,
    rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }),
    asyncHandler(async (req, res) => {
      if (!config.pointsEnabled) { res.status(503).json({ error: 'Points no está disponible.' }); return; }
      const handler = new GoogleFormsHandler({
        async connection(id) {
          const result = await db().from('xp_google_forms').select('form_id,secret_hash').eq('action_id', id).maybeSingle();
          checked(result.error); return result.data;
        },
        async connect(id, url, hash) {
          checked((await db().rpc('xp_google_connect', { p_action: id, p_url: url, p_secret: hash })).error);
        },
        async claim(event) {
          const result = await db().rpc('xp_google_claim', { p_action: event.id, p_form: event.formId,
            p_response: event.responseId, p_email: event.email, p_submitted: event.submittedAt, p_secret: event.secretHash });
          checked(result.error); return result.data;
        },
      });
      const result = await handler.execute({ id: req.params.id,
        token: req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1], event: req.body });
      if (!result.success) {
        res.status(result.error.code === 'RETRY' ? 409 : result.error.code === 'UNAUTHORIZED' ? 401 : 400)
          .json({ error: result.error.message, code: result.error.code }); return;
      }
      res.json(result.data);
    }));

  app.post(
    "/api/member/access/request",
    memberLoginRequestLimiter,
    asyncHandler(async (req, res) => {
      const email = str(req.body?.email, 240).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new BadRequestError("Ingresá un email válido.");
      secret();
      const id = randomUUID();
      const code = String(randomInt(100000, 1000000));
      const token = randomBytes(32).toString("base64url");
      const sb = db();
      const { data, error } = await sb.rpc("xp_issue_access", {
        p_id: id,
        p_email: email,
        p_code: hashAccess(id, code),
        p_magic: hashAccess(id, token),
      });
      checked(error);
      const challenge = data as { id: string; issued: boolean };
      if (challenge.issued && config.resend) {
        const url = new URL("/cuenta/confirmar", config.publicSiteUrl);
        url.hash = new URLSearchParams({ challenge: id, token }).toString();
        const sent = await sendOneResendEmail(config.resend, {
          to: email,
          subject: "Tu acceso a Xplora",
          html: renderMemberAccessEmail(
            code,
            url.toString(),
            config.publicSiteUrl,
            { pointsEnabled: config.pointsEnabled },
          ),
        });
        if (sent) {
          await sb.from("xp_access").delete().eq("id", id);
          throw new InternalError(
            "No pudimos enviar el correo. Reintentá en un momento.",
          );
        }
      }
      res.json({ challengeId: challenge.id, resendAfterSec: 120 });
    }),
  );
  app.post(
    "/api/member/access/verify",
    memberLoginVerifyLimiter,
    asyncHandler(async (req, res) => {
      const id = uuid(req.body?.challengeId);
      const magic = typeof req.body?.token === "string";
      const value = str(magic ? req.body?.token : req.body?.code, 100);
      if (magic ? !/^[A-Za-z0-9_-]{43}$/.test(value) : !/^\d{6}$/.test(value))
        throw new BadRequestError("Código o enlace inválido.");
      const sb = db();
      const { data, error } = await sb.rpc("xp_consume_access", {
        p_id: id,
        p_hash: hashAccess(id, value),
        p_magic: magic,
      });
      checked(error);
      if (typeof data !== "string")
        throw new UnauthorizedError(
          "El código o enlace venció, ya se usó o no es válido. Pedí uno nuevo.",
        );
      let account = await findMemberById(sb, data);
      if (!account) throw new UnauthorizedError("Cuenta no encontrada.");
      await linkExistingUsuario(sb, account);
      account = (await findMemberById(sb, data)) ?? account;
      res.json({
        accessToken: await signMemberAccessToken(secret(), account),
        account: toPublicProfile(account),
      });
    }),
  );
  app.get(
    "/api/member/points",
    memberReadLimiter,
    member,
    asyncHandler(async (req, res) => {
      if (!config.pointsEnabled) {
        res.json({ available: false });
        return;
      }
      const { data, error } = await db().rpc("xp_snapshot", {
        p_member: req.memberAuth!.accountId,
      });
      if (error?.code === "PGRST202") {
        res.json({ available: false });
        return;
      }
      checked(error);
      res.json(data);
    }),
  );
  app.get(
    "/api/member/points/tasks", memberNoStoreHeaders, memberReadLimiter, member,
    asyncHandler(async (req, res) => {
      if (!config.pointsEnabled) { res.json({ tasks: [] }); return; }
      const sb = db();
      const memberId = req.memberAuth!.accountId;
      const account = await findMemberById(sb, memberId);
      const [events, actions, claims, attendance] = await Promise.all([
        sb.from("xp_events").select("event_id,starts_at,base_points,closed,eventos(title,registration_link,realizado)")
          .order("starts_at").returns<EventTaskRow[]>(),
        (async () => {
          const fields = "id,title,kind,points,event_id,active,expires_at,max_claims,xp_claims(count)";
          const result = await sb.from('xp_actions').select(fields + ',xp_google_forms(responder_url,connected_at)')
            .in('kind', ['survey', 'google_form']).order('expires_at').returns<SurveyTaskRow[]>();
          // Rolling deploy: existing accounts still work until migration 003 is applied.
          if (result.error?.code === 'PGRST200') return sb.from('xp_actions').select(fields)
            .eq('kind', 'survey').not('event_id', 'is', null).order('expires_at').returns<SurveyTaskRow[]>();
          return result;
        })(),
        sb.from("xp_claims").select("action_id").eq("member_id", memberId),
        account?.usuario_id ? sb.from("inscripciones_evento").select("evento_id,asistio")
          .eq("usuario_id", account.usuario_id).returns<AttendanceRow[]>() : Promise.resolve({ data: [], error: null }),
      ]);
      for (const result of [events, actions, claims, attendance]) checked(result.error);
      const now = Date.now();
      res.json({ tasks: [
        ...buildSurveyTasks(actions.data ?? [], attendance.data ?? [], (claims.data ?? []).map(row => row.action_id as string), now),
        ...buildEventTasks(events.data ?? [], attendance.data ?? [], now),
      ] });
    }),
  );
  app.post(
    "/api/member/points/tasks/:id/claim",
    memberNoStoreHeaders,
    memberWriteLimiter,
    member,
    asyncHandler(async (req, res) => {
      if (!config.pointsEnabled) throw new BadRequestError("Points no está disponible.");
      const sb = db();
      const account = await findMemberById(sb, req.memberAuth!.accountId);
      if (!account?.usuario_id) throw new BadRequestError("Esta encuesta requiere asistencia verificada.");
      const action = await sb.from("xp_actions")
        .select("id,kind,event_id,token_hash")
        .eq("id", uuid(req.params.id)).maybeSingle<{ id: string; kind: string; event_id: string | null; token_hash: string }>();
      checked(action.error);
      const attendance = await sb.from("inscripciones_evento").select("evento_id,asistio")
        .eq("usuario_id", account.usuario_id).eq("asistio", true).returns<AttendanceRow[]>();
      checked(attendance.error);
      if (!action.data || action.data.kind !== "survey" || !action.data.event_id ||
        !attendance.data?.some(row => row.evento_id === action.data!.event_id && row.asistio))
        throw new BadRequestError("Encuesta no disponible para tu cuenta.");
      // The RPC owns expiry, quota and replay checks under the action lock.
      const result = await sb.rpc("xp_claim", {
        p_member: req.memberAuth!.accountId, p_hash: action.data.token_hash,
        p_rating: int(req.body?.rating, 5), p_feedback: str(req.body?.feedback, 2000),
      });
      checked(result.error);
      res.json(result.data);
    }),
  );
  app.post(
    "/api/member/points/redeem",
    memberWriteLimiter,
    member,
    asyncHandler(async (req, res) => {
      const { data, error } = await db().rpc("xp_redeem", {
        p_member: req.memberAuth!.accountId,
        p_reward: uuid(req.body?.rewardId),
        p_request: uuid(req.body?.requestId),
      });
      checked(error);
      res.json(data);
    }),
  );
  app.post(
    "/api/member/points/action",
    memberReadLimiter,
    member,
    asyncHandler(async (req, res) => {
      const { data, error } = await db()
        .from("xp_actions")
        .select("id,title,kind,points,expires_at,event_id")
        .eq("token_hash", hashSecret(str(req.body?.token, 100)))
        .eq("active", true)
        .gt("expires_at", new Date().toISOString())
        .in("kind", ["qr", "survey"])
        .maybeSingle();
      checked(error);
      if (!data) throw new BadRequestError("Acción no disponible o vencida.");
      res.json(data);
    }),
  );
  app.post(
    "/api/member/points/claim",
    memberWriteLimiter,
    member,
    asyncHandler(async (req, res) => {
      const sb = db();
      const hash = hashSecret(str(req.body?.token, 100));
      const action = await sb
        .from("xp_actions")
        .select("kind")
        .eq("token_hash", hash)
        .maybeSingle();
      checked(action.error);
      if (!action.data || !['qr', 'survey'].includes(action.data.kind))
        throw new BadRequestError("Acción no disponible.");
      const { data, error } = await sb.rpc("xp_claim", {
        p_member: req.memberAuth!.accountId,
        p_hash: hash,
        p_rating:
          req.body?.rating === undefined ? null : int(req.body?.rating, 5),
        p_feedback:
          typeof req.body?.feedback === "string"
            ? str(req.body?.feedback, 2000)
            : "",
      });
      checked(error);
      res.json(data);
    }),
  );

  app.get(
    "/api/admin/points",
    ...admin,
    asyncHandler(async (_req, res) => {
      const sb = db();
      const [events, rewards, actions, catalog, responses] = await Promise.all([
        sb.from("xp_events").select("*").order("starts_at"),
        sb.rpc("xp_reward_catalog"),
        sb
          .from("xp_actions")
          .select("id,title,kind,points,event_id,active,expires_at,max_claims,xp_claims(count),xp_google_forms(form_id,responder_url,connected_at,last_received_at)")
          .order("created_at", { ascending: false }),
        sb
          .from("eventos")
          .select("id,title")
          .order("created_at", { ascending: false }),
        sb
          .from("xp_claims")
          .select("action_id,rating,feedback,created_at")
          .not("rating", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      for (const r of [events, rewards, actions, catalog, responses])
        checked(r.error);
      res.json({
        events: events.data,
        rewards: rewards.data,
        actions: actions.data,
        catalog: catalog.data,
        responses: responses.data,
      });
    }),
  );
  app.put(
    "/api/admin/points/events/:id",
    ...admin,
    asyncHandler(async (req, res) => {
      const tier = str(req.body?.tier);
      if (!["normal", "large", "major"].includes(tier))
        throw new BadRequestError("Categoría inválida.");
      const date = new Date(str(req.body?.startsAt));
      if (!Number.isFinite(date.getTime()))
        throw new BadRequestError("Fecha inválida.");
      const { error } = await db()
        .from("xp_events")
        .upsert({
          event_id: uuid(req.params.id),
          tier,
          base_points: int(
            req.body?.points,
            tier === "normal" ? 20 : tier === "large" ? 50 : 100,
          ),
          starts_at: date.toISOString(),
        });
      checked(error);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/points/events/:id/close",
    ...admin,
    asyncHandler(async (req, res) => {
      const { data, error } = await db()
        .from("xp_events")
        .update({ closed: true })
        .eq("event_id", uuid(req.params.id))
        .select("event_id")
        .single();
      checked(error);
      res.json(data);
    }),
  );
  app.post(
    "/api/admin/points/rewards",
    ...admin,
    asyncHandler(async (req, res) => {
      const { data, error } = await db()
        .from("xp_rewards")
        .insert({
          title: str(req.body?.title),
          description: str(req.body?.description, 2000),
          cost: int(req.body?.cost, 1000000),
        })
        .select("*")
        .single();
      checked(error);
      res.json(data);
    }),
  );
  app.patch(
    "/api/admin/points/rewards/:id",
    ...admin,
    asyncHandler(async (req, res) => {
      if (typeof req.body?.active !== "boolean")
        throw new BadRequestError("Estado inválido.");
      const { error } = await db()
        .from("xp_rewards")
        .update({ active: req.body?.active })
        .eq("id", uuid(req.params.id));
      checked(error);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/points/rewards/:id/inventory",
    ...admin,
    asyncHandler(async (req, res) => {
      if (
        !Array.isArray(req.body?.deliveries) ||
        req.body?.deliveries.length < 1 ||
        req.body?.deliveries.length > 200
      )
        throw new BadRequestError(
          "Cargá entre 1 y 200 códigos, uno por línea.",
        );
      const reward = uuid(req.params.id);
      const { error } = await db()
        .from("xp_inventory")
        .insert(
          req.body?.deliveries.map((delivery: unknown) => ({
            reward_id: reward,
            delivery: str(delivery, 4000),
          })),
        );
      checked(error);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/points/actions",
    ...admin,
    asyncHandler(async (req, res) => {
      const token = randomBytes(32).toString("base64url");
      const kind = str(req.body?.kind);
      if (!["qr", "survey", "award", "google_form"].includes(kind))
        throw new BadRequestError("Tipo de acción inválido.");
      const expires = new Date(str(req.body?.expiresAt));
      if (
        !Number.isFinite(expires.getTime()) ||
        expires.getTime() <= Date.now()
      )
        throw new BadRequestError("Elegí una fecha futura.");
      if (kind === 'google_form') {
        const input = str(req.body?.formUrl, 500);
        let formId: string | undefined;
        try {
          const url = new URL(input);
          if (url.origin === 'https://docs.google.com' && !url.username && !url.password)
            formId = url.pathname.match(/^\/forms\/d\/([\w-]+)\/edit\/?$/)?.[1];
        } catch { /* Invalid edit link is reported below. */ }
        if (!formId) throw new BadRequestError('Pegá el enlace de edición de Google Forms (termina en /edit).');
        const connectorSecret = randomBytes(32).toString('base64url');
        const result = await db().rpc('xp_create_google_task', {
          p_title: str(req.body?.title), p_points: int(req.body?.points, 100), p_cap: int(req.body?.maxClaims, 100000),
          p_expires: expires.toISOString(), p_event: req.body?.eventId ? uuid(req.body.eventId) : null,
          p_form: formId, p_url: null, p_secret: hashSecret(connectorSecret), p_token: hashSecret(token),
        });
        checked(result.error);
        res.json({ id: result.data, url: null, connectorSecret, formId }); return;
      }
      const { data, error } = await db()
        .from("xp_actions")
        .insert({
          title: str(req.body?.title),
          kind,
          points: int(req.body?.points, 100),
          max_claims: int(req.body?.maxClaims, 100000),
          token_hash: hashSecret(token),
          event_id: req.body?.eventId ? uuid(req.body?.eventId) : null,
          expires_at: expires.toISOString(),
        })
        .select("id")
        .single();
      checked(error);
      res.json({
        id: data?.id,
        url:
          kind === "award"
            ? null
            : `${config.publicSiteUrl.replace(/\/$/, "")}/cuenta#claim=${token}`,
      });
    }),
  );
  app.patch(
    "/api/admin/points/actions/:id",
    ...admin,
    asyncHandler(async (req, res) => {
      if (req.body?.active !== undefined && typeof req.body.active !== 'boolean') throw new BadRequestError('Estado inválido.');
      const { error } = await db()
        .from("xp_actions")
        .update({ active: req.body?.active ?? false })
        .eq("id", uuid(req.params.id));
      checked(error);
      res.json({ ok: true });
    }),
  );
  app.post('/api/admin/points/actions/:id/rotate', ...admin, asyncHandler(async (req, res) => {
    const id = uuid(req.params.id);
    const connectorSecret = randomBytes(32).toString('base64url');
    const result = await db().rpc('xp_rotate_google_secret', { p_action: id, p_secret: hashSecret(connectorSecret) });
    checked(result.error);
    res.json({ id, connectorSecret, formId: result.data });
  }));
  app.post(
    "/api/admin/points/actions/:id/award",
    ...admin,
    asyncHandler(async (req, res) => {
      const sb = db();
      const action = await sb
        .from("xp_actions")
        .select("token_hash")
        .eq("id", uuid(req.params.id))
        .eq("kind", "award")
        .single();
      checked(action.error);
      const account = await sb
        .from("member_accounts")
        .select("id")
        .eq("email", str(req.body?.email, 240).toLowerCase())
        .not("email_confirmed_at", "is", null)
        .maybeSingle();
      checked(account.error);
      if (!account.data)
        throw new BadRequestError(
          "La persona debe crear y confirmar su cuenta primero.",
        );
      const { data, error } = await sb.rpc("xp_claim", {
        p_member: account.data.id,
        p_hash: action.data?.token_hash,
      });
      checked(error);
      res.json(data);
    }),
  );
}
