import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE usuarios(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE);
    CREATE TABLE inscripciones_evento(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    GRANT ALL ON usuarios,inscripciones_evento TO anon,authenticated;`);
  await db.exec(await readFile(new URL("../../supabase-setup-member-accounts.sql", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../../supabase/migrations/202609170000_member_access.sql", import.meta.url), "utf8").catch(() => "");
  if (migration) await db.exec(migration);
});

test("access is private, expiring, single-use, bounded to five code attempts and safe to reapply", async () => {
  const id = "71000000-0000-4000-8000-000000000001";
  const next = "71000000-0000-4000-8000-000000000002";
  await db.query("SELECT xp_issue_access($1,'security@example.test','correct','magic')", [id]);
  const cooldown = (await db.query<{ value: { id: string; issued: boolean } }>("SELECT xp_issue_access($1,' SECURITY@example.test ','other','other-link') AS value", [next])).rows[0].value;
  assert.deepEqual(cooldown, { id, issued: false });
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await db.query<{ id: string | null }>("SELECT xp_consume_access($1,'incorrect',false) AS id", [id])).rows[0].id, null);
  }
  assert.equal((await db.query<{ id: string | null }>("SELECT xp_consume_access($1,'correct',false) AS id", [id])).rows[0].id, null);
  assert.ok((await db.query<{ id: string | null }>("SELECT xp_consume_access($1,'magic',true) AS id", [id])).rows[0].id);
  assert.equal((await db.query<{ id: string | null }>("SELECT xp_consume_access($1,'magic',true) AS id", [id])).rows[0].id, null);
  // A consumed challenge must not prevent an immediate new sign-in.
  const retry = (await db.query<{ value: { issued: boolean } }>("SELECT xp_issue_access($1,'security@example.test','next','next-magic') AS value", [next])).rows[0].value;
  assert.equal(retry.issued, true);
  await db.query("UPDATE xp_access SET expires_at=now()-interval '1 second' WHERE id=$1", [next]);
  assert.equal((await db.query<{ id: string | null }>("SELECT xp_consume_access($1,'next-magic',true) AS id", [next])).rows[0].id, null);
  for (const role of ["anon", "authenticated"]) {
    const access = (await db.query<{ table_read: boolean; rpc_call: boolean }>("SELECT has_table_privilege($1,'public.xp_access','SELECT') AS table_read,has_function_privilege($1,'public.xp_consume_access(uuid,text,boolean)','EXECUTE') AS rpc_call", [role])).rows[0];
    assert.deepEqual(access, { table_read: false, rpc_call: false });
  }
  await db.exec(await readFile(new URL("../../supabase/migrations/202609170000_member_access.sql", import.meta.url), "utf8"));
  assert.equal((await db.query("SELECT id FROM xp_access WHERE id=$1", [id])).rows.length, 1);
});
after(() => db.close());
beforeEach(() => db.exec("TRUNCATE public.member_accounts, public.xp_access"));

test("standalone access creates a verified account or reuses it, without Points or CRM writes", async () => {
  const first = "70000000-0000-4000-8000-000000000001";
  const second = "70000000-0000-4000-8000-000000000002";
  await db.query("SELECT xp_issue_access($1,'member@example.test','code-hash','link-hash')", [first]);
  assert.equal((await db.query("SELECT id FROM member_accounts")).rows.length, 0);
  const created = (await db.query<{ id: string }>("SELECT xp_consume_access($1,'code-hash',false) AS id", [first])).rows[0].id;
  assert.ok(created);
  await db.query("UPDATE member_accounts SET display_name='Existing member',first_name='Alex' WHERE id=$1", [created]);
  await db.query("UPDATE xp_access SET created_at=now()-interval '3 minutes' WHERE id=$1", [first]);
  await db.query("SELECT xp_issue_access($1,'member@example.test','second-code','second-link')", [second]);
  assert.equal((await db.query<{ id: string }>("SELECT xp_consume_access($1,'second-link',true) AS id", [second])).rows[0].id, created);
  const accounts = (await db.query<{ first_name: string; confirmed: boolean }>("SELECT first_name,email_confirmed_at IS NOT NULL AS confirmed FROM member_accounts")).rows;
  assert.deepEqual(accounts, [{ first_name: "Alex", confirmed: true }]);
  assert.equal((await db.query("SELECT id FROM usuarios")).rows.length, 0);
  assert.equal((await db.query("SELECT id FROM inscripciones_evento")).rows.length, 0);
  assert.equal((await db.query<{ enabled: boolean }>("SELECT to_regclass('public.xp_ledger') IS NOT NULL AS enabled")).rows[0].enabled, false);
  assert.equal((await db.query<{ allowed: boolean }>("SELECT has_table_privilege('anon','usuarios','INSERT') AS allowed")).rows[0].allowed, true);
});
