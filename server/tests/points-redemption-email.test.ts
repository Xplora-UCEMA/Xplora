import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAppConfig } from '../src/config/env.js';
import {
  POINTS_QR_CONTENT_ID,
  renderPointsRedemptionEmail,
  sendPointsRedemptionEmail,
} from '../src/services/points-redemption-email.js';
import { RESEND_SEND_URL } from '../src/services/resend-send.service.js';
import { REWARD_DELIVERY_PREFIX } from '../src/services/reward-delivery.js';

const qrDelivery = REWARD_DELIVERY_PREFIX + JSON.stringify({
  type: 'qr',
  provider: 'cloudinary',
  eventSlug: 'labitconf',
  eventTitle: 'LaBitConf',
  publicId: `xplora-points/tickets/labitconf/${'c'.repeat(64)}`,
  version: 1720000000,
  format: 'png',
  imageSha256: 'a'.repeat(64),
  qrFingerprint: 'b'.repeat(64),
});

test('legacy redemption email is polished and escapes delivery instructions', () => {
  const html = renderPointsRedemptionEmail({
    title: '<Entrada & mentoría>',
    cost: 150,
    delivery: '<script>alert("code")</script>\nCODE-123',
    accountUrl: 'https://xplora.test/cuenta?vista=recompensas&from=email',
  });

  assert.doesNotMatch(html, /placeholder|contenido es temporal/i);
  assert.match(html, /Canje confirmado/);
  assert.match(html, /150 Xplora Points/);
  assert.match(html, /&lt;Entrada &amp; mentoría&gt;/);
  assert.match(html, /&lt;script&gt;alert\(&quot;code&quot;\)&lt;\/script&gt;/);
  assert.match(html, /vista=recompensas&amp;from=email/);
  assert.doesNotMatch(html, /<script>alert/);
});

test('LaBitConf email embeds its private QR by CID and keeps an account fallback', () => {
  const withQr = renderPointsRedemptionEmail({
    title: 'Entrada a LaBitConf',
    cost: 150,
    delivery: qrDelivery,
    accountUrl: 'https://xplora.test/cuenta?vista=recompensas',
    hasInlineQr: true,
  });
  assert.match(withQr, /Tu entrada para LaBitConf/);
  assert.match(withQr, new RegExp(`src="cid:${POINTS_QR_CONTENT_ID}"`));
  assert.match(withQr, /Código QR de tu entrada para LaBitConf/);
  assert.match(withQr, /Ver mi QR en Mis canjes/);
  assert.doesNotMatch(withQr, /xplora-points\/tickets|a{64}|b{64}/);

  const withoutQr = renderPointsRedemptionEmail({
    title: 'Entrada a LaBitConf',
    cost: 150,
    delivery: qrDelivery,
    accountUrl: 'https://xplora.test/cuenta?vista=recompensas',
  });
  assert.doesNotMatch(withoutQr, /src="cid:/);
  assert.match(withoutQr, /guardado de forma privada/);
});

test('malformed structured delivery fails closed without exposing its descriptor', () => {
  const privateDescriptor = `${REWARD_DELIVERY_PREFIX}{"publicId":"private/internal/path"}`;
  const html = renderPointsRedemptionEmail({
    title: 'Entrada a LaBitConf',
    cost: 150,
    delivery: privateDescriptor,
    accountUrl: 'https://xplora.test/cuenta?vista=recompensas',
  });
  assert.match(html, /No pudimos mostrar las instrucciones/);
  assert.doesNotMatch(html, /private\/internal\/path|xplora-delivery:v1/);
});

test('redemption email retries use one deterministic Resend idempotency key', async () => {
  const config = {
    ...getAppConfig(),
    publicSiteUrl: 'https://xplora.test',
    resend: { apiKey: 're_fixture', from: 'test@xplora.test', fromName: 'Xplora' },
  };
  const captured: { url: string; key: string | null; body: Record<string, unknown> }[] = [];
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    captured.push({
      url: request.url,
      key: request.headers.get('idempotency-key'),
      body: await request.json() as Record<string, unknown>,
    });
    return Response.json({ id: 'email-fixture' });
  };

  const input = {
    redemptionId: '40000000-0000-4000-8000-000000000001',
    to: 'member@example.test',
    title: 'Entrada a LaBitConf',
    cost: 150,
    delivery: qrDelivery,
    qrAttachment: {
      contentBase64: Buffer.from('fixture-png').toString('base64'),
      contentType: 'image/png' as const,
    },
  };
  try {
    assert.deepEqual(await sendPointsRedemptionEmail(config, input), {
      status: 'sent', providerId: 'email-fixture',
    });
    assert.deepEqual(await sendPointsRedemptionEmail(config, input), {
      status: 'sent', providerId: 'email-fixture',
    });
  } finally {
    globalThis.fetch = nativeFetch;
  }

  assert.equal(captured.length, 2);
  assert.ok(captured.every((call) => call.url === RESEND_SEND_URL));
  assert.deepEqual(captured.map((call) => call.key), [
    `points-redemption/${input.redemptionId}`,
    `points-redemption/${input.redemptionId}`,
  ]);
  assert.deepEqual(captured.map((call) => call.body.to), [
    [input.to],
    [input.to],
  ]);
  assert.ok(captured.every((call) => call.body.subject === 'Tu entrada para LaBitConf · Xplora'));
  assert.ok(captured.every((call) => String(call.body.html).includes(`cid:${POINTS_QR_CONTENT_ID}`)));
  assert.deepEqual(captured.map((call) => call.body.attachments), [
    [{
      content: input.qrAttachment.contentBase64,
      filename: 'entrada-labitconf.png',
      content_type: 'image/png',
      content_id: POINTS_QR_CONTENT_ID,
    }],
    [{
      content: input.qrAttachment.contentBase64,
      filename: 'entrada-labitconf.png',
      content_type: 'image/png',
      content_id: POINTS_QR_CONTENT_ID,
    }],
  ]);
});

test('redemption email falls back to the private account link when the QR attachment is unavailable', async () => {
  const config = {
    ...getAppConfig(),
    publicSiteUrl: 'https://xplora.test',
    resend: { apiKey: 're_fixture', from: 'test@xplora.test', fromName: 'Xplora' },
  };
  const base = {
    redemptionId: '40000000-0000-4000-8000-000000000001',
    to: 'member@example.test',
    title: 'Entrada a LaBitConf',
    cost: 150,
    delivery: qrDelivery,
  };
  const requests: Record<string, unknown>[] = [];
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), RESEND_SEND_URL);
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({ id: 'fallback-email-fixture' });
  };
  try {
    assert.deepEqual(await sendPointsRedemptionEmail(config, base), {
      status: 'sent', providerId: 'fallback-email-fixture',
    });
  } finally {
    globalThis.fetch = nativeFetch;
  }
  assert.equal(requests.length, 1);
  assert.equal('attachments' in requests[0], false);
  assert.doesNotMatch(String(requests[0].html), /src="cid:/);
  assert.match(String(requests[0].text), /https:\/\/xplora\.test\/cuenta\?vista=recompensas#mis-canjes/);
});

test('redemption email rejects mismatched or malformed QR attachments before Resend', async () => {
  const config = {
    ...getAppConfig(),
    publicSiteUrl: 'https://xplora.test',
    resend: { apiKey: 're_fixture', from: 'test@xplora.test', fromName: 'Xplora' },
  };
  const base = {
    redemptionId: '40000000-0000-4000-8000-000000000001',
    to: 'member@example.test',
    title: 'Entrada a LaBitConf',
    cost: 150,
    delivery: qrDelivery,
  };
  const wrongType = await sendPointsRedemptionEmail(config, {
    ...base,
    qrAttachment: { contentBase64: Buffer.from('not-a-jpeg').toString('base64'), contentType: 'image/jpeg' },
  });
  assert.equal(wrongType.status, 'rejected');
  assert.match(wrongType.status === 'rejected' ? wrongType.error : '', /tipo/i);
  const malformed = await sendPointsRedemptionEmail(config, {
    ...base,
    qrAttachment: { contentBase64: '***', contentType: 'image/png' },
  });
  assert.equal(malformed.status, 'rejected');
  assert.match(malformed.status === 'rejected' ? malformed.error : '', /inválido/i);
});

test('redemption email reports configuration failures instead of throwing after a canje', async () => {
  const config = {
    ...getAppConfig(),
    publicSiteUrl: 'not a URL',
    resend: { apiKey: 're_fixture', from: 'test@xplora.test', fromName: null },
  };
  const error = await sendPointsRedemptionEmail(config, {
    redemptionId: '40000000-0000-4000-8000-000000000001',
    to: 'member@example.test',
    title: 'Entrada',
    cost: 150,
    delivery: 'TICKET-123',
  });
  assert.equal(error.status, 'rejected');
  assert.match(error.status === 'rejected' ? error.error : '', /invalid url/i);
});

test('redemption email distinguishes definitive rejects from ambiguous provider outcomes', async () => {
  const config = {
    ...getAppConfig(),
    publicSiteUrl: 'https://xplora.test',
    resend: { apiKey: 're_fixture', from: 'test@xplora.test', fromName: 'Xplora' },
  };
  const input = {
    redemptionId: '40000000-0000-4000-8000-000000000001',
    to: 'member@example.test',
    title: 'Entrada',
    cost: 150,
    delivery: 'TICKET-123',
  };
  const nativeFetch = globalThis.fetch;
  const responses: (() => Promise<Response>)[] = [
    async () => Response.json({ message: 'invalid recipient' }, { status: 422 }),
    async () => Response.json({ message: 'provider unavailable' }, { status: 503 }),
    async () => new Response('not-json', { status: 200 }),
    async () => { throw new TypeError('network unavailable'); },
  ];
  globalThis.fetch = async () => responses.shift()!();
  try {
    assert.deepEqual(await sendPointsRedemptionEmail(config, input), {
      status: 'rejected', error: 'invalid recipient',
    });
    assert.deepEqual(await sendPointsRedemptionEmail(config, input), {
      status: 'ambiguous', error: 'provider unavailable',
    });
    assert.deepEqual(await sendPointsRedemptionEmail(config, input), {
      status: 'ambiguous', error: 'Resend aceptó la solicitud pero devolvió una respuesta inválida.',
    });
    assert.deepEqual(await sendPointsRedemptionEmail(config, input), {
      status: 'ambiguous', error: 'network unavailable',
    });
  } finally {
    globalThis.fetch = nativeFetch;
  }
});
