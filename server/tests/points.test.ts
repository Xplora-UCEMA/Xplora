import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const member = "00000000-0000-4000-8000-000000000001";
const user = "00000000-0000-4000-8000-000000000002";
before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE usuarios(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text NOT NULL UNIQUE);
    CREATE TABLE eventos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL);
    CREATE TABLE inscripciones_evento(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id uuid,
      evento_id uuid REFERENCES eventos, registered_at timestamptz DEFAULT now(), asistio boolean DEFAULT false,
      UNIQUE(usuario_id, evento_id));
    GRANT ALL ON usuarios, inscripciones_evento TO anon, authenticated;`);
  await db.exec(
    await readFile(
      new URL("../../supabase-setup-member-accounts.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(await readFile(new URL("../../supabase/migrations/202609170000_member_access.sql", import.meta.url), "utf8"));
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202609170001_xplora_points.sql",
      import.meta.url,
    ),
    "utf8",
  ).catch(() => "");
  if (migration) await db.exec(migration);
  const privileges = await readFile(new URL("../../supabase/migrations/202609170002_points_crm_privileges.sql", import.meta.url), "utf8").catch(() => "");
  if (privileges) await db.exec(privileges);
  const tasks = await readFile(new URL("../../supabase/migrations/202609170003_google_forms_tasks.sql", import.meta.url), "utf8").catch(() => "");
  if (tasks) await db.exec(tasks);
});
after(() => db.close());

test("Google Forms receipts award once and cannot be claimed with a member token", async () => {
  const mid = '70000000-0000-4000-8000-000000000001';
  const aid = '70000000-0000-4000-8000-000000000002';
  await db.query("INSERT INTO member_accounts(id,email,email_confirmed_at) VALUES($1,'forms@example.test',now()-interval '1 day')", [mid]);
  await db.query(`INSERT INTO xp_actions(id,title,kind,points,token_hash,expires_at,max_claims,created_at,active)
    VALUES($1,'Google fixture','google_form',30,'private-form-token',now()+interval '1 day',1,now()-interval '1 hour',false)`, [aid]);
  await db.query(`INSERT INTO xp_google_forms(action_id,form_id,responder_url,secret_hash,connected_at)
    VALUES($1,'fixture-form','https://docs.google.com/forms/d/e/fixture/viewform','connector-hash',now()-interval '1 hour')`, [aid]);
  await db.query('UPDATE xp_actions SET active=true WHERE id=$1', [aid]);
  await assert.rejects(db.query("SELECT xp_claim($1,'private-form-token')", [mid]), /Google/);
  const claim = () => db.query<{result: {points: number; alreadyClaimed: boolean}}>(
    "SELECT xp_google_claim($1,'fixture-form','response-1','forms@example.test',now(),'connector-hash') AS result", [aid]);
  assert.equal((await claim()).rows[0].result.points, 30);
  assert.equal((await claim()).rows[0].result.alreadyClaimed, true);
  assert.equal((await db.query<{count: number}>("SELECT count(*)::int AS count FROM xp_ledger WHERE member_id=$1 AND source=$2", [mid, 'action:'+aid])).rows[0].count, 1);
});

test('Ops cannot publish an unconnected form or alter an awarded task economy', async () => {
  const created = await db.query<{ id: string }>(`SELECT xp_create_google_task('Borrador',20,5,now()+interval '1 day',null,
    'draft-form',null,'hash-draft','draft-token') AS id`);
  const id = created.rows[0].id;
  await assert.rejects(db.query('UPDATE xp_actions SET active=true WHERE id=$1', [id]), /conectar/);
  await assert.rejects(db.query("UPDATE xp_actions SET points=50 WHERE token_hash='private-form-token'"), /acreditados/);
});

test('Google credentials are checked atomically, including after rotation', async () => {
  const aid = '70000000-0000-4000-8000-000000000002';
  await assert.rejects(db.query("SELECT xp_google_claim($1,'fixture-form','response-2','forms@example.test',now(),'wrong')", [aid]), /Conexión no autorizada/);
  await db.query("SELECT xp_rotate_google_secret($1,'replacement-hash')", [aid]);
  await assert.rejects(db.query("SELECT xp_google_connect($1,'https://docs.google.com/forms/d/e/fixture/viewform','connector-hash')", [aid]), /Conexión no autorizada/);
});

test('a connected draft cannot retroactively award a submission sent before publication', async () => {
  const id = '72000000-0000-4000-8000-000000000002';
  await db.query(`INSERT INTO xp_actions(id,title,kind,points,token_hash,expires_at,max_claims,created_at,active)
    VALUES($1,'Draft timing','google_form',25,'draft-timing-token',now()+interval '1 day',10,now()-interval '1 day',false)`, [id]);
  await db.query(`INSERT INTO xp_google_forms(action_id,form_id,responder_url,secret_hash,connected_at)
    VALUES($1,'draft-timing','https://docs.google.com/forms/d/e/draft/viewform','draft-timing-secret',now()-interval '1 day')`, [id]);
  await db.query('UPDATE xp_actions SET active=true WHERE id=$1', [id]);
  await assert.rejects(db.query("SELECT xp_google_claim($1,'draft-timing','before-publish','forms@example.test',now()-interval '1 hour','draft-timing-secret')", [id]), /período/);
});

test('a timely Google response survives delayed delivery but not a foreign response or quota overflow', async () => {
  const id = '71000000-0000-4000-8000-000000000002';
  const mid = '71000000-0000-4000-8000-000000000003';
  await db.query("INSERT INTO member_accounts(id,email,email_confirmed_at) VALUES($1,'delayed@example.test',now()-interval '2 days')", [mid]);
  await db.query(`INSERT INTO xp_actions(id,title,kind,points,token_hash,expires_at,max_claims,created_at,active)
    VALUES($1,'Delayed','google_form',25,'delayed-token',now()-interval '1 hour',1,now()-interval '1 day',false)`, [id]);
  await db.query(`INSERT INTO xp_google_forms(action_id,form_id,responder_url,secret_hash,connected_at)
    VALUES($1,'delayed-form','https://docs.google.com/forms/d/e/delayed/viewform','delayed-secret',now()-interval '1 day')`, [id]);
  await db.query('UPDATE xp_actions SET active=true WHERE id=$1', [id]);
  // Fixture represents a task published yesterday, expired an hour ago.
  await db.query("UPDATE xp_google_forms SET activated_at=now()-interval '1 day' WHERE action_id=$1", [id]);
  const award = await db.query<{ result: { points: number } }>("SELECT xp_google_claim($1,'delayed-form','late','delayed@example.test',now()-interval '2 hours','delayed-secret') AS result", [id]);
  assert.equal(award.rows[0].result.points, 25);
  await assert.rejects(db.query("SELECT xp_google_claim($1,'delayed-form','late','forms@example.test',now()-interval '2 hours','delayed-secret')", [id]), /otra cuenta/);
  await assert.rejects(db.query("SELECT xp_google_claim($1,'delayed-form','another','forms@example.test',now()-interval '2 hours','delayed-secret')", [id]), /cupo/);
});

test("ordinary database roles retain CRM reads but no inherited administrative write privileges", async () => {
  for (const role of ["anon", "authenticated"]) {
    for (const table of ["usuarios", "inscripciones_evento"]) {
      const { rows } = await db.query<{ readable: boolean; mutable: boolean }>(
        "SELECT has_table_privilege($1,$2,'SELECT') AS readable, has_table_privilege($1,$2,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS mutable",
        [role, table],
      );
      assert.equal(rows[0].readable, true);
      assert.equal(rows[0].mutable, false);
    }
  }
});

test("deleting a contact erases their account and points without putting redeemed inventory back on sale", async () => {
  const uid = "60000000-0000-4000-8000-000000000001";
  const mid = "60000000-0000-4000-8000-000000000002";
  const rid = "60000000-0000-4000-8000-000000000003";
  await db.query(
    "INSERT INTO usuarios(id,email) VALUES($1,'erase@example.test')",
    [uid],
  );
  await db.query(
    "INSERT INTO member_accounts(id,email,usuario_id,email_confirmed_at) VALUES($1,'erase@example.test',$2,now())",
    [mid, uid],
  );
  await db.query(
    "INSERT INTO xp_rewards(id,title,cost,active) VALUES($1,'Erase fixture',20,true)",
    [rid],
  );
  await db.query(
    "INSERT INTO xp_inventory(reward_id,delivery) VALUES($1,'ERASE-TICKET')",
    [rid],
  );
  await db.query("SELECT xp_redeem($1,$2,gen_random_uuid())", [mid, rid]);
  await db.query("SELECT xp_delete_contact($1)", [uid]);
  assert.equal(
    (await db.query("SELECT id FROM member_accounts WHERE id=$1", [mid])).rows
      .length,
    0,
  );
  assert.equal(
    (await db.query("SELECT id FROM xp_ledger WHERE member_id=$1", [mid])).rows
      .length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT id FROM xp_inventory WHERE reward_id=$1 AND used_at IS NULL",
        [rid],
      )
    ).rows.length,
    0,
  );
});

test("passwordless challenges are single-use across link and code, with five attempts and expiry", async () => {
  const id = "50000000-0000-4000-8000-000000000001";
  await db.query(
    "SELECT xp_issue_access($1,'new@example.test','correct-code','correct-link')",
    [id],
  );
  for (let n = 0; n < 5; n++)
    assert.equal(
      (
        await db.query<{ xp_consume_access: string | null }>(
          "SELECT xp_consume_access($1,'wrong',false)",
          [id],
        )
      ).rows[0].xp_consume_access,
      null,
    );
  assert.equal(
    (
      await db.query<{ xp_consume_access: string | null }>(
        "SELECT xp_consume_access($1,'correct-code',false)",
        [id],
      )
    ).rows[0].xp_consume_access,
    null,
  );
  const ok = await db.query<{ xp_consume_access: string | null }>(
    "SELECT xp_consume_access($1,'correct-link',true)",
    [id],
  );
  assert.ok(ok.rows[0].xp_consume_access);
  assert.equal(
    (
      await db.query<{ xp_consume_access: string | null }>(
        "SELECT xp_consume_access($1,'correct-link',true)",
        [id],
      )
    ).rows[0].xp_consume_access,
    null,
  );
});

test("survey saves the response and credits once; rejects empty responses and expired QR", async () => {
  const account = "40000000-0000-4000-8000-000000000001";
  await db.query(
    "INSERT INTO member_accounts(id,email,email_confirmed_at) VALUES($1,'survey@example.test',now())",
    [account],
  );
  await db.exec(
    "INSERT INTO xp_actions(title,kind,points,token_hash,expires_at,max_claims) VALUES('Encuesta','survey',30,'test-hash',now()+interval '1 day',100)",
  );
  await assert.rejects(
    db.query("SELECT xp_claim($1,'test-hash',null,'')", [account]),
    /encuesta/i,
  );
  await db.query("SELECT xp_claim($1,'test-hash',5,'Muy buena experiencia')", [
    account,
  ]);
  await db.query("SELECT xp_claim($1,'test-hash',5,'Muy buena experiencia')", [
    account,
  ]);
  assert.equal(
    (
      await db.query<{ n: string }>(
        "SELECT sum(amount)::text n FROM xp_ledger WHERE member_id=$1",
        [account],
      )
    ).rows[0].n,
    "50",
  );
  await db.exec(
    "UPDATE xp_actions SET active=false WHERE token_hash='test-hash'",
  );
  await assert.rejects(
    db.query("SELECT xp_claim($1,'test-hash',5,'feedback')", [account]),
    /disponible/i,
  );
});

test("verified signup receives 20 points exactly once, not before verification", async () => {
  await db.query(
    "INSERT INTO member_accounts(id,email,usuario_id) VALUES ($1,$2,$3)",
    [member, "member@example.test", user],
  );
  await db.query("SELECT xp_sync_member($1)", [member]);
  assert.equal(
    (
      await db.query<{ n: number }>(
        "SELECT count(*) AS n FROM xp_ledger WHERE member_id=$1",
        [member],
      )
    ).rows[0].n,
    0,
  );
  await db.query(
    "UPDATE member_accounts SET email_confirmed_at=now() WHERE id=$1",
    [member],
  );
  await db.query("SELECT xp_sync_member($1)", [member]);
  await db.query("SELECT xp_sync_member($1)", [member]);
  assert.equal(
    (
      await db.query<{ balance: string }>(
        "SELECT sum(amount)::text AS balance FROM xp_ledger WHERE member_id=$1",
        [member],
      )
    ).rows[0].balance,
    "20",
  );
});

test("redemption is atomic, replay-safe and cannot exceed inventory or balance", async () => {
  const reward = "20000000-0000-4000-8000-000000000001";
  const request = "30000000-0000-4000-8000-000000000001";
  await db.query(
    "INSERT INTO xp_rewards(id,title,cost,active) VALUES($1,'Entrada',150,true)",
    [reward],
  );
  await db.query(
    "INSERT INTO xp_inventory(reward_id,delivery) VALUES($1,'TICKET-TEST-1')",
    [reward],
  );
  await assert.rejects(
    db.query("SELECT xp_redeem($1,$2,$3)", [member, reward, request]),
    /saldo/i,
  );
  await db.query(
    "INSERT INTO xp_ledger(member_id,source,amount,description) VALUES($1,'test-funding',130,'Fixture')",
    [member],
  );
  const result = await db.query<{ xp_redeem: { delivery: string } }>(
    "SELECT xp_redeem($1,$2,$3)",
    [member, reward, request],
  );
  assert.equal(result.rows[0].xp_redeem.delivery, "TICKET-TEST-1");
  const retry = await db.query("SELECT xp_redeem($1,$2,$3)", [
    member,
    reward,
    request,
  ]);
  assert.deepEqual(retry.rows, result.rows);
  await assert.rejects(
    db.query("SELECT xp_redeem($1,$2,gen_random_uuid())", [member, reward]),
    /canje|agotad/i,
  );
  assert.equal(
    (await db.query<{ n: number }>("SELECT count(*) n FROM xp_redemptions"))
      .rows[0].n,
    1,
  );
});

test("attendance streak skips unregistered events; calendar streak resets; only the larger multiplier applies", async () => {
  for (let n = 1; n <= 8; n++) {
    const event = `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    await db.query("INSERT INTO eventos(id,title) VALUES ($1,$2)", [
      event,
      `Evento ${n}`,
    ]);
    await db.query(
      "INSERT INTO xp_events(event_id, starts_at, tier, base_points) VALUES ($1,$2,'normal',20)",
      [event, `2026-01-${String(n).padStart(2, "0")}T18:00:00Z`],
    );
    if (n !== 2 && n !== 3) {
      await db.query(
        "INSERT INTO inscripciones_evento(usuario_id,evento_id,asistio) VALUES ($1,$2,true)",
        [user, event],
      );
    }
    await db.query("UPDATE xp_events SET closed=true WHERE event_id=$1", [
      event,
    ]);
  }
  const amounts = await db.query<{ amount: string }>(
    "SELECT amount::text FROM xp_ledger WHERE source LIKE 'event:%' ORDER BY source",
  );
  assert.deepEqual(
    amounts.rows.map((r) => r.amount),
    ["20", "30", "60", "80", "100", "120"],
  );
  const streak = (
    await db.query<{ commitment: number; consecutive: number }>(
      "SELECT commitment,consecutive FROM xp_members WHERE member_id=$1",
      [member],
    )
  ).rows[0];
  assert.deepEqual(streak, { commitment: 5, consecutive: 5 });
  await assert.rejects(
    db.query(
      "UPDATE inscripciones_evento SET asistio=false WHERE usuario_id=$1",
      [user],
    ),
    /cerrad|acreditad/i,
  );
  await assert.rejects(
    db.exec(
      "INSERT INTO xp_events(event_id,starts_at,tier,base_points) VALUES (gen_random_uuid(),now(),'normal',21)",
    ),
  );
});

test("anonymous and ordinary Supabase users cannot read private points, award points, change attendance or redeem", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(
        db.query("SELECT * FROM xp_access"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT * FROM xp_ledger"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT xp_sync_member($1)", [member]),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT xp_redeem($1,gen_random_uuid(),gen_random_uuid())", [
          member,
        ]),
        /permission denied/,
      );
      await assert.rejects(
        db.exec("UPDATE inscripciones_evento SET asistio=true"),
        /permission denied/,
      );
      await assert.rejects(
        db.exec("UPDATE usuarios SET email='takeover@example.test'"),
        /permission denied/,
      );
    } finally {
      await db.exec("RESET ROLE");
    }
  }
});

test("the first journey is exactly signup 20 + Startup Day 100 + survey 30, including late account creation", async () => {
  const uid = "80000000-0000-4000-8000-000000000001";
  const mid = "80000000-0000-4000-8000-000000000002";
  const event = "80000000-0000-4000-8000-000000000003";
  await db.query("INSERT INTO eventos(id,title) VALUES($1,'Startup Day')", [
    event,
  ]);
  await db.query(
    "INSERT INTO xp_events(event_id,starts_at,tier,base_points) VALUES($1,now()-interval '1 day','major',100)",
    [event],
  );
  await db.query(
    "INSERT INTO inscripciones_evento(usuario_id,evento_id,asistio) VALUES($1,$2,true)",
    [uid, event],
  );
  await db.query("UPDATE xp_events SET closed=true WHERE event_id=$1", [event]);
  await db.query(
    "INSERT INTO member_accounts(id,email,usuario_id,email_confirmed_at) VALUES($1,'startup@example.test',$2,now())",
    [mid, uid],
  );
  await db.query("SELECT xp_sync_member($1)", [mid]);
  await db.query(
    "INSERT INTO xp_actions(title,kind,points,token_hash,event_id,expires_at,max_claims) VALUES('Encuesta Startup Day','survey',30,'startup-survey',$1,now()+interval '1 day',1)",
    [event],
  );
  await db.query("SELECT xp_claim($1,'startup-survey',5,'Aprendí mucho')", [
    mid,
  ]);
  const result = await db.query<{ xp_snapshot: { balance: string } }>(
    "SELECT xp_snapshot($1)",
    [mid],
  );
  assert.equal(result.rows[0].xp_snapshot.balance, "150");
  await assert.rejects(
    db.query(
      "SELECT xp_claim($1,'startup-survey',5,'Intento sin asistencia')",
      [member],
    ),
    /asistencia/,
  );
});

test("a missed registered event resets both streaks", async () => {
  const event = "90000000-0000-4000-8000-000000000001";
  await db.query("INSERT INTO eventos(id,title) VALUES($1,'Evento perdido')", [
    event,
  ]);
  await db.query(
    "INSERT INTO xp_events(event_id,starts_at,tier,base_points) VALUES($1,now()-interval '12 hours','normal',19)",
    [event],
  );
  await db.query(
    "INSERT INTO inscripciones_evento(usuario_id,evento_id,asistio) VALUES($1,$2,false)",
    [user, event],
  );
  await db.query("UPDATE xp_events SET closed=true WHERE event_id=$1", [event]);
  const state = (
    await db.query<{ commitment: number; consecutive: number }>(
      "SELECT commitment,consecutive FROM xp_members WHERE member_id=$1",
      [member],
    )
  ).rows[0];
  assert.deepEqual(state, { commitment: 0, consecutive: 0 });
});
test("administrative reward stock counts all inventory, not just the REST page", async () => {
  const rid = "91000000-0000-4000-8000-000000000001";
  await db.query(
    "INSERT INTO xp_rewards(id,title,cost) VALUES($1,'Stock fixture',20)",
    [rid],
  );
  await db.query(
    "INSERT INTO xp_inventory(reward_id,delivery) SELECT $1,'STOCK-'||n FROM generate_series(1,1201) n",
    [rid],
  );
  const result = await db.query<{
    xp_reward_catalog: { id: string; available: number }[];
  }>("SELECT xp_reward_catalog()");
  assert.equal(
    result.rows[0].xp_reward_catalog.find((r) => r.id === rid)?.available,
    1201,
  );
});
test("expired links and QR cannot award points", async () => {
  const id = "92000000-0000-4000-8000-000000000001";
  await db.query(
    "SELECT xp_issue_access($1,'expired@example.test','code','link')",
    [id],
  );
  await db.query(
    "UPDATE xp_access SET expires_at=now()-interval '1 second' WHERE id=$1",
    [id],
  );
  const result = await db.query<{ xp_consume_access: string | null }>(
    "SELECT xp_consume_access($1,'link',true)",
    [id],
  );
  assert.equal(result.rows[0].xp_consume_access, null);
  await db.exec(
    "INSERT INTO xp_actions(title,kind,points,token_hash,expires_at,max_claims) VALUES('Expired QR','qr',30,'expired-qr',now()-interval '1 second',1)",
  );
  await assert.rejects(
    db.query("SELECT xp_claim($1,'expired-qr')", [member]),
    /vencida/,
  );
});
test("fractional attendance bonus rounds down without stacking", async () => {
  for (let n = 1; n <= 3; n++) {
    const eid = "93000000-0000-4000-8000-" + String(n).padStart(12, "0");
    await db.query(
      "INSERT INTO eventos(id,title) VALUES($1,'Rounding fixture')",
      [eid],
    );
    await db.query(
      "INSERT INTO xp_events(event_id,starts_at,tier,base_points) VALUES($1,now()-($2::int * interval '1 hour'),'normal',19)",
      [eid, 4 - n],
    );
    if (n !== 2)
      await db.query(
        "INSERT INTO inscripciones_evento(usuario_id,evento_id,asistio) VALUES($1,$2,true)",
        [user, eid],
      );
    await db.query("UPDATE xp_events SET closed=true WHERE event_id=$1", [eid]);
  }
  const result = await db.query<{ amount: string }>(
    "SELECT amount::text FROM xp_ledger WHERE member_id=$1 AND source='event:93000000-0000-4000-8000-000000000003'",
    [member],
  );
  assert.equal(result.rows[0].amount, "28");
});

test("an open absence preserves streaks and blocks later attendance until the gap is closed", async () => {
  const uid = "a1000000-0000-4000-8000-000000000001";
  const mid = "a1000000-0000-4000-8000-000000000002";
  const warmup = "a1000000-0000-4000-8000-000000000003";
  const pendingMiss = "a1000000-0000-4000-8000-000000000004";
  const waitingAttendance = "a1000000-0000-4000-8000-000000000005";
  await db.query("INSERT INTO usuarios(id,email) VALUES($1,'streak-gap@example.test')", [uid]);
  await db.query(
    "INSERT INTO member_accounts(id,email,usuario_id,email_confirmed_at) VALUES($1,'streak-gap@example.test',$2,now())",
    [mid, uid],
  );

  const createEvent = async (id: string, title: string, age: string) => {
    await db.query("INSERT INTO eventos(id,title) VALUES($1,$2)", [id, title]);
    await db.query(
      "INSERT INTO xp_events(event_id,starts_at,tier,base_points) VALUES($1,now()-$2::interval,'normal',20)",
      [id, age],
    );
  };
  const state = async () => (
    await db.query<{ commitment: number; consecutive: number }>(
      "SELECT commitment,consecutive FROM xp_members WHERE member_id=$1",
      [mid],
    )
  ).rows[0];

  await createEvent(warmup, "Warmup de racha", "50 minutes");
  await db.query(
    "INSERT INTO inscripciones_evento(usuario_id,evento_id,asistio) VALUES($1,$2,true)",
    [uid, warmup],
  );
  await db.query("UPDATE xp_events SET closed=true WHERE event_id=$1", [warmup]);
  assert.deepEqual(await state(), { commitment: 1, consecutive: 1 });

  await createEvent(pendingMiss, "Ausencia pendiente", "30 minutes");
  await db.query(
    "INSERT INTO inscripciones_evento(usuario_id,evento_id,asistio) VALUES($1,$2,false)",
    [uid, pendingMiss],
  );
  await createEvent(waitingAttendance, "Asistencia en espera", "10 minutes");
  await db.query(
    "INSERT INTO inscripciones_evento(usuario_id,evento_id,asistio) VALUES($1,$2,true)",
    [uid, waitingAttendance],
  );

  assert.deepEqual(await state(), { commitment: 1, consecutive: 1 });
  assert.equal(
    (await db.query("SELECT 1 FROM xp_ledger WHERE member_id=$1 AND source=$2", [mid, `event:${waitingAttendance}`])).rows.length,
    0,
  );

  await db.query("UPDATE xp_events SET closed=true WHERE event_id=$1", [pendingMiss]);
  assert.deepEqual(await state(), { commitment: 1, consecutive: 1 });
  const awarded = (
    await db.query<{
      amount: string;
      metadata: { base: number; multiplier: number; commitment: number; consecutive: number };
    }>(
      "SELECT amount::text,metadata FROM xp_ledger WHERE member_id=$1 AND source=$2",
      [mid, `event:${waitingAttendance}`],
    )
  ).rows;
  assert.deepEqual(awarded, [{
    amount: "20",
    metadata: { base: 20, multiplier: 1, commitment: 1, consecutive: 1 },
  }]);
  assert.equal(
    (await db.query("SELECT 1 FROM xp_ledger WHERE member_id=$1 AND source=$2", [mid, `event:${pendingMiss}`])).rows.length,
    0,
  );

  await db.query("SELECT xp_sync_member($1)", [mid]);
  await db.query("SELECT xp_snapshot($1)", [mid]);
  assert.equal(
    (await db.query("SELECT 1 FROM xp_ledger WHERE member_id=$1 AND source=$2", [mid, `event:${waitingAttendance}`])).rows.length,
    1,
  );
});
