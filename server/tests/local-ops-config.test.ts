import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frontendEnvironment } from '../src/config/local-ops.js';
test('local Ops receives only public Supabase configuration and a central proxy destination',()=>{
  const env=frontendEnvironment({PATH:'fixture-path',SERVER_PRIVATE_KEY:'must-not-propagate'},'https://project.supabase.co','public-anon');
  assert.equal(env.VITE_SUPABASE_URL,'https://project.supabase.co');
  assert.equal(env.VITE_SUPABASE_KEY,'public-anon');
  assert.equal(env.GOOGLE_FORMS_API_ORIGIN,'https://xplora-production.up.railway.app');
  assert.equal(env.SERVER_PRIVATE_KEY,undefined);
  assert.equal(env.API_PORT,'8788');
});
