import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppConfig } from '../src/config/env.js';
import { parseQrTicketDelivery } from '../src/domain/points-delivery.js';
import {
  PointsTicketStorageService,
  type TicketCloudinaryGateway,
} from '../src/services/points-ticket-storage.service.js';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
const imageSha256 = createHash('sha256').update(png).digest('hex');
const qrFingerprint = 'b'.repeat(64);
const config = { cloudinary: null } as AppConfig;

function fixtureGateway(overrides: Partial<TicketCloudinaryGateway> = {}): TicketCloudinaryGateway {
  const publicId = `xplora-points/tickets/labitconf/${imageSha256}`;
  return {
    async uploadPng(_bytes, sentPublicId) {
      return { publicId: sentPublicId, version: 1770000000, format: 'png', type: 'authenticated' };
    },
    privateDownloadUrl(id, format) {
      assert.equal(id, publicId);
      assert.equal(format, 'png');
      return 'https://private-cloudinary.test/ticket';
    },
    async destroy() {},
    ...overrides,
  };
}

test('ticket storage uploads authenticated PNG and returns no public URL or QR payload', async () => {
  const storage = new PointsTicketStorageService(config, fetch, fixtureGateway());
  const result = await storage.uploadPng({
    bytes: png,
    eventSlug: 'labitconf',
    eventTitle: 'LaBitConf',
    imageSha256,
    qrFingerprint,
  });
  assert.deepEqual(parseQrTicketDelivery(result.delivery), result.descriptor);
  assert.equal(result.delivery.includes('https://'), false);
  assert.equal(result.delivery.includes('payload'), false);
});

test('ticket storage proxies bounded bytes and validates the immutable image hash', async () => {
  const storage = new PointsTicketStorageService(
    config,
    async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }),
    fixtureGateway(),
  );
  const uploaded = await storage.uploadPng({
    bytes: png, eventSlug: 'labitconf', eventTitle: 'LaBitConf', imageSha256, qrFingerprint,
  });
  const ticket = await storage.read(uploaded.delivery);
  assert.deepEqual(ticket.bytes, png);
  assert.equal(ticket.contentType, 'image/png');
  assert.equal(ticket.fileName, 'entrada-labitconf.png');

  const tampered = new PointsTicketStorageService(
    config,
    async () => new Response(Buffer.concat([png, Buffer.from([4])]), { status: 200 }),
    fixtureGateway(),
  );
  await assert.rejects(() => tampered.read(uploaded.delivery), /integridad/);
});

test('ticket storage refuses a public Cloudinary upload response', async () => {
  let destroyed = '';
  const gateway = fixtureGateway({
    async uploadPng(_bytes, publicId) {
      return { publicId, version: 1, format: 'png', type: 'upload' };
    },
    async destroy(publicId) { destroyed = publicId; },
  });
  const storage = new PointsTicketStorageService(config, fetch, gateway);
  await assert.rejects(() => storage.uploadPng({
    bytes: png, eventSlug: 'labitconf', eventTitle: 'LaBitConf', imageSha256, qrFingerprint,
  }), /asset privado/);
  assert.equal(destroyed, '', 'an ambiguous/pre-existing provider asset must never be deleted automatically');
});
