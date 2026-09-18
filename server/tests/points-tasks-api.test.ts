import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import express, { type ErrorRequestHandler } from 'express';
import { getAppConfig } from '../src/config/env.js';
import { registerPointsRoutes } from '../src/http/controllers/points.controller.js';
import { signMemberAccessToken } from '../src/services/member-jwt.service.js';

test('Tasks API authenticates and submits only attendance-scoped surveys through the atomic claim RPC', async () => {
  const config = { ...getAppConfig(), pointsEnabled: true, supabaseUrl: 'https://tasks-test.invalid',
    supabaseServiceRoleKey: 'fixture-role', memberJwtSecret: 'fixture-only-member-secret-long-enough' };
  const account = { id: '00000000-0000-4000-8000-000000000001', email: 'member@example.test',
    email_confirmed_at: '2026-01-01', usuario_id: 'contact' };
  const actionId = '00000000-0000-4000-8000-000000000002';
  let kind = 'survey';
  let attended = true;
  let full = false;
  const rpc: Record<string, unknown>[] = [];
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (!request.url.startsWith(config.supabaseUrl)) return nativeFetch(input, init);
    const path = new URL(request.url).pathname;
    if (path.endsWith('/member_accounts')) return Response.json(account);
    if (path.endsWith('/inscripciones_evento')) return Response.json(attended ? [{ evento_id: 'event', asistio: true }] : []);
    if (path.endsWith('/xp_actions')) return Response.json({ id: actionId, kind, event_id: 'event',
      token_hash: 'fixture-private-hash', title: 'Encuesta', active: true, expires_at: '2099-01-01', points: 30,
      max_claims: 100, xp_claims: [{ count: full ? 100 : 0 }] });
    if (path.endsWith('/rpc/xp_claim')) { rpc.push(await request.json() as Record<string, unknown>); return Response.json({ points: 30, alreadyClaimed: false }); }
    throw new Error(`Unexpected fixture path: ${path}`);
  };
  const app = express(); app.use(express.json()); registerPointsRoutes(app, config, []);
  const errors: ErrorRequestHandler = (_err, _req, res, _next) => { res.status(400).json({ error: 'rejected' }); };
  app.use(errors);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/api/member/points/tasks/${actionId}/claim`;
    const token = await signMemberAccessToken(config.memberJwtSecret, account);
    const submit = (authenticated = true) => nativeFetch(url, { method: 'POST', headers: {
      'Content-Type': 'application/json', ...(authenticated ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ rating: 5, feedback: 'Excelente', memberId: 'spoofed', points: 9999 }) });
    assert.equal((await submit(false)).status, 400);
    assert.equal(rpc.length, 0);
    assert.equal((await submit()).status, 200);
    assert.deepEqual(rpc, [{ p_member: account.id, p_hash: 'fixture-private-hash', p_rating: 5, p_feedback: 'Excelente' }]);
    full = true;
    assert.equal((await submit()).status, 200, 'retries still reach the atomic, idempotent RPC when the last slot was used');
    kind = 'qr'; assert.equal((await submit()).status, 400);
    kind = 'award'; assert.equal((await submit()).status, 400);
    kind = 'survey'; attended = false; assert.equal((await submit()).status, 400);
    assert.equal(rpc.length, 2);
  } finally {
    globalThis.fetch = nativeFetch;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('Tasks listing joins the authenticated member attendance and never returns action hashes', async () => {
  const config = { ...getAppConfig(), pointsEnabled: true, supabaseUrl: 'https://tasks-list.invalid',
    supabaseServiceRoleKey: 'fixture-role', memberJwtSecret: 'fixture-only-member-secret-long-enough' };
  const account = { id: '00000000-0000-4000-8000-000000000001', email: 'member@example.test',
    email_confirmed_at: '2026-01-01', usuario_id: 'contact' };
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (!request.url.startsWith(config.supabaseUrl)) return nativeFetch(input, init);
    const url = new URL(request.url);
    if (url.pathname.endsWith('/member_accounts')) return Response.json(account);
    if (url.pathname.endsWith('/xp_events')) return Response.json([]);
    if (url.pathname.endsWith('/xp_claims')) { assert.equal(url.searchParams.get('member_id'), `eq.${account.id}`); return Response.json([]); }
    if (url.pathname.endsWith('/inscripciones_evento')) { assert.equal(url.searchParams.get('usuario_id'), 'eq.contact'); return Response.json([{ evento_id: 'event', asistio: true }]); }
    if (url.pathname.endsWith('/xp_actions')) return Response.json([{ id: 'survey', kind: 'survey', event_id: 'event',
      title: 'Encuesta', points: 30, active: true, expires_at: '2099-01-01', max_claims: 20, xp_claims: [{ count: 0 }], token_hash: 'must-not-leak' }]);
    throw new Error('Unexpected fixture query');
  };
  const app = express(); registerPointsRoutes(app, config, []);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string');
    const token = await signMemberAccessToken(config.memberJwtSecret, account);
    const response = await nativeFetch(`http://127.0.0.1:${address.port}/api/member/points/tasks`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const body = await response.json() as { tasks: { id: string }[] };
    assert.equal(body.tasks[0].id, 'survey');
    assert.ok(!JSON.stringify(body).includes('must-not-leak'));
  } finally { globalThis.fetch = nativeFetch; await new Promise<void>(resolve => server.close(() => resolve())); }
});
