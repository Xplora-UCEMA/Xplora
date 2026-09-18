import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEventTasks, buildSurveyTasks } from '../src/services/points-tasks.service.js';

test('Tasks only offers safe registration links for future open events and keeps past attendance visible', () => {
  const future = { event_id: 'future', starts_at: '2027-01-01T12:00:00Z', base_points: 20, closed: false,
    eventos: { title: 'Encuentro', registration_link: 'https://lu.ma/example', realizado: false } };
  const tasks = buildEventTasks([
    future,
    { ...future, event_id: 'past', starts_at: '2020-01-01T12:00:00Z' },
    { ...future, event_id: 'unsafe', eventos: { ...future.eventos, registration_link: 'javascript:alert(1)' } },
    { ...future, event_id: 'archived', eventos: { ...future.eventos, realizado: true } },
  ], [{ evento_id: 'past', asistio: true }], Date.parse('2026-09-17T12:00:00Z'));
  assert.equal(tasks.find(t => t.id === 'future')?.href, 'https://lu.ma/example');
  assert.equal(tasks.find(t => t.id === 'past')?.href, null);
  assert.equal(tasks.find(t => t.id === 'past')?.status, 'completed');
  assert.equal(tasks.find(t => t.id === 'unsafe')?.href, null);
  assert.equal(tasks.find(t => t.id === 'archived'), undefined);
});

test('Tasks only exposes unexpired event surveys to verified attendees, never private QR or award capabilities', () => {
  const survey = { id: 'survey', title: 'Encuesta', kind: 'survey', points: 30, event_id: 'past',
    active: true, expires_at: '2027-01-01T00:00:00Z', max_claims: 100, xp_claims: [{ count: 0 }] };
  const tasks = buildSurveyTasks([
    survey, { ...survey, id: 'private', event_id: null }, { ...survey, id: 'qr', kind: 'qr' },
    { ...survey, id: 'award', kind: 'award' }, { ...survey, id: 'expired', expires_at: '2020-01-01' },
    { ...survey, id: 'full', xp_claims: [{ count: 100 }] }, { ...survey, id: 'disabled', active: false },
    { ...survey, id: 'other-event', event_id: 'other' }, { ...survey, id: 'done' },
  ], [{ evento_id: 'past', asistio: true }], ['done'], Date.parse('2026-09-17'));
  assert.deepEqual(tasks.map(t => [t.id, t.status]), [['survey', 'available'], ['done', 'completed']]);
  assert.ok(tasks.every(t => t.href === null));
});
