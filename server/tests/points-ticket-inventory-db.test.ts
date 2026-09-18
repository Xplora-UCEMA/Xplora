import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const rewardId = '10000000-0000-4000-8000-000000000001';
const otherRewardId = '10000000-0000-4000-8000-000000000002';
const memberId = '20000000-0000-4000-8000-000000000001';
const redemptionId = '30000000-0000-4000-8000-000000000001';
const ambiguousRedemptionId = '30000000-0000-4000-8000-000000000002';
const rejectedRedemptionId = '30000000-0000-4000-8000-000000000003';

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE xp_rewards(id uuid PRIMARY KEY, active boolean NOT NULL DEFAULT false);
    CREATE TABLE xp_inventory(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reward_id uuid NOT NULL REFERENCES xp_rewards(id),
      delivery text NOT NULL CHECK(length(delivery) BETWEEN 1 AND 4000),
      used_at timestamptz,
      UNIQUE(reward_id, delivery)
    );
    CREATE TABLE xp_redemptions(id uuid PRIMARY KEY, member_id uuid NOT NULL);
    INSERT INTO xp_rewards(id,active) VALUES('${rewardId}',true),('${otherRewardId}',false);
    INSERT INTO xp_redemptions(id,member_id) VALUES
      ('${redemptionId}','${memberId}'),
      ('${ambiguousRedemptionId}','${memberId}'),
      ('${rejectedRedemptionId}','${memberId}');
  `);
  await db.exec(await readFile(
    new URL('../../supabase/migrations/202609180005_private_qr_ticket_inventory.sql', import.meta.url),
    'utf8',
  ));
});
after(() => db.close());

const item = (suffix: string) => {
  const fingerprint = suffix.repeat(64).slice(0, 64);
  const imageSha256 = suffix === 'a' ? 'd'.repeat(64) : suffix === 'b' ? 'e'.repeat(64) : 'f'.repeat(64);
  return {
    delivery: `xplora-delivery:v1:${JSON.stringify({
      type: 'qr',
      provider: 'cloudinary',
      eventSlug: 'labitconf',
      eventTitle: 'LaBitConf',
      publicId: `xplora-points/tickets/labitconf/${imageSha256}`,
      version: 1770000000,
      format: 'png',
      imageSha256,
      qrFingerprint: fingerprint,
    })}`,
    fingerprint,
  };
};

test('private QR inventory imports atomically only while a reward is inactive', async () => {
  await assert.rejects(
    db.query('SELECT xp_import_ticket_inventory($1,$2::jsonb)', [rewardId, JSON.stringify([item('a')])]),
    /Desactivá/,
  );
  assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM xp_inventory')).rows[0].count, 0);

  await db.query('UPDATE xp_rewards SET active=false WHERE id=$1', [rewardId]);
  const imported = await db.query<{ result: { inserted: number } }>(
    'SELECT xp_import_ticket_inventory($1,$2::jsonb) AS result',
    [rewardId, JSON.stringify([item('a'), item('b')])],
  );
  assert.equal(imported.rows[0].result.inserted, 2);

  await assert.rejects(
    db.query('SELECT xp_import_ticket_inventory($1,$2::jsonb)', [rewardId, JSON.stringify([item('c'), item('a')])]),
    /unique|duplicate/i,
  );
  assert.equal((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM xp_inventory')).rows[0].count, 2);

  await assert.rejects(
    db.query('SELECT xp_import_ticket_inventory($1,$2::jsonb)', [otherRewardId, JSON.stringify([item('a')])]),
    /unique|duplicate/i,
  );
});

test('private QR inventory rejects malformed fingerprints and public roles cannot call the import RPC', async () => {
  await assert.rejects(
    db.query('SELECT xp_import_ticket_inventory($1,$2::jsonb)', [rewardId, null]),
    /entre 1 y 500/,
  );
  await assert.rejects(
    db.query('SELECT xp_import_ticket_inventory($1,$2::jsonb)', [rewardId, JSON.stringify([
      { delivery: 'xplora-delivery:v1:{}', fingerprint: 'not-a-hash' },
    ])]),
    /inválidos/,
  );
  const unsafeVersion = item('f');
  unsafeVersion.delivery = unsafeVersion.delivery.replace('1770000000', '9007199254740992');
  await assert.rejects(
    db.query('SELECT xp_import_ticket_inventory($1,$2::jsonb)', [rewardId, JSON.stringify([unsafeVersion])]),
    /inválidos/,
  );
  await assert.rejects(
    db.query('SELECT xp_import_ticket_inventory($1,$2::jsonb)', [rewardId, JSON.stringify([{
      delivery: 'xplora-delivery:v1:{"ticket":"not-a-private-descriptor"}',
      fingerprint: 'd'.repeat(64),
    }])]),
    /inválidos/,
  );
  await db.exec('SET ROLE authenticated');
  await assert.rejects(
    db.query('SELECT xp_import_ticket_inventory($1,$2::jsonb)', [rewardId, JSON.stringify([item('d')])]),
    /permission denied/i,
  );
  await db.exec('RESET ROLE');
});

test('redemption email delivery is claimed once and remains sent across request replays', async () => {
  const first = await db.query<{ state: string }>(
    'SELECT xp_claim_redemption_email($1,$2) AS state',
    [redemptionId, memberId],
  );
  assert.equal(first.rows[0].state, 'send');
  const concurrent = await db.query<{ state: string }>(
    'SELECT xp_claim_redemption_email($1,$2) AS state',
    [redemptionId, memberId],
  );
  assert.equal(concurrent.rows[0].state, 'busy');
  await db.query(
    "UPDATE xp_redemption_emails SET claimed_at=now()-interval '1 day' WHERE redemption_id=$1",
    [redemptionId],
  );
  const stale = await db.query<{ state: string }>(
    'SELECT xp_claim_redemption_email($1,$2) AS state',
    [redemptionId, memberId],
  );
  assert.equal(stale.rows[0].state, 'busy', 'unresolved claims must never be reclaimed by age');
  const finished = await db.query<{ done: boolean }>(
    'SELECT xp_finish_redemption_email($1,$2,$3) AS done',
    [redemptionId, memberId, 'resend-provider-id-1'],
  );
  assert.equal(finished.rows[0].done, true);
  const stored = await db.query<{ provider_id: string; ambiguous_at: string | null }>(
    'SELECT provider_id,ambiguous_at FROM xp_redemption_emails WHERE redemption_id=$1',
    [redemptionId],
  );
  assert.equal(stored.rows[0].provider_id, 'resend-provider-id-1');
  assert.equal(stored.rows[0].ambiguous_at, null);
  const replay = await db.query<{ state: string }>(
    'SELECT xp_claim_redemption_email($1,$2) AS state',
    [redemptionId, memberId],
  );
  assert.equal(replay.rows[0].state, 'sent');
  const released = await db.query<{ released: boolean }>(
    'SELECT xp_release_redemption_email($1,$2) AS released',
    [redemptionId, memberId],
  );
  assert.equal(released.rows[0].released, false);
});

test('ambiguous redemption emails stay durable while definitive rejects can retry', async () => {
  const ambiguousClaim = await db.query<{ state: string }>(
    'SELECT xp_claim_redemption_email($1,$2) AS state',
    [ambiguousRedemptionId, memberId],
  );
  assert.equal(ambiguousClaim.rows[0].state, 'send');
  const marked = await db.query<{ marked: boolean }>(
    'SELECT xp_mark_redemption_email_ambiguous($1,$2) AS marked',
    [ambiguousRedemptionId, memberId],
  );
  assert.equal(marked.rows[0].marked, true);
  await db.query(
    "UPDATE xp_redemption_emails SET claimed_at=now()-interval '1 day' WHERE redemption_id=$1",
    [ambiguousRedemptionId],
  );
  const ambiguousReplay = await db.query<{ state: string }>(
    'SELECT xp_claim_redemption_email($1,$2) AS state',
    [ambiguousRedemptionId, memberId],
  );
  assert.equal(ambiguousReplay.rows[0].state, 'ambiguous');
  const ambiguousRelease = await db.query<{ released: boolean }>(
    'SELECT xp_release_redemption_email($1,$2) AS released',
    [ambiguousRedemptionId, memberId],
  );
  assert.equal(ambiguousRelease.rows[0].released, false);

  const rejectedClaim = await db.query<{ state: string }>(
    'SELECT xp_claim_redemption_email($1,$2) AS state',
    [rejectedRedemptionId, memberId],
  );
  assert.equal(rejectedClaim.rows[0].state, 'send');
  const definitiveRelease = await db.query<{ released: boolean }>(
    'SELECT xp_release_redemption_email($1,$2) AS released',
    [rejectedRedemptionId, memberId],
  );
  assert.equal(definitiveRelease.rows[0].released, true);
  const retry = await db.query<{ state: string }>(
    'SELECT xp_claim_redemption_email($1,$2) AS state',
    [rejectedRedemptionId, memberId],
  );
  assert.equal(retry.rows[0].state, 'send');
});
