import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REWARD_DELIVERY_PREFIX,
  encodeRewardDelivery,
  parseRewardDelivery,
  rewardQrFileName,
  type RewardQrDelivery,
} from '../src/lib/rewardDelivery.js';

const fixture: RewardQrDelivery = {
  type: 'qr',
  provider: 'cloudinary',
  eventSlug: 'labitconf',
  eventTitle: 'LaBitConf',
  publicId: `xplora-points/tickets/labitconf/${'c'.repeat(64)}`,
  version: 1720000000,
  format: 'png',
  imageSha256: 'a'.repeat(64),
  qrFingerprint: 'b'.repeat(64),
};

test('structured reward delivery round-trips in a canonical prefixed format', () => {
  const encoded = encodeRewardDelivery(fixture);
  assert.ok(encoded.startsWith(REWARD_DELIVERY_PREFIX));
  const parsed = parseRewardDelivery(encoded);
  assert.equal(parsed.kind, 'qr');
  if (parsed.kind !== 'qr') return;
  assert.deepEqual(parsed.value, fixture);
  assert.equal(rewardQrFileName(parsed.value), 'entrada-labitconf.png');
  assert.doesNotMatch(encoded, /https?:\/\//);
});

test('delivery parser preserves legacy text and fails closed on malformed descriptors', () => {
  assert.deepEqual(parseRewardDelivery('TICKET-123\nPresentalo al ingresar.'), {
    kind: 'legacy',
    text: 'TICKET-123\nPresentalo al ingresar.',
  });
  for (const invalid of [
    { ...fixture, provider: 'public-url' },
    { ...fixture, publicId: '../private-ticket' },
    { ...fixture, format: 'svg' },
    { ...fixture, imageSha256: 'short' },
    { ...fixture, imageSha256: 'A'.repeat(64) },
    { ...fixture, fileName: '../../ticket.png' },
    { ...fixture, qrFingerprint: 'not-a-hmac' },
    { ...fixture, unexpected: true },
  ]) {
    const raw = REWARD_DELIVERY_PREFIX + JSON.stringify(invalid);
    assert.deepEqual(parseRewardDelivery(raw), { kind: 'invalid' });
    assert.throws(() => encodeRewardDelivery(invalid as RewardQrDelivery), /inválido/i);
  }
});

test('QR filename is derived from the validated event and normalizes jpeg', () => {
  const parsed = parseRewardDelivery(encodeRewardDelivery(fixture));
  assert.equal(parsed.kind, 'qr');
  if (parsed.kind === 'qr') assert.equal(rewardQrFileName(parsed.value), 'entrada-labitconf.png');
  assert.equal(rewardQrFileName({ ...fixture, format: 'jpeg' }), 'entrada-labitconf.jpg');
});
