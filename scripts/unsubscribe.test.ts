import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createUnsubscribeUrl,
  deleteContactData,
  personalizeCampaignHtml,
  injectUnsubscribeUrl,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from '../server/src/services/contact-unsubscribe.service.js';
import {
  EMAIL_TEMPLATE_OPTIONS,
  buildEmailHtmlForTemplate,
} from '../src/components/admin/emailTemplates/registry.js';
import { defaultPlatformData } from '../src/components/admin/emailTemplateInput.js';
import {
  createDispatchJob,
  getDispatchJob,
  startDispatchJobRunner,
} from '../server/src/services/email-dispatch-queue.service.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  createPublicContactUnsubscribeDeleteHandler,
  createPublicContactUnsubscribePageHandler,
} from '../server/src/http/controllers/public-contact-unsubscribe.controller.js';
import type { AppConfig } from '../server/src/config/env.js';

test('an unsubscribe token identifies one contact and cannot be used with another secret', async () => {
  const token = await createUnsubscribeToken('test-secret-with-enough-length', 'contact-123');

  assert.equal(
    await verifyUnsubscribeToken('test-secret-with-enough-length', token),
    'contact-123',
  );
  await assert.rejects(() => verifyUnsubscribeToken('different-secret-with-enough-length', token));
});

test('a campaign email replaces its unsubscribe marker with the recipient link', () => {
  const html = '<a href="{{UNSUBSCRIBE_URL}}">Desuscribite acá</a>';
  const result = injectUnsubscribeUrl(html, 'https://xploraucema.com/api/public/unsubscribe?token=a&x=1');

  assert.match(result, /href="https:\/\/xploraucema\.com\/api\/public\/unsubscribe\?token=a&amp;x=1"/);
  assert.doesNotMatch(result, /\{\{UNSUBSCRIBE_URL\}\}/);
});

test('the unsubscribe link always targets Xplora public endpoint', () => {
  assert.equal(
    createUnsubscribeUrl('https://xploraucema.com/', 'signed-token'),
    'https://xploraucema.com/api/public/unsubscribe?token=signed-token',
  );
});

test('each campaign recipient receives a different signed unsubscribe link', async () => {
  const html = '<a href="{{UNSUBSCRIBE_URL}}">Desuscribite acá</a>';
  const first = await personalizeCampaignHtml(html, {
    siteUrl: 'https://xploraucema.com', tokenSecret: 'test-secret-with-enough-length', usuarioId: 'contact-1',
  });
  const second = await personalizeCampaignHtml(html, {
    siteUrl: 'https://xploraucema.com', tokenSecret: 'test-secret-with-enough-length', usuarioId: 'contact-2',
  });

  assert.notEqual(first, second);
  assert.match(first, /api\/public\/unsubscribe\?token=/);
  assert.doesNotMatch(first, /\{\{UNSUBSCRIBE_URL\}\}/);
});

test('every campaign template contains the recipient-specific unsubscribe marker', () => {
  const input = {
    tituloInterno: 'Campaña', asunto: 'Asunto', estado: 'nuevo_evento' as const,
    flyerUrl: '', textoPrincipal: 'Mensaje', fecha: '', hora: '', lugar: '', orador: '', ctaUrl: '',
    platform: defaultPlatformData(),
  };
  for (const template of EMAIL_TEMPLATE_OPTIONS) {
    assert.match(buildEmailHtmlForTemplate(template.id, input), /\{\{UNSUBSCRIBE_URL\}\}/, template.id);
  }
});

test('campaign dispatch sends the recipient-specific unsubscribe link', async t => {
  const sent: { html: string }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as { html: string });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const sb = {
    from: () => ({ insert: async () => ({ error: null }) }),
  } as unknown as SupabaseClient;
  const jobId = createDispatchJob({
    campaignId: 'campaign-1', subject: 'Asunto', html: '<a href="{{UNSUBSCRIBE_URL}}">Baja</a>',
    recipients: [{ usuario_id: 'contact-123', email: 'contact@example.com' }], skipped_already_sent: 0,
    resend: { apiKey: 'test', from: 'test@example.com', fromName: null }, sb,
    unsubscribe: { siteUrl: 'https://xploraucema.com', tokenSecret: 'test-secret-with-enough-length' },
  });
  startDispatchJobRunner(jobId);
  for (let attempt = 0; attempt < 50 && getDispatchJob(jobId)?.status !== 'completed'; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }

  assert.equal(getDispatchJob(jobId)?.status, 'completed');
  assert.match(sent[0]?.html ?? '', /api\/public\/unsubscribe\?token=/);
  assert.doesNotMatch(sent[0]?.html ?? '', /\{\{UNSUBSCRIBE_URL\}\}/);
});

test('deleting an unsubscribed contact removes its contact data and related records', async () => {
  const deleted: string[] = [];
  const sb = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => table === 'usuarios'
            ? { data: { id: 'contact-123', email: 'contact@example.com' }, error: null }
            : { data: null, error: null },
        }),
      }),
      delete: () => ({
        eq: async (column: string, value: string) => {
          deleted.push(`${table}.${column}=${value}`);
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;

  assert.equal(await deleteContactData(sb, 'contact-123'), 'deleted');
  assert.deepEqual(deleted, [
    'contact_list_members.usuario_id=contact-123',
    'campanias_envios.usuario_id=contact-123',
    'inscripciones_evento.usuario_id=contact-123',
    'member_auth_challenges.email=contact@example.com',
    'member_accounts.usuario_id=contact-123',
    'member_accounts.email=contact@example.com',
    'usuarios.id=contact-123',
  ]);
});

test('the email link opens a confirmation page before deleting contact data', async t => {
  const app = express();
  const config = {
    publicSiteUrl: 'http://xplora.test',
    unsubscribeTokenSecret: 'test-secret-with-enough-length',
  } as AppConfig;
  app.get('/unsubscribe', createPublicContactUnsubscribePageHandler(config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const token = await createUnsubscribeToken('test-secret-with-enough-length', 'contact-123');

  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/unsubscribe?token=${token}`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Confirmar eliminación/);
});

test('confirming the public unsubscribe link deletes the contact through the API', async t => {
  const deleted: string[] = [];
  const database = express();
  database.all('/rest/v1/:table', (req, res) => {
    const table = req.params.table;
    if (req.method === 'GET' && table === 'usuarios') {
      return res.json([{ id: 'contact-123', email: 'contact@example.com' }]);
    }
    if (req.method === 'DELETE') {
      deleted.push(table);
      return res.status(204).end();
    }
    return res.status(404).json({ error: 'Unexpected test request' });
  });
  const dbServer = database.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => dbServer.once('listening', resolve));
  t.after(() => { dbServer.closeAllConnections(); dbServer.close(); });

  const app = express();
  const config = {
    supabaseUrl: `http://127.0.0.1:${(dbServer.address() as AddressInfo).port}`,
    supabaseAnonKey: 'anon-test-key', supabaseServiceRoleKey: 'service-test-key',
    unsubscribeTokenSecret: 'test-secret-with-enough-length', publicSiteUrl: 'http://xplora.test',
  } as AppConfig;
  app.post('/unsubscribe', createPublicContactUnsubscribeDeleteHandler(config));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const token = await createUnsubscribeToken('test-secret-with-enough-length', 'contact-123');

  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/unsubscribe?token=${token}`, { method: 'POST' });
  const html = await response.text();
  assert.equal(response.status, 200, html);
  assert.match(html, /Tus datos fueron eliminados/);
  assert.deepEqual(deleted, [
    'contact_list_members', 'campanias_envios', 'inscripciones_evento',
    'member_auth_challenges', 'member_accounts', 'member_accounts', 'usuarios',
  ]);
});
