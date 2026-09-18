import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seal, unseal } from '../src/services/google-central/security.js';
import { GoogleApi } from '../src/services/google-central/api.js';
import { authorizationUrl, exchangeToken } from '../src/services/google-central/oauth.js';
import { ingestPage } from '../src/services/google-central/sync.js';
import { startGoogleWorker } from '../src/services/google-central/worker.js';
import { getAppConfig } from '../src/config/env.js';

test('Google credentials are authenticated-encrypted, randomized and bound to purpose', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const a = seal('private-fixture', key, 'refresh');
  assert.ok(!a.includes('private-fixture'));
  assert.notEqual(a, seal('private-fixture', key, 'refresh'));
  assert.equal(unseal(a, key, 'refresh'), 'private-fixture');
  assert.throws(() => unseal(a, key, 'state'));
  assert.throws(() => unseal(a, Buffer.alloc(32, 8).toString('base64'), 'refresh'));
  assert.throws(() => seal('private-fixture', 'weak', 'refresh'));
});

test('worker never starts without explicit enablement (safe local/production coexistence)', async () => {
  let calls = 0;
  const stop = startGoogleWorker({...getAppConfig(), googleForms:null},async()=>{ calls++; });
  await new Promise(resolve=>setTimeout(resolve,5));
  stop(); assert.equal(calls,0);
});

test('failed persistence never advances the cursor and provider failures never expose credentials', async () => {
  let checkpointed=false;
  const api=new GoogleApi(async input=>String(input).includes('/responses?') ? Response.json({responses:[]}) : Response.json({
    formId:'fixture',info:{title:'Test'},settings:{emailCollectionType:'VERIFIED'},responderUri:'https://docs.google.com/forms/d/e/fixture/viewform'}));
  const result=await ingestPage({formId:'fixture',since:'2026-09-17T00:00:00Z'},'private-test-token',api,{
    async enqueue(){throw new Error('private-test-token');},async checkpoint(){checkpointed=true;},
  },'2026-09-18T00:00:00Z');
  assert.equal(result.success,false);assert.equal(checkpointed,false);
  assert.ok(!JSON.stringify(result).includes('private-test-token'));
  for(const status of [401,403,429,500]){
    const failed=await new GoogleApi(async()=>new Response('private-test-token',{status})).inspect('https://docs.google.com/forms/d/fixture/edit','private-test-token');
    assert.equal(failed.success,false);assert.ok(!JSON.stringify(failed).includes('private-test-token'));
  }
});

test('polling persists only response metadata before advancing pagination, preserving first submission time', async () => {
  const calls: string[] = [];
  const result = await ingestPage({ formId: 'fixture', since: '2026-09-17T00:00:00.000Z' }, 'token',
    new GoogleApi(async input => {
      const url = new URL(String(input));
      if (!url.pathname.endsWith('/responses')) return Response.json({ formId:'fixture',info:{title:'Test'},
        settings:{emailCollectionType:'VERIFIED'},responderUri:'https://docs.google.com/forms/d/e/fixture/viewform' });
      assert.ok(!url.searchParams.get('fields')?.includes('answers'));
      return Response.json({ nextPageToken:'next', responses:[{responseId:'r1',respondentEmail:'member@example.test',
        createTime:'2026-09-17T01:00:00Z',lastSubmittedTime:'2026-09-18T01:00:00Z',answers:{sensitive:'ignored'}}] });
    }), {
      async enqueue(rows) { assert.equal(rows[0].submitted_at, '2026-09-17T01:00:00Z'); assert.ok(!JSON.stringify(rows).includes('ignored')); calls.push('persist'); },
      async checkpoint(page, since) { assert.equal(page,'next'); assert.equal(since,'2026-09-17T00:00:00.000Z'); calls.push('checkpoint'); },
    }, '2026-09-18T02:00:00.000Z');
  assert.equal(result.success,true); assert.deepEqual(calls,['persist','checkpoint']);
});

test('OAuth requests offline readonly access and rejects partial permissions without leaking tokens', async () => {
  const config = { clientId: 'fixture', clientSecret: 'private', redirectUri: 'http://127.0.0.1:8788/api/integrations/points/google/callback',
    encryptionKey: Buffer.alloc(32).toString('base64'), accountEmail: 'owner@example.test', workerEnabled: false };
  const url = new URL(authorizationUrl(config, 'state-value', 'challenge'));
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('state'), 'state-value');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const result = await exchangeToken(config, { code: 'code', verifier: 'verifier' }, async () => Response.json({
    access_token: 'sensitive', refresh_token: 'sensitive-refresh', scope: 'email' }));
  assert.equal(result.success, false);
  assert.ok(!JSON.stringify(result).includes('sensitive'));
});

test('central adapter only accepts editable Forms URLs and VERIFIED email collection', async () => {
  const calls: string[] = [];
  const api = new GoogleApi(async input => {
    calls.push(String(input));
    return Response.json({ formId: 'fixture', info: { title: 'Encuesta' },
      settings: { emailCollectionType: 'VERIFIED' }, responderUri: 'https://docs.google.com/forms/d/e/fixture/viewform' });
  });
  const result = await api.inspect('https://docs.google.com/forms/d/fixture/edit#settings', 'token');
  assert.equal(result.success, true);
  assert.ok(calls[0].startsWith('https://forms.googleapis.com/v1/forms/fixture?'));
  assert.equal((await api.inspect('https://evil.test/forms/d/fixture/edit', 'token')).success, false);
  assert.equal(calls.length, 1);
  const insecure = new GoogleApi(async () => Response.json({ formId: 'fixture', info: { title: 'Test' },
    settings: { emailCollectionType: 'RESPONDER_INPUT' }, responderUri: 'https://docs.google.com/forms/d/e/fixture/viewform' }));
  const rejected = await insecure.inspect('https://docs.google.com/forms/d/fixture/edit', 'token');
  assert.equal(rejected.success, false);
  if (!rejected.success) assert.equal(rejected.error.code, 'EMAIL_NOT_VERIFIED');
});
