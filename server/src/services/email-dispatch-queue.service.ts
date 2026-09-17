/**
 * Cola de envío de campañas en el proceso Node: la petición HTTP devuelve al toque y el envío sigue en segundo plano.
 * Nota: si reiniciás el servidor, los jobs en memoria se pierden (los ya insertados en campanias_envios quedan).
 */
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config/env.js';
import { sendOneResendEmail } from './resend-send.service.js';
import type { CampaignRecipient } from './email-campaign-audience.service.js';
import { personalizeCampaignHtml } from './contact-unsubscribe.service.js';
import {
  buildCustomEmailVariables,
  renderCustomEmailHtml,
  type CustomEmailCampaignData,
} from '../domain/custom-email-template.js';

export type DispatchJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type DispatchJobPublicState = {
  jobId: string;
  status: DispatchJobStatus;
  campaignId: string;
  total: number;
  skipped_already_sent: number;
  attempted: number;
  sent: number;
  failed: { usuario_id: string; email: string; error: string }[];
  current_email: string | null;
  from: string;
  message?: string;
};

type InternalJob = DispatchJobPublicState & {
  startedAt: number;
  subject: string;
  html: string;
  customEmailCampaign: CustomEmailCampaignData | null;
  recipients: CampaignRecipient[];
  sb: SupabaseClient;
  resend: NonNullable<AppConfig['resend']>;
  unsubscribe: { siteUrl: string; tokenSecret: string };
};

const jobs = new Map<string, InternalJob>();
const MAX_JOB_AGE_MS = 24 * 60 * 60 * 1000;

function pruneOldJobs(): void {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - j.startedAt > MAX_JOB_AGE_MS) jobs.delete(id);
  }
}

export function createDispatchJob(params: {
  campaignId: string;
  subject: string;
  html: string;
  customEmailCampaign?: CustomEmailCampaignData | null;
  recipients: CampaignRecipient[];
  skipped_already_sent: number;
  resend: NonNullable<AppConfig['resend']>;
  sb: SupabaseClient;
  unsubscribe: { siteUrl: string; tokenSecret: string };
}): string {
  pruneOldJobs();
  const jobId = randomUUID();
  const job: InternalJob = {
    jobId,
    startedAt: Date.now(),
    status: 'queued',
    campaignId: params.campaignId,
    total: params.recipients.length + params.skipped_already_sent,
    skipped_already_sent: params.skipped_already_sent,
    attempted: params.recipients.length,
    sent: 0,
    failed: [],
    current_email: null,
    from: params.resend.from,
    subject: params.subject,
    html: params.html,
    customEmailCampaign: params.customEmailCampaign ?? null,
    recipients: params.recipients,
    resend: params.resend,
    sb: params.sb,
    unsubscribe: params.unsubscribe,
  };
  jobs.set(jobId, job);
  return jobId;
}

export function getDispatchJob(jobId: string): DispatchJobPublicState | null {
  const j = jobs.get(jobId);
  if (!j) return null;
  return publicSlice(j);
}

function publicSlice(j: InternalJob): DispatchJobPublicState {
  return {
    jobId: j.jobId,
    status: j.status,
    campaignId: j.campaignId,
    total: j.total,
    skipped_already_sent: j.skipped_already_sent,
    attempted: j.attempted,
    sent: j.sent,
    failed: j.failed,
    current_email: j.current_email,
    from: j.from,
    message: j.message,
  };
}

async function insertEnvio(sb: SupabaseClient, campaniaId: string, usuarioId: string): Promise<void> {
  const { error } = await sb.from('campanias_envios').insert({
    campania_id: campaniaId,
    usuario_id: usuarioId,
  });
  if (error) {
    if (error.code === '23505' || /duplicate|unique/i.test(error.message)) {
      return;
    }
    throw new Error(error.message);
  }
}

export function startDispatchJobRunner(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'queued') return;

  void (async () => {
    job.status = 'running';
    try {
      for (const r of job.recipients) {
        job.current_email = r.email;
        const personalizedHtml = job.customEmailCampaign
          ? renderCustomEmailHtml(
              job.html,
              buildCustomEmailVariables(
                { nombre: r.nombre, email: r.email, carrera: r.carrera },
                job.customEmailCampaign,
              ),
            )
          : job.html;
        const recipientHtml = await personalizeCampaignHtml(personalizedHtml, {
          siteUrl: job.unsubscribe.siteUrl,
          tokenSecret: job.unsubscribe.tokenSecret,
          usuarioId: r.usuario_id,
        });
        const errMsg = await sendOneResendEmail(job.resend, {
          to: r.email,
          subject: job.subject,
          html: recipientHtml,
        });
        if (errMsg) {
          console.warn(`[resend] fallo envío a ${r.email}:`, errMsg);
          job.failed.push({ usuario_id: r.usuario_id, email: r.email, error: errMsg });
        } else {
          await insertEnvio(job.sb, job.campaignId, r.usuario_id);
          job.sent += 1;
        }
      }
      job.status = 'completed';
      job.current_email = null;
    } catch (e) {
      job.status = 'failed';
      job.message = e instanceof Error ? e.message : String(e);
      job.current_email = null;
    }
  })();
}
