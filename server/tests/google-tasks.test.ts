import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSurveyTasks } from '../src/services/points-tasks.service.js';

test('Google tasks expose only connected active forms and never a direct claim capability', () => {
  const form = { id: 'form', title: 'Encuesta', kind: 'google_form', points: 30, event_id: null,
    active: true, expires_at: '2099-01-01', max_claims: 10, xp_claims: [{ count: 0 }],
    xp_google_forms: { responder_url: 'https://docs.google.com/forms/d/e/fixture/viewform', connected_at: '2026-01-01' } };
  const tasks = buildSurveyTasks([form], [], [], Date.now());
  assert.equal(tasks[0]?.kind, 'google_form');
  assert.equal(tasks[0]?.href, form.xp_google_forms.responder_url);
  assert.equal(buildSurveyTasks([{ ...form, active: false }], [], [], Date.now()).length, 0);
  assert.equal(buildSurveyTasks([{ ...form, xp_google_forms: { ...form.xp_google_forms, connected_at: null } }], [], [], Date.now()).length, 0);
  assert.equal(buildSurveyTasks([{ ...form, event_id: 'event' }], [], [], Date.now()).length, 0);
});
