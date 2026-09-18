import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { GoogleFormsHandler } from '../src/services/google-forms/handler.js';
import express from 'express';
import { once } from 'node:events';
import { getAppConfig } from '../src/config/env.js';
import { registerPointsRoutes } from '../src/http/controllers/points.controller.js';

test('Google connector authenticates before awarding and rejects unverified email collection', async () => {
  const secret = 'fixture-only-connector-secret-123456789012345';
  const calls: unknown[] = [];
  const handler = new GoogleFormsHandler({
    async connection() { return { form_id: 'form-1', secret_hash: createHash('sha256').update(secret).digest('hex') }; },
    async connect() { calls.push('connected'); },
    async claim(input) { calls.push(input); return { points: 30, alreadyClaimed: false }; },
  });
  const event = { type: 'response', formId: 'form-1', emailCollectionType: 'VERIFIED', responseId: 'response-1',
    email: 'member@example.test', submittedAt: '2026-09-17T20:00:00.000Z' };
  const id = '70000000-0000-4000-8000-000000000002';
  assert.equal((await handler.execute({ id, token: 'wrong', event })).success, false);
  assert.equal((await handler.execute({ id, token: secret, event: { ...event, emailCollectionType: 'RESPONDER_INPUT' } })).success, false);
  assert.equal((await handler.execute({ id, token: secret, event: { ...event, formId: 'other' } })).success, false);
  assert.equal(calls.length, 0);
  assert.equal((await handler.execute({ id, token: secret, event })).success, true);
  assert.equal(calls.length, 1);
});

test('Google callback fails closed with Points disabled and does not expose member endpoints', async () => {
  const app = express(); app.use(express.json());
  registerPointsRoutes(app, { ...getAppConfig(), pointsEnabled: false }, []);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening'); const address = server.address(); assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/integrations/points/google-forms/70000000-0000-4000-8000-000000000002`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 503);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
