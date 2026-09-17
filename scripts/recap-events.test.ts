import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRecapEvents, type RecapCatalogRequest } from '../src/lib/recapEvents';

const now = new Date(2026, 8, 16, 12);
const signal = () => new AbortController().signal;
const upcoming = { id: 'next', title: 'Próximo encuentro', date_display: '22 de septiembre de 2026', day: '22', month: 'SEP', realizado: false, registration_link: 'https://lu.ma/next' };
const archive = { id: 'past', title: 'Charla anterior', date_display: '10 de junio', recording_link: 'https://youtube.com/watch?v=archive' };

function catalog(events: unknown, talks: unknown = [archive]) {
  const calls: string[] = [];
  const request: RecapCatalogRequest = async path => {
    calls.push(path);
    return Response.json(path.endsWith('/eventos') ? events : talks);
  };
  return { request, calls };
}

test('one upcoming event replaces the entire archive without fetching old talks', async () => {
  const { request, calls } = catalog([upcoming]);
  const result = await loadRecapEvents(request, signal(), now);
  assert.deepEqual(result.map(event => [event.id, event.kind, event.href]), [['next', 'upcoming', 'https://lu.ma/next']]);
  assert.deepEqual(calls, ['/api/public/eventos']);
});

test('only an empty upcoming catalog enables the archive fallback', async () => {
  const { request, calls } = catalog([]);
  const result = await loadRecapEvents(request, signal(), now);
  assert.deepEqual(result.map(event => [event.id, event.kind]), [['past', 'archive']]);
  assert.deepEqual(calls, ['/api/public/eventos', '/api/public/charlas']);
});

test('past dates without a year and completed events cannot come back as next year events', async () => {
  const { request, calls } = catalog([
    { ...upcoming, id: 'past-date', date_display: '11 de septiembre', day: '11' },
    { ...upcoming, id: 'done', realizado: true },
    { ...upcoming, id: '95b3d91e-f68b-4c73-a28d-7b739f491867' },
  ]);
  const result = await loadRecapEvents(request, signal(), now);
  assert.deepEqual(result.map(event => event.kind), ['archive']);
  assert.equal(calls.length, 2);
});

test('upcoming events are ordered by date, deduplicated, and retain undated announcements last', async () => {
  const { request } = catalog([
    { ...upcoming, id: 'later', date_display: '10 de enero de 2027', day: '10', month: 'ENE' },
    { ...upcoming, id: 'undated', date_display: 'Fecha a confirmar', day: '', month: '' },
    upcoming,
    upcoming,
    { ...upcoming, id: 'today', date_display: '16 de septiembre de 2026', day: '16' },
  ]);
  const result = await loadRecapEvents(request, signal(), now);
  assert.deepEqual(result.map(event => event.id), ['today', 'next', 'later', 'undated']);
  assert.ok(result.every(event => event.kind === 'upcoming'));
});

test('a failed upcoming request must not pretend there are no new events and show the archive', async () => {
  const calls: string[] = [];
  const request: RecapCatalogRequest = async path => { calls.push(path); return new Response(null, { status:503 }); };
  await assert.rejects(loadRecapEvents(request, signal(), now), /upcoming/);
  assert.deepEqual(calls, ['/api/public/eventos']);
});

test('complete ISO and numeric dates entered without separate day/month fields still exclude past events', async () => {
  const { request } = catalog([
    { ...upcoming, id: 'past-iso', date_display: '2026-09-11', day: '', month: '' },
    { ...upcoming, id: 'past-numeric', date_display: '11/09/2026', day: '', month: '' },
    { ...upcoming, id: 'numeric-next', date_display: '23/09/2026', day: '', month: '' },
    { ...upcoming, id: 'iso-next', date_display: '2026-09-22', day: '', month: '' },
  ]);
  assert.deepEqual((await loadRecapEvents(request, signal(), now)).map(event => event.id), ['iso-next', 'numeric-next']);
});
