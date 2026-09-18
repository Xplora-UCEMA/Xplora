#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';
import { decodeQRBatch } from 'qr/decode.js';
import pngjs from 'pngjs';

const { PNG } = pngjs;
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 4_096;
const MAX_PIXELS = MAX_DIMENSION * MAX_DIMENSION;
const MAX_PAYLOAD_BYTES = 8 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function finish(body, status) {
  fs.writeSync(1, `${JSON.stringify(body)}\n`);
  process.exit(status);
}

function fail() {
  finish({ count: 0, error: 'decode_failed' }, 3);
}

try {
  if (process.argv.length === 3 && process.argv[2] === '--self-test') {
    finish({ ok: true }, 0);
  }
  if (process.argv.length !== 3) fail();
  const descriptor = fs.openSync(process.argv[2], 'r');
  const stats = fs.fstatSync(descriptor);
  if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_INPUT_BYTES) {
    fs.closeSync(descriptor);
    fail();
  }
  const input = fs.readFileSync(descriptor);
  fs.closeSync(descriptor);
  if (input.length !== stats.size) fail();
  if (
    input.length < 33 ||
    !input.subarray(0, 8).equals(PNG_SIGNATURE) ||
    input.readUInt32BE(8) !== 13 ||
    input.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    fail();
  }
  const declaredWidth = input.readUInt32BE(16);
  const declaredHeight = input.readUInt32BE(20);
  if (
    declaredWidth <= 0 ||
    declaredHeight <= 0 ||
    declaredWidth > MAX_DIMENSION ||
    declaredHeight > MAX_DIMENSION ||
    declaredWidth * declaredHeight > MAX_PIXELS
  ) {
    fail();
  }

  const image = PNG.sync.read(input, {
    checkCRC: true,
    skipRescale: false,
  });
  const { width, height, data } = image;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width !== declaredWidth ||
    height !== declaredHeight ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION ||
    width * height > MAX_PIXELS ||
    data.length !== width * height * 4
  ) {
    fail();
  }

  const [rawResults] = await decodeQRBatch(
    [{ width, height, data }],
    {
      format: 'RGBA',
      effort: Infinity,
      timeLimit: Infinity,
      maxSize: { width, height },
    },
  );
  const payloads = rawResults.filter((result) => typeof result === 'string');
  if (payloads.length === 0) finish({ count: 0 }, 2);
  if (payloads.length !== 1) finish({ count: payloads.length }, 2);

  const payload = payloads[0];
  if (!payload || Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) fail();
  finish({ count: 1, payload }, 0);
} catch {
  fail();
}
