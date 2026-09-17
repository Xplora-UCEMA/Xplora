/** Run after npm run build: node --test scripts/check-startup-day-metadata.mjs */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(project, 'dist');
const read = (name) => readFileSync(path.join(dist, name), 'utf8');

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1];
}

function meta(html, key) {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => tag)
    .filter(tag => attribute(tag, 'name') === key || attribute(tag, 'property') === key);
  assert.equal(tags.length, 1, `Exactly one ${key} tag`);
  return attribute(tags[0], 'content');
}

function title(html) {
  const tags = [...html.matchAll(/<title>([^<]*)<\/title>/gi)];
  assert.equal(tags.length, 1, 'Exactly one title');
  return tags[0][1];
}

function canonical(html) {
  const tags = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => tag)
    .filter(tag => attribute(tag, 'rel') === 'canonical');
  assert.equal(tags.length, 1, 'Exactly one canonical');
  return attribute(tags[0], 'href');
}

test('build publishes crawler-readable recap metadata without changing Xplora home metadata or app assets', () => {
  const source = readFileSync(path.join(project, 'index.html'), 'utf8');
  const home = read('index.html');
  const recap = read('startup-day.html');
  const expectedTitle = 'Así fue Startup Day 2026 | Xplora UCEMA';
  const expectedDescription = 'Reviví Startup Day: las fotos, las charlas, las voces y los encuentros del 11 de septiembre de 2026 en UCEMA. Una experiencia de Xplora.';
  const expectedUrl = 'https://startupday.xploraucema.com/';
  const expectedImage = `${expectedUrl}recap/hero-1280.webp`;

  assert.equal(title(home), title(source));
  assert.equal(canonical(home), canonical(source));
  for (const key of ['description', 'og:title', 'og:description', 'og:url', 'og:image', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    assert.equal(meta(home, key), meta(source, key), `Home ${key} is preserved`);
  }
  assert.equal(title(recap), expectedTitle);
  assert.equal(canonical(recap), expectedUrl);
  for (const key of ['og:title', 'twitter:title']) assert.equal(meta(recap, key), expectedTitle);
  for (const key of ['description', 'og:description', 'twitter:description']) assert.equal(meta(recap, key), expectedDescription);
  assert.equal(meta(recap, 'og:url'), expectedUrl);
  assert.equal(meta(recap, 'twitter:card'), 'summary_large_image');
  for (const key of ['og:image', 'twitter:image']) assert.equal(meta(recap, key), expectedImage);
  assert.ok(existsSync(path.join(dist, new URL(expectedImage).pathname)), 'Share image ships with the build');
  const moduleScripts = html => [...html.matchAll(/<script\b[^>]*type="module"[^>]*>/g)].map(([tag]) => attribute(tag, 'src'));
  assert.ok(moduleScripts(home).length > 0, 'Built app has a module entrypoint');
  assert.deepEqual(moduleScripts(recap), moduleScripts(home), 'Both documents use the same built app');
});

test('production Express chooses the HTML by host while still serving real assets and API 404s', async (t) => {
  const { default: express } = await import('express');
  const { setupSpaStaticIfProduction } = await import('../dist-server/http/setup-spa-static.js');
  const app = express();
  setupSpaStaticIfProduction(app, { nodeEnv: 'production', paths: { webDist: dist } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  // node:http preserves Host; Node's fetch strips custom Host headers on some versions.
  const request = (hostname, pathname = '/') => new Promise((resolve, reject) => {
    httpGet(new URL(pathname, origin), { headers: { Host: hostname } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
  const home = await request('xploraucema.com');
  assert.equal(title(home.body), title(read('index.html')));
  const recap = await request('startupday.xploraucema.com');
  assert.equal(recap.status, 200);
  assert.equal(title(recap.body), title(read('startup-day.html')));
  const image = await request('startupday.xploraucema.com', '/recap/hero-1280.webp');
  assert.equal(image.status, 200);
  assert.match(image.headers['content-type'], /^image\/webp/);
  const missingApi = await request('startupday.xploraucema.com', '/api/no-such-route');
  assert.equal(missingApi.status, 404);
  assert.equal(JSON.parse(missingApi.body).code, 'NOT_FOUND');
});
