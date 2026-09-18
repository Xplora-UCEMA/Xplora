import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import express, { type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { getAppConfig } from '../src/config/env.js';
import { createAdminMemberDeleteHandler } from '../src/http/controllers/admin-members.controller.js';
import { createAdminLumaCsvImportHandler } from '../src/http/controllers/admin-luma-csv.controller.js';

const config = {
  ...getAppConfig(),
  supabaseUrl: 'https://points-test.invalid',
  supabaseAnonKey: 'test-anon',
  supabaseServiceRoleKey: 'test-server-role',
};

test('authorized CRM deletion uses the atomic Points erasure with server credentials', async () => {
  const nativeFetch = globalThis.fetch;
  const calls: { path: string; authorization: string | null }[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (!request.url.startsWith(config.supabaseUrl)) return nativeFetch(input, init);
    calls.push({ path: new URL(request.url).pathname, authorization: request.headers.get('authorization') });
    return Response.json('deleted');
  };
  const app = express();
  app.delete('/members/:id', createAdminMemberDeleteHandler(config));
  const errors: ErrorRequestHandler = (_error, _req, res, _next) => { res.sendStatus(500); };
  app.use(errors);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await nativeFetch(`http://127.0.0.1:${address.port}/members/00000000-0000-4000-8000-000000000001`, {
      method: 'DELETE', headers: { authorization: 'Bearer test-staff-session' },
    });
    assert.equal(response.status, 204);
    assert.deepEqual(calls, [{ path: '/rest/v1/rpc/xp_delete_contact', authorization: 'Bearer test-server-role' }]);
  } finally {
    globalThis.fetch = nativeFetch;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('authorized attendance import accesses Supabase with server credentials', async () => {
  const nativeFetch = globalThis.fetch;
  const credentials: (string | null)[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (!request.url.startsWith(config.supabaseUrl)) return nativeFetch(input, init);
    credentials.push(request.headers.get('authorization'));
    // Stop at the nonexistent fixture event: this test must never write attendance.
    return Response.json(null);
  };
  const app = express();
  app.post('/events/:eventoId/import', multer().single('csv'), createAdminLumaCsvImportHandler(config));
  const errors: ErrorRequestHandler = (_error, _req, res, _next) => { res.sendStatus(400); };
  app.use(errors);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const form = new FormData();
    form.append('csv', new Blob(['email\nfixture@example.test']), 'guests.csv');
    const response = await nativeFetch(`http://127.0.0.1:${address.port}/events/fixture/import`, {
      method: 'POST', body: form, headers: { authorization: 'Bearer test-staff-session' },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(credentials, ['Bearer test-server-role']);
  } finally {
    globalThis.fetch = nativeFetch;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
