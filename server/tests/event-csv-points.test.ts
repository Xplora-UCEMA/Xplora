import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import express, { type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { getAppConfig } from '../src/config/env.js';
import { createAdminLumaCsvImportHandler } from '../src/http/controllers/admin-luma-csv.controller.js';

test('attendance CSV awards configured event points through database triggers, never registration or reimports', async () => {
  const db = new PGlite();
  const nativeFetch = globalThis.fetch;
  const eventId = 'a0000000-0000-4000-8000-000000000001';
  const userId = 'a0000000-0000-4000-8000-000000000002';
  const memberId = 'a0000000-0000-4000-8000-000000000003';
  const config = { ...getAppConfig(), supabaseUrl: 'https://csv-points.invalid', supabaseServiceRoleKey: 'fixture-service-role' };
  const app = express();
  app.post('/events/:eventoId/import', multer().single('csv'), createAdminLumaCsvImportHandler(config));
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Import failed' });
  };
  app.use(errors);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE usuarios(id uuid PRIMARY KEY, email text NOT NULL UNIQUE);
      CREATE TABLE eventos(id uuid PRIMARY KEY, title text NOT NULL,
        total_inscriptos integer, total_asistieron integer, luma_csv_imported_at timestamptz);
      CREATE TABLE inscripciones_evento(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id uuid, evento_id uuid REFERENCES eventos, registered_at timestamptz DEFAULT now(),
        asistio boolean DEFAULT false, asistio_at timestamptz, UNIQUE(usuario_id,evento_id));`);
    for (const path of ['supabase-setup-member-accounts.sql',
      'supabase/migrations/202609170000_member_access.sql',
      'supabase/migrations/202609170001_xplora_points.sql',
      'supabase/migrations/202609170002_points_crm_privileges.sql']) {
      await db.exec(await readFile(new URL('../../' + path, import.meta.url), 'utf8'));
    }
    await db.query("INSERT INTO usuarios VALUES($1,'csv@example.test')", [userId]);
    await db.query("INSERT INTO eventos(id,title) VALUES($1,'CSV fixture')", [eventId]);
    await db.query("INSERT INTO xp_events(event_id,starts_at,tier,base_points) VALUES($1,now()-interval '1 day','large',40)", [eventId]);
    await db.query("INSERT INTO member_accounts(id,email,usuario_id,email_confirmed_at) VALUES($1,'csv@example.test',$2,now())", [memberId, userId]);

    // Adapt only the controller's REST transport. Attendance, constraints, triggers and
    // ledger writes run against the real migration SQL, not a mocked Points service.
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (!request.url.startsWith(config.supabaseUrl + '/')) return nativeFetch(input, init);
      assert.equal(request.headers.get('authorization'), 'Bearer fixture-service-role');
      const url = new URL(request.url);
      const table = url.pathname.replace('/rest/v1/', '');
      if (table === 'usuarios' && request.method === 'GET') {
        return Response.json((await db.query('SELECT id,email FROM usuarios WHERE id=$1', [userId])).rows);
      }
      if (table === 'eventos' && request.method === 'GET') return Response.json({ id: eventId });
      if (table === 'eventos' && request.method === 'PATCH') {
        const body = await request.json() as Record<string, unknown>;
        await db.query('UPDATE eventos SET total_inscriptos=$2,total_asistieron=$3,luma_csv_imported_at=$4 WHERE id=$1',
          [eventId, body.total_inscriptos, body.total_asistieron, body.luma_csv_imported_at]);
        return new Response(null, { status: 204 });
      }
      assert.equal(table, 'inscripciones_evento');
      assert.equal(url.searchParams.get('evento_id'), request.method === 'POST' ? null : 'eq.' + eventId);
      if (request.method === 'GET') {
        return Response.json((await db.query('SELECT * FROM inscripciones_evento WHERE evento_id=$1', [eventId])).rows);
      }
      if (request.method === 'HEAD') {
        const attendedOnly = url.searchParams.get('asistio') === 'eq.true';
        const result = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM inscripciones_evento WHERE evento_id=$1 AND (NOT $2::boolean OR asistio)', [eventId, attendedOnly]);
        return new Response(null, { headers: { 'content-range': '*/' + result.rows[0].count } });
      }
      if (request.method === 'POST') {
        const rows = await request.json() as Record<string, unknown>[];
        for (const row of rows) {
          assert.equal(row.evento_id, eventId);
          assert.equal(row.usuario_id, userId);
          await db.query('INSERT INTO inscripciones_evento(usuario_id,evento_id,asistio,asistio_at,registered_at) VALUES($1,$2,$3,$4,$5)',
            [row.usuario_id, row.evento_id, row.asistio, row.asistio_at, row.registered_at]);
        }
        return new Response(null, { status: 201 });
      }
      assert.equal(request.method, 'PATCH');
      assert.equal(url.searchParams.get('usuario_id'), 'in.(' + userId + ')');
      const row = await request.json() as Record<string, unknown>;
      assert.equal(row.asistio, true);
      await db.query('UPDATE inscripciones_evento SET asistio=$3,asistio_at=$4 WHERE evento_id=$1 AND usuario_id=$2',
        [eventId, userId, row.asistio, row.asistio_at]);
      return new Response(null, { status: 204 });
    };

    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const upload = async (csv: string) => {
      const form = new FormData();
      form.append('csv', new Blob([csv]), 'attendance.csv');
      const response = await nativeFetch(`http://127.0.0.1:${address.port}/events/${eventId}/import`, { method: 'POST', body: form });
      const body = await response.json() as Record<string, unknown>;
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    const awards = async () => (await db.query<{
      amount: string;
      metadata: { base: number; multiplier: number; commitment: number; consecutive: number };
    }>(
      'SELECT amount::text,metadata FROM xp_ledger WHERE member_id=$1 AND source=$2', [memberId, 'event:' + eventId])).rows;
    const streak = async () => (await db.query<{ commitment: number; consecutive: number }>(
      'SELECT commitment,consecutive FROM xp_members WHERE member_id=$1', [memberId])).rows[0];

    await upload('email\ncsv@example.test');
    assert.deepEqual(await awards(), []);
    assert.deepEqual(await streak(), { commitment: 0, consecutive: 0 });
    await upload('email,asistio\ncsv@example.test,no');
    assert.deepEqual(await awards(), []);
    assert.deepEqual(await streak(), { commitment: 0, consecutive: 0 });
    const result = await upload('email,asistio\ncsv@example.test,si\nCSV@example.test,si');
    assert.equal(result.emails_procesados, 1);
    assert.equal(result.total_asistieron_evento, 1);
    assert.deepEqual(await awards(), [{
      amount: '40',
      metadata: { base: 40, multiplier: 1, commitment: 1, consecutive: 1 },
    }]);
    assert.deepEqual(await streak(), { commitment: 1, consecutive: 1 });
    await upload('email,asistio\ncsv@example.test,si');
    await upload('email\ncsv@example.test');
    assert.equal((await awards()).length, 1);
    assert.deepEqual(await streak(), { commitment: 1, consecutive: 1 });
    // Closing finalizes absences/streaks; it does not award the same attendance twice.
    await db.query('UPDATE xp_events SET closed=true WHERE event_id=$1', [eventId]);
    await upload('email,asistio\ncsv@example.test,si');
    assert.equal((await awards()).length, 1);
    assert.deepEqual(await streak(), { commitment: 1, consecutive: 1 });
    assert.equal((await db.query<{ total: number }>('SELECT total_asistieron AS total FROM eventos WHERE id=$1', [eventId])).rows[0].total, 1);
  } finally {
    globalThis.fetch = nativeFetch;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.close();
  }
});
