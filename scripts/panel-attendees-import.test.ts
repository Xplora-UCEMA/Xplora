import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMemberFilters, buildFilterSnapshot } from '../src/lib/memberListFilters.js';
import { applyMemberFilterSnapshot } from '../server/src/services/member-row-filter.service.js';
import type { AdminMemberRowDTO } from '../server/src/services/admin-member-rows.service.js';
import * as XLSX from 'xlsx';
import { mergeGuestsByEmail, parseLumaCsvFile } from '../server/src/services/luma-csv-import.service.js';
import { parseUsuariosFileBuffer, upsertUsuariosFromCsv } from '../server/src/services/usuarios-csv-import.service.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createAdminLumaCsvImportHandler } from '../server/src/http/controllers/admin-luma-csv.controller.js';
import { uploadSingleSpreadsheet } from '../server/src/http/middleware/upload.middleware.js';
import type { AppConfig } from '../server/src/config/env.js';

test('event attendee lists exclude registrations without attendance and attendance at other events', () => {
  const member = (id: string, evento_id: string, asistio: boolean): AdminMemberRowDTO => ({
    id, nombre: id, email: `${id}@example.com`, carrera: 'Economía', es_alumno_cema: true,
    eventos_inscripto: 1, eventos_asistio: asistio ? 1 : 0, pct_asistencia: asistio ? 100 : 0,
    created_at: null, updated_at: null, usuario_eventos_anotado: 1, usuario_eventos_asistio: asistio ? 1 : 0,
    inscripciones: [{ evento_id, title: 'Evento', asistio, registered_at: '2026-09-11' }],
  });
  const rows = [member('asistente', 'startup-day', true), member('inscripto', 'startup-day', false), member('otro', 'otro-evento', true)];
  const filter = { attendee_event_id: 'startup-day' };
  assert.deepEqual(applyMemberFilters(rows, filter).map(r => r.id), ['asistente']);
  assert.deepEqual(applyMemberFilterSnapshot(rows, filter).map(r => r.id), ['asistente']);
  assert.deepEqual(applyMemberFilters(rows, { ...filter, email_contains: 'otro' }), []);
  assert.equal(buildFilterSnapshot('', '', '', '', '', 'startup-day').attendee_event_id, 'startup-day');
  assert.equal(applyMemberFilters(rows, {}).length, 3);
});

test('multipart event import keeps existing attendance and totals when importing an additional file', async t => {
  const users = [{ id: 'ana', email: 'ana@example.com' }];
  const registrations = [{ id: 'old', usuario_id: 'ana', evento_id: 'evento', asistio: true, asistio_at: '2026-09-11', registered_at: '2026-09-11' }];
  let totals: Record<string, unknown> = {};
  const database = express();
  database.use(express.json());
  database.all('/rest/v1/:table', (req, res) => {
    const table = req.params.table;
    if (table === 'eventos') {
      if (req.method === 'PATCH') { totals = req.body; res.status(204).end(); }
      else res.json([{ id: 'evento' }]);
      return;
    }
    if (table === 'usuarios') {
      if (req.method === 'POST') { const row = { ...req.body, id: 'bruno' }; users.push(row); res.json(row); }
      else res.json(users.filter(row => !req.query.email || `eq.${row.email}` === req.query.email));
      return;
    }
    if (table === 'inscripciones_evento') {
      if (req.method === 'POST') { registrations.push({ ...req.body, id: 'new' }); res.status(201).end(); return; }
      if (req.method === 'PATCH') { Object.assign(registrations.find(row => `eq.${row.id}` === req.query.id)!, req.body); res.status(204).end(); return; }
      const rows = registrations.filter(row => (!req.query.usuario_id || `eq.${row.usuario_id}` === req.query.usuario_id) && (!req.query.asistio || `eq.${row.asistio}` === req.query.asistio));
      res.set('Content-Range', `0-${Math.max(0, rows.length - 1)}/${rows.length}`);
      res.json(rows);
      return;
    }
    res.status(404).json({ message: 'Unexpected test table' });
  });
  const dbServer = database.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => dbServer.once('listening', resolve));
  t.after(() => { dbServer.closeAllConnections(); dbServer.close(); });
  const config = { supabaseUrl: `http://127.0.0.1:${(dbServer.address() as AddressInfo).port}`, supabaseAnonKey: 'test-only' } as AppConfig;
  const api = express();
  api.post('/import/:eventoId', uploadSingleSpreadsheet, createAdminLumaCsvImportHandler(config));
  api.use((error: { statusCode?: number; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.statusCode ?? 500).json({ error: error.message }); });
  const apiServer = api.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => apiServer.once('listening', resolve));
  t.after(() => { apiServer.closeAllConnections(); apiServer.close(); });
  const form = new FormData();
  form.append('csv', new Blob(['Email,Nombre,Asistió\nana@example.com,Ana,No\nbruno@example.com,Bruno,Sí']), 'participantes.csv');
  const response = await fetch(`http://127.0.0.1:${(apiServer.address() as AddressInfo).port}/import/evento`, { method: 'POST', headers: { Authorization: 'Bearer test-only' }, body: form });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(registrations[0].asistio, true);
  assert.equal(registrations[1].asistio, true);
  assert.equal(totals.total_asistieron, 2);
  assert.equal(result.total_asistieron_evento, 2);
});

test('email-only imports provide required names and preserve existing profile and newsletter preferences', async () => {
  const saved: Record<string, unknown>[] = [];
  const previous = { email: 'ana@example.com', nombre: 'Ana Pérez', carrera: 'Economía', es_alumno_cema: true, suscrito_newsletter: false };
  const sb = { from: () => ({
    select: (columns: string) => ({ in: async () => ({ data: [Object.fromEntries(columns.split(',').map(key => [key.trim(), previous[key.trim() as keyof typeof previous]]))], error: null }) }),
    upsert: async (rows: Record<string, unknown>[]) => { saved.push(...rows); return { error: null }; },
  }) } as unknown as SupabaseClient;
  const parsed = parseUsuariosFileBuffer(Buffer.from('email\nana@example.com\nnuevo@example.com'));
  const result = await upsertUsuariosFromCsv(sb, parsed.rows);
  assert.equal(result.inserted, 1);
  assert.deepEqual(saved[0], previous);
  assert.equal(saved[1].nombre, 'Nuevo');
});

test('CSV preserves quoted names, accents, negative attendance and Luma check-ins', () => {
  for (const separator of [',', ';', '\t']) {
    const text = '\uFEFF' + [
      ['Nombre completo', 'Correo electrónico', 'Asistió'],
      ['"Pérez, Ana"', 'ana@example.com', 'Sí'],
      ['"Bruno\nDíaz"', 'bruno@example.com', 'No'],
      ['Carla', 'carla@example.com', 'No asistió'],
    ].map(row => row.join(separator)).join('\r\n');
    const result = parseLumaCsvFile(Buffer.from(text), { filename: 'asistentes.csv' });
    assert.equal(result.guests.length, 3);
    assert.equal(result.guests[0].nombre, 'Pérez, Ana');
    assert.equal(result.guests[1].nombre, 'Bruno\nDíaz');
    assert.deepEqual(result.guests.map(row => row.kind), ['checked_in', 'going', 'going']);
    assert.equal(parseUsuariosFileBuffer(Buffer.from(text)).rows.length, 3);
  }
  const luma = Buffer.from('email,first_name,last_name,checked_in_at,approval_status\nana@example.com,Ana,Pérez,2026-09-11T16:30:00Z,approved\nana@example.com,Ana,Pérez,,approved\nbruno@example.com,Bruno,Díaz,false,approved\ncarla@example.com,Carla,Díaz,,declined');
  assert.deepEqual([...mergeGuestsByEmail(parseLumaCsvFile(luma).guests).values()].map(r => [r.nombre, r.kind]), [['Ana Pérez', 'checked_in'], ['Bruno Díaz', 'going']]);
  const plain = Buffer.from('Email,Nombre\nana@example.com,Ana');
  assert.equal(parseLumaCsvFile(plain).guests[0].kind, 'going');
  assert.equal(parseLumaCsvFile(plain, { attendanceMode: 'attended' }).guests[0].kind, 'checked_in');
});

test('imports ordinary Excel workbooks with a title row, Spanish columns and explicit attendance', () => {
  for (const bookType of ['xlsx', 'xls'] as const) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Acreditación Startup Day'], [],
      ['Nombre', 'Apellido', 'Dirección de correo electrónico', 'Asistió'],
      ['Ana', 'Pérez', 'ANA@example.com', 'Sí'],
      ['Bruno', 'Díaz', 'bruno@example.com', 'No'],
    ]), 'Asistentes');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType });
    const result = parseLumaCsvFile(buffer, { filename: `participantes.${bookType}` });
    assert.deepEqual(result.guests.map(({ email, nombre, kind }) => ({ email, nombre, kind })), [
      { email: 'ana@example.com', nombre: 'Ana Pérez', kind: 'checked_in' },
      { email: 'bruno@example.com', nombre: 'Bruno Díaz', kind: 'going' },
    ]);
    const usuarios = parseUsuariosFileBuffer(buffer, { filename: `participantes.${bookType}` });
    assert.deepEqual(usuarios.rows.map(r => r.nombre), ['Ana Pérez', 'Bruno Díaz']);
  }
});
