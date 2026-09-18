import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express, { type ErrorRequestHandler } from 'express';
import { getAppConfig } from '../src/config/env.js';
import { registerPointsRoutes } from '../src/http/controllers/points.controller.js';
import { seal } from '../src/services/google-central/security.js';
import { signMemberAccessToken } from '../src/services/member-jwt.service.js';

test('a centrally-created Google Form task is listed only for an eligible member', async () => {
  const encryptionKey = Buffer.alloc(32, 7).toString('base64');
  const config = {
    ...getAppConfig(),
    pointsEnabled: true,
    supabaseUrl: 'https://google-task-flow.invalid',
    supabaseServiceRoleKey: 'fixture-role',
    memberJwtSecret: 'fixture-only-member-secret-long-enough',
    googleForms: {
      clientId: 'fixture-client',
      clientSecret: 'fixture-client-secret',
      redirectUri: 'http://127.0.0.1:8788/api/integrations/points/google/callback',
      encryptionKey,
      accountEmail: 'owner@example.test',
      workerEnabled: true,
    },
  };
  const account = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'member@example.test',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    usuario_id: 'contact-1',
  };
  const taskId = '00000000-0000-4000-8000-000000000002';
  const eventId = '00000000-0000-4000-8000-000000000003';
  const formId = 'fixture-form-id';
  const editUrl = `https://docs.google.com/forms/d/${formId}/edit`;
  const responderUrl = 'https://docs.google.com/forms/d/e/fixture-public-id/viewform';
  const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  const refreshToken = 'fixture-refresh-token';
  let attended = false;
  let created: Record<string, unknown> | null = null;

  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);

    if (url.origin === config.supabaseUrl) {
      if (url.pathname.endsWith('/xp_google_worker')) {
        return Response.json({ heartbeat_at: new Date().toISOString() });
      }
      if (url.pathname.endsWith('/xp_google_account')) {
        return Response.json({
          refresh_cipher: seal(refreshToken, encryptionKey, 'google-refresh'),
          reconnect_required: false,
        });
      }
      if (url.pathname.endsWith('/rpc/xp_create_central_task')) {
        created = await request.json() as Record<string, unknown>;
        return Response.json(taskId);
      }
      if (url.pathname.endsWith('/member_accounts')) return Response.json(account);
      if (url.pathname.endsWith('/xp_events')) return Response.json([]);
      if (url.pathname.endsWith('/xp_claims')) {
        assert.equal(url.searchParams.get('member_id'), `eq.${account.id}`);
        return Response.json([]);
      }
      if (url.pathname.endsWith('/inscripciones_evento')) {
        assert.equal(url.searchParams.get('usuario_id'), `eq.${account.usuario_id}`);
        return Response.json(attended ? [{ evento_id: eventId, asistio: true }] : []);
      }
      if (url.pathname.endsWith('/xp_actions')) {
        assert.match(url.searchParams.get('select') ?? '', /xp_google_forms/);
        return Response.json(created ? [{
          id: taskId,
          title: created.p_title,
          kind: 'google_form',
          points: created.p_points,
          event_id: created.p_event,
          active: true,
          expires_at: created.p_expires,
          max_claims: created.p_cap,
          xp_claims: [{ count: 0 }],
          xp_google_forms: { responder_url: created.p_url, connected_at: new Date().toISOString() },
        }] : []);
      }
      throw new Error(`Unexpected Supabase fixture request: ${request.method} ${url.pathname}`);
    }

    if (url.origin === 'https://oauth2.googleapis.com') {
      const body = await request.text();
      assert.match(body, new RegExp(`refresh_token=${refreshToken}`));
      return Response.json({ access_token: 'fixture-access-token' });
    }
    if (url.origin === 'https://forms.googleapis.com') {
      assert.equal(request.headers.get('authorization'), 'Bearer fixture-access-token');
      assert.equal(url.pathname, `/v1/forms/${formId}`);
      return Response.json({
        formId,
        info: { title: 'Título en Google' },
        settings: { emailCollectionType: 'VERIFIED' },
        responderUri: responderUrl,
      });
    }
    return nativeFetch(input, init);
  };

  const app = express();
  app.use(express.json());
  registerPointsRoutes(app, config, [(req, res, next) => {
    if (req.headers.authorization !== 'Bearer staff') res.sendStatus(401);
    else next();
  }]);
  const errors: ErrorRequestHandler = (_error, _request, response, _next) => {
    response.status(400).json({ error: 'rejected' });
  };
  app.use(errors);
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const root = `http://127.0.0.1:${address.port}`;
    const createBody = {
      title: 'Encuesta post-evento',
      formUrl: editUrl,
      points: 40,
      maxClaims: 25,
      expiresAt,
      eventId,
    };

    const unauthorized = await nativeFetch(`${root}/api/admin/points/google/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createBody),
    });
    assert.equal(unauthorized.status, 401);
    assert.equal(created, null);

    const creation = await nativeFetch(`${root}/api/admin/points/google/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: 'Bearer staff' },
      body: JSON.stringify(createBody),
    });
    assert.equal(creation.status, 200);
    assert.deepEqual(await creation.json(), { id: taskId, active: true, url: null });
    const createdTask = created as Record<string, unknown> | null;
    assert.ok(createdTask);
    assert.deepEqual({
      title: createdTask.p_title,
      points: createdTask.p_points,
      cap: createdTask.p_cap,
      expires: createdTask.p_expires,
      event: createdTask.p_event,
      form: createdTask.p_form,
      url: createdTask.p_url,
    }, {
      title: createBody.title,
      points: createBody.points,
      cap: createBody.maxClaims,
      expires: createBody.expiresAt,
      event: createBody.eventId,
      form: formId,
      url: responderUrl,
    });
    const secretHash = String(createdTask.p_secret);
    const tokenHash = String(createdTask.p_token);
    assert.match(secretHash, /^[a-f0-9]{64}$/);
    assert.match(tokenHash, /^[a-f0-9]{64}$/);

    const memberToken = await signMemberAccessToken(config.memberJwtSecret, account);
    const listTasks = async () => {
      const response = await nativeFetch(`${root}/api/member/points/tasks`, {
        headers: { authorization: `Bearer ${memberToken}` },
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
      return response.json() as Promise<{ tasks: Array<Record<string, unknown>> }>;
    };

    assert.deepEqual((await listTasks()).tasks, [], 'members without verified attendance are ineligible');
    attended = true;
    assert.deepEqual((await listTasks()).tasks, [{
      id: taskId,
      title: createBody.title,
      kind: 'google_form',
      points: createBody.points,
      date: expiresAt,
      status: 'available',
      href: responderUrl,
    }]);
    const eligiblePayload = await listTasks();
    assert.ok(!JSON.stringify(eligiblePayload).includes(secretHash));
    assert.ok(!JSON.stringify(eligiblePayload).includes(tokenHash));
  } finally {
    globalThis.fetch = nativeFetch;
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
});
