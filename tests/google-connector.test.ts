import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { googleConnectorScript } from '../src/lib/googleFormsConnector.js';

test('Google script rejects non-HTTPS destinations and queues a verified response before delivery', () => {
  const config = { id: 'task', formId: 'form', connectorSecret: 'fixture-secret', apiOrigin: 'http://localhost:8788' };
  assert.throws(() => googleConnectorScript(config), /HTTPS/);
  const properties = new Map<string, string>();
  const store = { setProperty: (key: string, value: string) => properties.set(key, value),
    getProperties: () => Object.fromEntries(properties), deleteProperty: (key: string) => properties.delete(key) };
  let sent = false;
  const sandbox = {
    PropertiesService: { getScriptProperties: () => store },
    ScriptApp: { getOAuthToken: () => 'fixture-oauth' },
    UrlFetchApp: { fetch: (url: string) => {
      if (url.startsWith('https://forms.googleapis.com/')) return { getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ settings: { emailCollectionType: 'VERIFIED' }, responderUri: 'https://docs.google.com/forms/d/e/form/viewform' }) };
      assert.equal(properties.size, 1, 'receipt persisted before network call'); sent = true;
      return { getResponseCode: () => 503 };
    } },
  };
  runInNewContext(googleConnectorScript({ ...config, apiOrigin: 'https://api.example.test' }) + `
    xploraOnSubmit({source:{getId:()=>"form"},response:{getId:()=>"r1",getRespondentEmail:()=>"member@example.test",getTimestamp:()=>new Date()}});`, sandbox);
  assert.equal(sent, true);
  assert.equal(properties.size, 1, 'failed deliveries remain available for retry');
});
