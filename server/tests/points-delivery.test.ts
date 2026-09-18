import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodeQrTicketDelivery,
  parseQrTicketDelivery,
  POINTS_DELIVERY_PREFIX,
  type QrTicketDelivery,
} from '../src/domain/points-delivery.js';

const descriptor: QrTicketDelivery = {
  type: 'qr',
  provider: 'cloudinary',
  eventSlug: 'labitconf',
  eventTitle: 'LaBitConf',
  publicId: `xplora-points/tickets/labitconf/${'a'.repeat(64)}`,
  version: 1770000000,
  format: 'png',
  imageSha256: 'b'.repeat(64),
  qrFingerprint: 'c'.repeat(64),
};

test('QR ticket delivery round-trips through a canonical private descriptor', () => {
  const encoded = encodeQrTicketDelivery(descriptor);
  assert.ok(encoded.startsWith(POINTS_DELIVERY_PREFIX));
  assert.deepEqual(parseQrTicketDelivery(encoded), descriptor);
  assert.equal(encoded.includes('https://'), false);
});

test('QR ticket delivery rejects legacy, traversal, extra fields and malformed hashes', () => {
  assert.equal(parseQrTicketDelivery('TICKET-LEGACY'), null);
  for (const invalid of [
    { ...descriptor, publicId: `other-folder/${'a'.repeat(64)}` },
    { ...descriptor, publicId: `xplora-points/tickets/labitconf/../${'a'.repeat(64)}` },
    { ...descriptor, imageSha256: 'not-a-hash' },
    { ...descriptor, qrFingerprint: '0'.repeat(63) },
    { ...descriptor, unexpected: true },
  ]) {
    assert.equal(parseQrTicketDelivery(`${POINTS_DELIVERY_PREFIX}${JSON.stringify(invalid)}`), null);
  }
});

