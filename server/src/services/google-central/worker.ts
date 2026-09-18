import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../../config/env.js';
import { createServiceSupabase } from '../../infra/supabase-clients.js';
import { GoogleApi } from './api.js';
import { accessToken, checkDb } from './store.js';
import { ingestPage } from './sync.js';

type Task = {action_id:string;form_id:string;secret_hash:string;poll_since:string;poll_page:string|null;
  poll_started_at:string|null;activated_at:string;xp_actions:{active:boolean;expires_at:string}};
/** DB lease coordinates replicas; checkpoints and inbox survive restarts. No answer bodies are requested or stored. */
export async function syncGoogle(config: AppConfig, owner: string): Promise<void> {
  if (!config.googleForms || !config.pointsEnabled) return;
  const db = createServiceSupabase(config); if (!db) return;
  const lease = async () => {
    const result = await db.rpc('xp_google_lease',{p_owner:owner}); checkDb(result.error); return result.data === true;
  };
  if (!(await lease())) return;
  const started = Date.now();
  const token = await accessToken(db,config.googleForms);
  if (!token.success) return;
  const tasks = await db.from('xp_google_forms')
    .select('action_id,form_id,secret_hash,poll_since,poll_page,poll_started_at,activated_at,xp_actions!inner(active,expires_at)')
    .eq('mode','oauth').eq('xp_actions.active',true)
    .gt('xp_actions.expires_at',new Date(Date.now()-7*86400000).toISOString())
    .order('sync_checked_at',{nullsFirst:true}).limit(100).returns<Task[]>();
  checkDb(tasks.error);
  for (const task of tasks.data ?? []) {
    if (Date.now()-started>45000 || !(await lease())) break;
    const scanStart = task.poll_started_at ?? new Date().toISOString();
    const result = await ingestPage({formId:task.form_id,since:task.poll_since,page:task.poll_page ?? undefined},token.data,new GoogleApi(),{
      async enqueue(rows) {
        if (rows.length) checkDb((await db.from('xp_google_inbox').upsert(rows.map(row=>({...row,action_id:task.action_id})),
          {onConflict:'action_id,response_id',ignoreDuplicates:true})).error);
      },
      async checkpoint(page,since) {
        checkDb((await db.from('xp_google_forms').update({poll_page:page,poll_since:since,
          poll_started_at:page ? scanStart : null,last_synced_at:new Date().toISOString(),sync_error:null})
          .eq('action_id',task.action_id).eq('activated_at',task.activated_at)).error);
      },
    },scanStart);
    checkDb((await db.from('xp_google_forms').update({sync_checked_at:new Date().toISOString(),
      ...(!result.success ? {sync_error:result.error.code,
        ...(task.poll_page && result.error.code==='UNAVAILABLE' ? {poll_page:null,poll_started_at:null} : {})} : {})})
      .eq('action_id',task.action_id)).error);
    if (!result.success) {
      if (result.error.code==='RECONNECT') checkDb((await db.from('xp_google_account').update({reconnect_required:true}).eq('id',true)).error);
      continue;
    }
    const pending = await db.from('xp_google_inbox').select('response_id,email,submitted_at,attempts')
      .eq('action_id',task.action_id).is('completed_at',null).lte('next_attempt_at',new Date().toISOString())
      .order('next_attempt_at').limit(50);
    checkDb(pending.error);
    for (const row of pending.data ?? []) {
      if (Date.now()-started>60000 || !(await lease())) break;
      // Atomic existing RPC checks current active window, attendance, cap, member and deduplication.
      const claim = await db.rpc('xp_google_claim',{p_action:task.action_id,p_form:task.form_id,
        p_response:row.response_id,p_email:row.email,p_submitted:row.submitted_at,p_secret:task.secret_hash});
      checkDb((await db.from('xp_google_inbox').update(claim.error ? {attempts:row.attempts+1,
        next_attempt_at:new Date(Date.now()+300000).toISOString()} : {completed_at:new Date().toISOString()})
        .eq('action_id',task.action_id).eq('response_id',row.response_id)).error);
    }
  }
  // Completed metadata is no longer needed; durable xp_google_receipts retain deduplication.
  checkDb((await db.from('xp_google_inbox').delete().lt('completed_at',new Date(Date.now()-30*86400000).toISOString())).error);
  checkDb((await db.from('xp_google_oauth_states').delete().lt('expires_at',new Date().toISOString())).error);
}
export function startGoogleWorker(config: AppConfig, tick: (config:AppConfig,owner:string)=>Promise<void> = syncGoogle): () => void {
  if (!config.googleForms?.workerEnabled || !config.pointsEnabled) return () => {};
  const owner = randomUUID(); let running=false, stopped=false;
  const run = async () => {
    if (running || stopped) return; running=true;
    try { await tick(config,owner); }
    catch { console.warn('[google-forms] Sincronización pendiente; se reintentará.'); }
    finally { running=false; }
  };
  const timer = setInterval(()=>void run(),60000); timer.unref(); void run();
  return () => { stopped=true; clearInterval(timer); };
}
