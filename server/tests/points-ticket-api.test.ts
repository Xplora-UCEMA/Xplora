import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { getAppConfig, type AppConfig } from '../src/config/env.js';
import { encodeQrTicketDelivery } from '../src/domain/points-delivery.js';
import { registerPointsRoutes } from '../src/http/controllers/points.controller.js';
import { errorMiddleware } from '../src/http/middleware/error.middleware.js';
import { signMemberAccessToken } from '../src/services/member-jwt.service.js';

const memberId = '00000000-0000-4000-8000-000000000001';
const ownedRedemptionId = '10000000-0000-4000-8000-000000000001';
const foreignRedemptionId = '10000000-0000-4000-8000-000000000002';
const legacyRedemptionId = '10000000-0000-4000-8000-000000000003';
const tamperedRedemptionId = '10000000-0000-4000-8000-000000000004';
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
const imageSha256 = createHash('sha256').update(png).digest('hex');
const publicId = `xplora-points/tickets/labitconf/${imageSha256}`;
const delivery = encodeQrTicketDelivery({
  type: 'qr',
  provider: 'cloudinary',
  eventSlug: 'labitconf',
  eventTitle: 'LaBitConf',
  publicId,
  version: 1770000000,
  format: 'png',
  imageSha256,
  qrFingerprint: 'f'.repeat(64),
});
const account = {
  id: memberId,
  email: 'member@example.test',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
};

async function start(config: AppConfig) {
  const app = express();
  registerPointsRoutes(app, config, []);
  app.use(errorMiddleware);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
}

function assertPrivateError(response: Response, body: string, status: 404 | 503): void {
  assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.doesNotMatch(body, /api\.cloudinary\.com|xplora-delivery:v1:|publicId|imageSha256/i);
  assert.equal(body.includes(publicId), false);
  assert.equal(body.includes(delivery), false);
}

test('authenticated QR endpoint returns only the owner ticket and keeps private delivery data opaque', async () => {
  const config = {
    ...getAppConfig(),
    nodeEnv: 'test' as const,
    pointsEnabled: false,
    supabaseUrl: 'https://points-ticket-api.invalid',
    supabaseServiceRoleKey: 'fixture-service-role',
    memberJwtSecret: 'fixture-only-member-secret-long-enough',
    cloudinary: {
      cloudName: 'fixture-cloud',
      apiKey: 'fixture-key',
      apiSecret: 'fixture-secret',
    },
  } satisfies AppConfig;
  const nativeFetch = globalThis.fetch;
  const nativeWarn = console.warn;
  const cloudinaryUrls: string[] = [];
  const redemptionQueries: URL[] = [];
  const warnings: string[] = [];
  let cloudinaryBytes = png;

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin === config.supabaseUrl) {
      if (url.pathname.endsWith('/member_accounts')) {
        assert.equal(url.searchParams.get('id'), `eq.${memberId}`);
        return Response.json(account);
      }
      if (url.pathname.endsWith('/xp_redemptions')) {
        redemptionQueries.push(url);
        assert.equal(url.searchParams.get('member_id'), `eq.${memberId}`);
        const requestedId = url.searchParams.get('id')?.replace(/^eq\./, '');
        if (!requestedId) {
          assert.equal(url.searchParams.get('order'), 'created_at.desc');
          assert.equal(url.searchParams.get('limit'), '50');
          return Response.json([{
            id: ownedRedemptionId,
            title: 'Entrada LaBitConf',
            cost: 150,
            delivery,
            created_at: '2026-09-18T12:00:00.000Z',
          }]);
        }
        if (requestedId === foreignRedemptionId) return Response.json(null);
        if (requestedId === legacyRedemptionId) {
          return Response.json({ id: legacyRedemptionId, delivery: 'LEGACY-TICKET-123' });
        }
        assert.ok(requestedId === ownedRedemptionId || requestedId === tamperedRedemptionId);
        return Response.json({ id: requestedId, delivery });
      }
      throw new Error(`Unexpected Supabase fixture request: ${request.method} ${request.url}`);
    }

    assert.equal(request.method, 'GET');
    assert.equal(url.hostname, 'api.cloudinary.com');
    cloudinaryUrls.push(request.url);
    return new Response(cloudinaryBytes, {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    });
  };
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));

  let fixture: Awaited<ReturnType<typeof start>> | null = null;
  try {
    fixture = await start(config);
    const token = await signMemberAccessToken(config.memberJwtSecret, account);
    const get = (id: string) => nativeFetch(
      `${fixture!.baseUrl}/api/member/points/redemptions/${id}/qr`,
      { headers: { authorization: `Bearer ${token}` } },
    );

    const history = await nativeFetch(
      `${fixture.baseUrl}/api/member/points/redemptions`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(history.status, 200);
    assert.match(history.headers.get('cache-control') ?? '', /no-store/);
    assert.deepEqual(await history.json(), { redemptions: [{
      id: ownedRedemptionId,
      title: 'Entrada LaBitConf',
      cost: 150,
      delivery,
      created_at: '2026-09-18T12:00:00.000Z',
    }] });

    const owned = await get(ownedRedemptionId);
    assert.equal(owned.status, 200);
    assert.equal(owned.headers.get('content-type'), 'image/png');
    assert.match(owned.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(owned.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(owned.headers.get('content-disposition'), 'inline; filename="entrada-labitconf.png"');
    const ownedHeaders = JSON.stringify(Object.fromEntries(owned.headers.entries()));
    assert.equal(ownedHeaders.includes(publicId), false);
    assert.doesNotMatch(ownedHeaders, /api\.cloudinary\.com|xplora-delivery:v1:/i);
    assert.deepEqual(Buffer.from(await owned.arrayBuffer()), png);
    assert.equal(cloudinaryUrls.length, 1);

    const beforeForeign = cloudinaryUrls.length;
    const foreign = await get(foreignRedemptionId);
    const foreignBody = await foreign.text();
    assertPrivateError(foreign, foreignBody, 404);
    assert.deepEqual(JSON.parse(foreignBody), { error: 'Ticket no disponible.', code: 'NOT_FOUND' });
    assert.equal(cloudinaryUrls.length, beforeForeign, 'foreign redemptions must not reach Cloudinary');

    const legacy = await get(legacyRedemptionId);
    const legacyBody = await legacy.text();
    assertPrivateError(legacy, legacyBody, 404);
    assert.deepEqual(JSON.parse(legacyBody), { error: 'Ticket no disponible.', code: 'NOT_FOUND' });
    assert.equal(cloudinaryUrls.length, beforeForeign, 'legacy deliveries must not reach Cloudinary');

    cloudinaryBytes = Buffer.concat([png, Buffer.from([0xff])]);
    const tampered = await get(tamperedRedemptionId);
    const tamperedBody = await tampered.text();
    assertPrivateError(tampered, tamperedBody, 503);
    assert.deepEqual(JSON.parse(tamperedBody), {
      error: 'No pudimos cargar el ticket. Reintentá en un momento.',
      code: 'UNAVAILABLE',
    });
    assert.equal(cloudinaryUrls.length, 2);

    assert.equal(redemptionQueries.length, 5);
    const privateMaterial = [delivery, publicId, imageSha256, ...cloudinaryUrls];
    for (const secret of privateMaterial) {
      assert.equal(foreignBody.includes(secret), false);
      assert.equal(legacyBody.includes(secret), false);
      assert.equal(tamperedBody.includes(secret), false);
      assert.ok(warnings.every((warning) => !warning.includes(secret)));
    }
  } finally {
    globalThis.fetch = nativeFetch;
    console.warn = nativeWarn;
    if (fixture) await fixture.close();
  }
});
