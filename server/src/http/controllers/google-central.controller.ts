import { createHash, randomBytes } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { createServiceSupabase } from '../../infra/supabase-clients.js';
import { GoogleApi } from '../../services/google-central/api.js';
import { authorizationUrl, exchangeToken, accountEmail } from '../../services/google-central/oauth.js';
import { seal, unseal, digest } from '../../services/google-central/security.js';
import { accessToken, checkDb } from '../../services/google-central/store.js';
import { TaskInput } from '../../services/google-central/spec.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { memberNoStoreHeaders, memberWriteLimiter } from '../middleware/member-security.middleware.js';
import { BadRequestError } from '../errors/http-error.js';

const cookieName = 'xplora_google_link';
const callbackPath = '/api/integrations/points/google/callback';
const opaque = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export function registerGoogleCentralRoutes(app: Express, config: AppConfig, admin: RequestHandler[]): void {
  const db = () => { const value = createServiceSupabase(config); if (!value) throw new BadRequestError('Base de datos no configurada.'); return value; };
  const settings = () => {
    if (!config.googleForms || !config.pointsEnabled) throw new BadRequestError('La conexión central de Google todavía no está configurada.');
    return config.googleForms;
  };
  const cookieOptions = { httpOnly:true, sameSite:'lax' as const, secure:config.googleForms?.redirectUri.startsWith('https:') ?? false,
    path:callbackPath, maxAge:600000 };
  app.get('/api/admin/points/google/status', ...admin, asyncHandler(async (_req,res) => {
    if (!config.googleForms) { res.json({configured:false,connected:false}); return; }
    const sb = db();
    const account = await sb.from('xp_google_account').select('email,connected_at,reconnect_required').eq('id',true).maybeSingle();
    const worker = await sb.from('xp_google_worker').select('heartbeat_at').eq('id',true).maybeSingle();
    if (account.error || worker.error) { res.json({configured:false,connected:false}); return; }
    const healthy = !!worker.data?.heartbeat_at && Date.now()-Date.parse(worker.data.heartbeat_at)<180000;
    const forms = await sb.from('xp_google_forms').select('action_id,mode,last_synced_at,sync_error').eq('mode','oauth');
    checkDb(forms.error);
    res.json({configured:true,connected:!!account.data && !account.data.reconnect_required,
      email:account.data?.email ?? config.googleForms.accountEmail, reconnectRequired:account.data?.reconnect_required ?? false,
      workerReady:healthy, forms:forms.data});
  }));
  app.post('/api/admin/points/google/connect', ...admin, asyncHandler(async (_req,res) => {
    const cfg = settings(); const sb = db();
    const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
    checkDb((await sb.from('xp_google_oauth_states').delete().lt('expires_at',new Date().toISOString())).error);
    checkDb((await sb.from('xp_google_oauth_states').insert({ state_hash:digest(state),browser_hash:'pending',
      verifier_cipher:seal(verifier,cfg.encryptionKey,'google-verifier') })).error);
    const start=new URL('/api/integrations/points/google/start',cfg.redirectUri);
    start.searchParams.set('ticket',state);
    res.json({url:start.href});
  }));
  app.get('/api/integrations/points/google/start',memberNoStoreHeaders,memberWriteLimiter,asyncHandler(async(req,res)=>{
    res.setHeader('Referrer-Policy','no-referrer');
    const cfg=settings(); const state=opaque.safeParse(req.query.ticket);
    if(!state.success) {res.status(400).send('Volvé a iniciar la conexión desde Ops.');return;}
    const browser=randomBytes(32).toString('base64url');
    const stored=await db().from('xp_google_oauth_states').update({browser_hash:digest(browser)})
      .eq('state_hash',digest(state.data)).eq('browser_hash','pending').gt('expires_at',new Date().toISOString())
      .select('verifier_cipher').maybeSingle();
    if(stored.error || !stored.data) {res.status(400).send('El enlace venció o ya se usó. Volvé a Ops.');return;}
    const verifier=unseal(stored.data.verifier_cipher,cfg.encryptionKey,'google-verifier');
    res.cookie(cookieName,browser,cookieOptions);
    res.redirect(authorizationUrl(cfg,state.data,createHash('sha256').update(verifier).digest('base64url')));
  }));
  app.get(callbackPath, memberNoStoreHeaders, memberWriteLimiter, asyncHandler(async (req,res) => {
    res.setHeader('Referrer-Policy','no-referrer');
    res.clearCookie(cookieName,{...cookieOptions,maxAge:undefined});
    let success = false;
    try {
      const cfg = settings(); const sb = db();
      const browser = opaque.safeParse(req.headers.cookie?.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${cookieName}=`))?.slice(cookieName.length+1));
      const state = opaque.safeParse(req.query.state);
      if (!browser.success || !state.success) throw new Error('Invalid state');
      const stored = await sb.from('xp_google_oauth_states').delete().eq('state_hash',digest(state.data))
        .eq('browser_hash',digest(browser.data)).gt('expires_at',new Date().toISOString()).select('verifier_cipher').maybeSingle();
      checkDb(stored.error);
      if (!stored.data || req.query.error || typeof req.query.code !== 'string' || req.query.code.length>4096) throw new Error('Invalid callback');
      const result = await exchangeToken(cfg,{code:req.query.code,verifier:unseal(stored.data.verifier_cipher,cfg.encryptionKey,'google-verifier')});
      if (!result.success || !result.data.refresh_token) throw new Error('Consent incomplete');
      const identity = await accountEmail(result.data.access_token);
      if (!identity.success || identity.data !== cfg.accountEmail) throw new Error('Wrong account');
      checkDb((await sb.from('xp_google_account').upsert({id:true,email:identity.data,
        refresh_cipher:seal(result.data.refresh_token,cfg.encryptionKey,'google-refresh'),
        reconnect_required:false,connected_at:new Date().toISOString()})).error);
      success = true;
    } catch { /* Never send OAuth query strings, credentials or provider errors to logs/monitoring. */ }
    res.status(success ? 200 : 400).type('html').send(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Google · Xplora</title><body><main><h1>${success ? 'Google conectado' : 'No se pudo conectar Google'}</h1><p>${success ? 'Podés cerrar esta pestaña y volver a Xplora Ops.' : 'Volvé a Ops y reintentá con la cuenta de Xplora, aceptando los permisos solicitados.'}</p></main></body></html>`);
  }));
  app.post('/api/admin/points/google/tasks', ...admin, asyncHandler(async (req,res) => {
    const cfg = settings(); const parsed = TaskInput.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Revisá los campos.');
    const sb = db();
    const worker = await sb.from('xp_google_worker').select('heartbeat_at').eq('id',true).maybeSingle();
    checkDb(worker.error);
    if (!worker.data?.heartbeat_at || Date.now()-Date.parse(worker.data.heartbeat_at)>180000)
      throw new BadRequestError('La sincronización no está disponible. Avisá al administrador antes de activar tareas.');
    const access = await accessToken(sb,cfg);
    if (!access.success) throw new BadRequestError(access.error.message);
    const form = await new GoogleApi().inspect(parsed.data.formUrl,access.data);
    if (!form.success) throw new BadRequestError(form.error.message);
    const input = parsed.data;
    const created = await sb.rpc('xp_create_central_task',{p_title:input.title,p_points:input.points,p_cap:input.maxClaims,
      p_expires:input.expiresAt,p_event:input.eventId,p_form:form.data.formId,p_url:form.data.responderUri,
      p_secret:digest(randomBytes(32).toString('base64url')),p_token:digest(randomBytes(32).toString('base64url'))});
    if (created.error?.code === '23505') throw new BadRequestError('Este formulario ya tiene una tarea. Buscala en el listado.');
    checkDb(created.error);
    res.json({id:created.data,active:true,url:null});
  }));
}
