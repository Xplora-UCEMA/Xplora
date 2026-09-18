import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE usuarios(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text NOT NULL UNIQUE);
    CREATE TABLE eventos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL);
    CREATE TABLE inscripciones_evento(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),usuario_id uuid,
      evento_id uuid REFERENCES eventos,registered_at timestamptz DEFAULT now(),asistio boolean DEFAULT false,UNIQUE(usuario_id,evento_id));`);
  for (const file of ['supabase-setup-member-accounts.sql', ...['000_member_access', '001_xplora_points',
    '002_points_crm_privileges', '003_google_forms_tasks', '004_google_forms_central'].map(name => `supabase/migrations/202609170${name}.sql`)]) {
    const sql = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    await db.exec(sql);
  }
});
test('central connections cannot be accidentally replaced by a legacy script; only one worker owns the lease', async () => {
  await db.query("INSERT INTO xp_google_account(id,email,refresh_cipher) VALUES(true,'owner@example.test','encrypted') ON CONFLICT(id) DO NOTHING");
  const id=(await db.query<{id:string}>(`SELECT xp_create_central_task('Guard',5,1,now()+interval '1 day',null,
    'guard-fixture','https://docs.google.com/forms/d/e/fixture/viewform','guard-secret','guard-token') AS id`)).rows[0].id;
  await assert.rejects(db.query("SELECT xp_rotate_google_secret($1,'legacy-replacement')",[id]),/central/);
  const a='90000000-0000-4000-8000-000000000001',b='90000000-0000-4000-8000-000000000002';
  const lease=async(owner:string)=>(await db.query<{ok:boolean}>('SELECT xp_google_lease($1) AS ok',[owner])).rows[0].ok;
  assert.equal(await lease(a),true); assert.equal(await lease(b),false); assert.equal(await lease(a),true);
  await db.query("UPDATE xp_google_worker SET lease_until=now()-interval '1 minute'");
  assert.equal(await lease(b),true);
});
after(() => db.close());
test('central task is created connected and active atomically; private OAuth state is single use', async () => {
  await db.query("INSERT INTO xp_google_account(id,email,refresh_cipher) VALUES(true,'owner@example.test','encrypted') ON CONFLICT(id) DO NOTHING");
  const result = await db.query<{id: string}>(`SELECT xp_create_central_task('Task',5,1,now()+interval '1 day',null,
    'central-fixture','https://docs.google.com/forms/d/e/fixture/viewform','secret-hash','token-hash') AS id`);
  const row = (await db.query<{active: boolean; mode: string; activated_at: string}>(
    'SELECT a.active,f.mode,f.activated_at FROM xp_actions a JOIN xp_google_forms f ON f.action_id=a.id WHERE a.id=$1', [result.rows[0].id])).rows[0];
  assert.equal(row.active, true); assert.equal(row.mode, 'oauth'); assert.ok(row.activated_at);
  await db.query("INSERT INTO xp_google_oauth_states(state_hash,browser_hash,verifier_cipher) VALUES('state','browser','cipher')");
  assert.equal((await db.query("DELETE FROM xp_google_oauth_states WHERE state_hash='state' AND browser_hash='wrong' RETURNING *")).rows.length, 0);
  assert.equal((await db.query("DELETE FROM xp_google_oauth_states WHERE state_hash='state' AND browser_hash='browser' RETURNING *")).rows.length, 1);
  assert.equal((await db.query("DELETE FROM xp_google_oauth_states WHERE state_hash='state' AND browser_hash='browser' RETURNING *")).rows.length, 0);
  for (const table of ['xp_google_account', 'xp_google_oauth_states', 'xp_google_inbox', 'xp_google_worker']) {
    assert.equal((await db.query<{allowed:boolean}>("SELECT has_table_privilege('anon',$1,'SELECT') AS allowed", [table])).rows[0].allowed, false);
    assert.equal((await db.query<{allowed:boolean}>("SELECT has_table_privilege('authenticated',$1,'SELECT') AS allowed", [table])).rows[0].allowed, false);
  }
});
