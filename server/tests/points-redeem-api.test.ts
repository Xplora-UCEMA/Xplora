import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { getAppConfig, type AppConfig } from '../src/config/env.js';
import { registerPointsRoutes } from '../src/http/controllers/points.controller.js';
import { errorMiddleware } from '../src/http/middleware/error.middleware.js';
import { signMemberAccessToken } from '../src/services/member-jwt.service.js';
import { RESEND_SEND_URL } from '../src/services/resend-send.service.js';
import { encodeQrTicketDelivery } from '../src/domain/points-delivery.js';
import { POINTS_QR_CONTENT_ID } from '../src/services/points-redemption-email.js';

const memberId = '00000000-0000-4000-8000-000000000001';
const rewardId = '20000000-0000-4000-8000-000000000001';
const requestId = '30000000-0000-4000-8000-000000000001';
const redemptionId = '40000000-0000-4000-8000-000000000001';
const account = {
  id: memberId,
  email: 'member@example.test',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
};
const redemption = {
  id: redemptionId,
  member_id: memberId,
  reward_id: rewardId,
  request_id: requestId,
  title: 'Entrada',
  cost: 150,
  delivery: 'TICKET-123',
  created_at: '2026-09-18T12:00:00.000Z',
};

async function start(config: AppConfig) {
  const app = express();
  app.use(express.json());
  registerPointsRoutes(app, config, []);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    url: `http://127.0.0.1:${address.port}/api/member/points/redeem`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
}

test('redeem honors the feature flag and emails the authenticated member idempotently', async () => {
  const base = {
    ...getAppConfig(),
    nodeEnv: 'test' as const,
    pointsEnabled: true,
    supabaseUrl: 'https://points-redeem.test',
    supabaseServiceRoleKey: 'fixture-service-role',
    memberJwtSecret: 'fixture-only-member-secret-long-enough',
    publicSiteUrl: 'https://xplora.test',
    resend: { apiKey: 're_fixture', from: 'test@xplora.test', fromName: 'Xplora' },
  } satisfies AppConfig;
  const rpcBodies: Record<string, unknown>[] = [];
  const emails: { key: string | null; body: Record<string, unknown> }[] = [];
  const finishes: Record<string, unknown>[] = [];
  let redemptionEmailState: 'ready' | 'sent' = 'ready';
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (request.url === RESEND_SEND_URL) {
      emails.push({
        key: request.headers.get('idempotency-key'),
        body: await request.json() as Record<string, unknown>,
      });
      return Response.json({ id: 'email-fixture' });
    }
    if (url.origin === base.supabaseUrl) {
      if (url.pathname.endsWith('/member_accounts')) return Response.json(account);
      if (url.pathname.endsWith('/rpc/xp_redeem')) {
        rpcBodies.push(await request.json() as Record<string, unknown>);
        return Response.json(redemption);
      }
      if (url.pathname.endsWith('/rpc/xp_claim_redemption_email'))
        return Response.json(redemptionEmailState === 'sent' ? 'sent' : 'send');
      if (url.pathname.endsWith('/rpc/xp_finish_redemption_email')) {
        finishes.push(await request.json() as Record<string, unknown>);
        redemptionEmailState = 'sent';
        return Response.json(true);
      }
      if (url.pathname.endsWith('/rpc/xp_release_redemption_email')) return Response.json(true);
    }
    throw new Error(`Unexpected fixture request: ${request.method} ${request.url}`);
  };

  let enabled: Awaited<ReturnType<typeof start>> | null = null;
  let disabled: Awaited<ReturnType<typeof start>> | null = null;
  try {
    const token = await signMemberAccessToken(base.memberJwtSecret, account);
    const submit = (url: string) => nativeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        rewardId,
        requestId,
        email: 'attacker-controlled@example.test',
      }),
    });

    enabled = await start(base);
    const first = await submit(enabled.url);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { ...redemption, emailSent: true });
    const retry = await submit(enabled.url);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json() as { emailSent: boolean }).emailSent, true);
    await enabled.close();
    enabled = null;

    assert.deepEqual(rpcBodies, [
      { p_member: memberId, p_reward: rewardId, p_request: requestId },
      { p_member: memberId, p_reward: rewardId, p_request: requestId },
    ]);
    assert.deepEqual(emails.map((email) => email.key), [
      `points-redemption/${redemptionId}`,
    ]);
    assert.ok(emails.every((email) => JSON.stringify(email.body.to) === JSON.stringify([account.email])));
    assert.ok(emails.every((email) => !JSON.stringify(email.body).includes('attacker-controlled')));
    assert.deepEqual(finishes, [{
      p_redemption: redemptionId,
      p_member: memberId,
      p_provider_id: 'email-fixture',
    }]);

    disabled = await start({ ...base, pointsEnabled: false });
    const unavailable = await submit(disabled.url);
    assert.equal(unavailable.status, 400);
    assert.deepEqual(await unavailable.json(), {
      error: 'Points no está disponible.',
      code: 'BAD_REQUEST',
    });
    assert.equal(rpcBodies.length, 2);
    assert.equal(emails.length, 1);
  } finally {
    if (enabled) await enabled.close();
    if (disabled) await disabled.close();
    globalThis.fetch = nativeFetch;
  }
});

test('QR redemption fetches the private asset server-side and embeds it in the confirmation email', async () => {
  const qrPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 9, 8, 7]);
  const imageSha256 = createHash('sha256').update(qrPng).digest('hex');
  const qrDelivery = encodeQrTicketDelivery({
    type: 'qr',
    provider: 'cloudinary',
    eventSlug: 'labitconf',
    eventTitle: 'LaBitConf',
    publicId: `xplora-points/tickets/labitconf/${imageSha256}`,
    version: 1770000000,
    format: 'png',
    imageSha256,
    qrFingerprint: 'f'.repeat(64),
  });
  const base = {
    ...getAppConfig(),
    nodeEnv: 'test' as const,
    pointsEnabled: true,
    supabaseUrl: 'https://points-qr-redeem.test',
    supabaseServiceRoleKey: 'fixture-service-role',
    memberJwtSecret: 'fixture-only-member-secret-long-enough',
    publicSiteUrl: 'https://xplora.test',
    cloudinary: { cloudName: 'fixture-cloud', apiKey: 'fixture-key', apiSecret: 'fixture-secret' },
    resend: { apiKey: 're_fixture', from: 'test@xplora.test', fromName: 'Xplora' },
  } satisfies AppConfig;
  const emailBodies: Record<string, unknown>[] = [];
  const finishes: Record<string, unknown>[] = [];
  let privateDownloads = 0;
  let redemptionEmailState: 'ready' | 'sent' = 'ready';
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (request.url === RESEND_SEND_URL) {
      emailBodies.push(await request.json() as Record<string, unknown>);
      return Response.json({ id: 'qr-email-fixture' });
    }
    if (url.origin === base.supabaseUrl) {
      if (url.pathname.endsWith('/member_accounts')) return Response.json(account);
      if (url.pathname.endsWith('/rpc/xp_redeem')) return Response.json({ ...redemption, delivery: qrDelivery });
      if (url.pathname.endsWith('/rpc/xp_claim_redemption_email'))
        return Response.json(redemptionEmailState === 'sent' ? 'sent' : 'send');
      if (url.pathname.endsWith('/rpc/xp_finish_redemption_email')) {
        finishes.push(await request.json() as Record<string, unknown>);
        redemptionEmailState = 'sent';
        return Response.json(true);
      }
      if (url.pathname.endsWith('/rpc/xp_release_redemption_email')) return Response.json(true);
    }
    if (url.hostname === 'api.cloudinary.com') {
      privateDownloads += 1;
      return new Response(qrPng, { status: 200, headers: { 'Content-Type': 'image/png' } });
    }
    throw new Error(`Unexpected fixture request: ${request.method} ${request.url}`);
  };

  let fixture: Awaited<ReturnType<typeof start>> | null = null;
  try {
    const token = await signMemberAccessToken(base.memberJwtSecret, account);
    fixture = await start(base);
    const response = await nativeFetch(fixture.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ rewardId, requestId }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { emailSent: boolean }).emailSent, true);
    assert.equal(privateDownloads, 1);
    assert.equal(emailBodies.length, 1);
    assert.match(String(emailBodies[0].html), new RegExp(`cid:${POINTS_QR_CONTENT_ID}`));
    assert.deepEqual(emailBodies[0].attachments, [{
      content: qrPng.toString('base64'),
      filename: 'entrada-labitconf.png',
      content_type: 'image/png',
      content_id: POINTS_QR_CONTENT_ID,
    }]);
    assert.equal(JSON.stringify(emailBodies[0]).includes(qrDelivery), false);
    assert.deepEqual(finishes, [{
      p_redemption: redemptionId,
      p_member: memberId,
      p_provider_id: 'qr-email-fixture',
    }]);
  } finally {
    globalThis.fetch = nativeFetch;
    if (fixture) await fixture.close();
  }
});

test('redeem releases definitive email rejects but durably blocks ambiguous outcomes', async () => {
  const rejectedRequestId = '30000000-0000-4000-8000-000000000002';
  const ambiguousRequestId = '30000000-0000-4000-8000-000000000003';
  const rejectedRedemptionId = '40000000-0000-4000-8000-000000000002';
  const ambiguousRedemptionId = '40000000-0000-4000-8000-000000000003';
  const base = {
    ...getAppConfig(),
    nodeEnv: 'test' as const,
    pointsEnabled: true,
    supabaseUrl: 'https://points-email-outcomes.test',
    supabaseServiceRoleKey: 'fixture-service-role',
    memberJwtSecret: 'fixture-only-member-secret-long-enough',
    publicSiteUrl: 'https://xplora.test',
    resend: { apiKey: 're_fixture', from: 'test@xplora.test', fromName: 'Xplora' },
  } satisfies AppConfig;
  const releases: string[] = [];
  const ambiguousMarks: string[] = [];
  const emailKeys: string[] = [];
  const ambiguousClaims = new Set<string>();
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (request.url === RESEND_SEND_URL) {
      const key = request.headers.get('idempotency-key') ?? '';
      emailKeys.push(key);
      return key.endsWith(rejectedRedemptionId)
        ? Response.json({ message: 'invalid recipient' }, { status: 422 })
        : Response.json({ message: 'provider unavailable' }, { status: 503 });
    }
    if (url.origin === base.supabaseUrl) {
      if (url.pathname.endsWith('/member_accounts')) return Response.json(account);
      const body = request.method === 'POST'
        ? await request.json() as Record<string, unknown>
        : {};
      if (url.pathname.endsWith('/rpc/xp_redeem')) {
        const isRejected = body.p_request === rejectedRequestId;
        return Response.json({
          ...redemption,
          id: isRejected ? rejectedRedemptionId : ambiguousRedemptionId,
          request_id: body.p_request,
        });
      }
      if (url.pathname.endsWith('/rpc/xp_claim_redemption_email')) {
        const id = String(body.p_redemption);
        return Response.json(ambiguousClaims.has(id) ? 'ambiguous' : 'send');
      }
      if (url.pathname.endsWith('/rpc/xp_release_redemption_email')) {
        releases.push(String(body.p_redemption));
        return Response.json(true);
      }
      if (url.pathname.endsWith('/rpc/xp_mark_redemption_email_ambiguous')) {
        const id = String(body.p_redemption);
        ambiguousMarks.push(id);
        ambiguousClaims.add(id);
        return Response.json(true);
      }
    }
    throw new Error(`Unexpected fixture request: ${request.method} ${request.url}`);
  };

  let fixture: Awaited<ReturnType<typeof start>> | null = null;
  try {
    const token = await signMemberAccessToken(base.memberJwtSecret, account);
    fixture = await start(base);
    const submit = async (id: string) => nativeFetch(fixture!.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ rewardId, requestId: id }),
    });
    const rejected = await submit(rejectedRequestId);
    assert.equal(rejected.status, 200);
    assert.equal((await rejected.json() as { emailSent: boolean }).emailSent, false);
    assert.deepEqual(releases, [rejectedRedemptionId]);
    assert.deepEqual(ambiguousMarks, []);

    const ambiguous = await submit(ambiguousRequestId);
    assert.equal(ambiguous.status, 200);
    assert.equal((await ambiguous.json() as { emailSent: boolean }).emailSent, false);
    assert.deepEqual(releases, [rejectedRedemptionId]);
    assert.deepEqual(ambiguousMarks, [ambiguousRedemptionId]);

    const replay = await submit(ambiguousRequestId);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json() as { emailSent: boolean }).emailSent, false);
    assert.deepEqual(emailKeys, [
      `points-redemption/${rejectedRedemptionId}`,
      `points-redemption/${ambiguousRedemptionId}`,
    ]);
  } finally {
    globalThis.fetch = nativeFetch;
    if (fixture) await fixture.close();
  }
});
