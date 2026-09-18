import { expect, test } from '@playwright/test';
import { encodeRewardDelivery } from '../../src/lib/rewardDelivery';

const redemptionId = '40000000-0000-4000-8000-000000000001';
const delivery = encodeRewardDelivery({
  type: 'qr',
  provider: 'cloudinary',
  eventSlug: 'labitconf',
  eventTitle: 'LaBitConf',
  publicId: `xplora-points/tickets/labitconf/${'a'.repeat(64)}`,
  version: 1770000000,
  format: 'png',
  imageSha256: 'b'.repeat(64),
  qrFingerprint: 'c'.repeat(64),
});
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const account = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'member@example.test', displayName: 'Alex Demo', firstName: 'Alex', lastName: 'Demo',
  phone: '', avatarUrl: '', studies: [], jobs: [], languages: [], skills: [], cvUrl: '',
  emailConfirmed: true, createdAt: '2026-09-17T12:00:00Z',
};
const redemption = {
  id: redemptionId, title: 'Entrada a LaBitConf', cost: 150, delivery,
  created_at: '2026-09-18T12:00:00Z',
};

test('a private redeemed ticket loads only after opening and exposes safe open/download actions', async ({ page }) => {
  let qrRequests = 0;
  await page.addInitScript(() => localStorage.setItem('xplora-member-token', 'fixture-member-token'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/member/points/redemptions/${redemptionId}/qr`) {
      qrRequests += 1;
      await route.fulfill({ body: png, contentType: 'image/png' });
      return;
    }
    if (path === '/api/member/me') {
      await route.fulfill({ json: { account, events: [] } });
      return;
    }
    if (path === '/api/member/points') {
      await route.fulfill({ json: {
        balance: '0', streaks: { commitment: 0, consecutive: 0 },
        program: { notice: '', closes_at: null }, rewards: [], ledger: [],
        redemptions: [redemption],
      } });
      return;
    }
    if (path === '/api/member/points/tasks') {
      await route.fulfill({ json: { tasks: [] } });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cuenta?vista=recompensas');
  const disclosure = page.locator('.xp-ticket-disclosure');
  await expect(disclosure.getByText('Abrir entrada', { exact: true })).toBeVisible();
  expect(qrRequests).toBe(0);

  await disclosure.locator('summary').click();
  await expect(page.getByRole('img', { name: 'Código QR de tu entrada para LaBitConf' })).toBeVisible();
  expect(qrRequests).toBe(1);
  await expect(page.getByRole('link', { name: 'Abrir en grande el QR de Entrada a LaBitConf' })).toHaveAttribute('href', /^blob:/);
  await expect(page.getByRole('link', { name: 'Descargar el QR de Entrada a LaBitConf' })).toHaveAttribute('download', 'entrada-labitconf.png');

  await disclosure.locator('summary').click();
  await expect(page.getByRole('img', { name: 'Código QR de tu entrada para LaBitConf' })).toHaveCount(0);
  await disclosure.locator('summary').click();
  await expect(page.getByRole('img', { name: 'Código QR de tu entrada para LaBitConf' })).toBeVisible();
  expect(qrRequests).toBe(2);
});

test('past redemptions remain usable read-only when Points is disabled', async ({ page }) => {
  let redemptionRequests = 0;
  let qrRequests = 0;
  let writes = 0;
  await page.addInitScript(() => localStorage.setItem('xplora-member-token', 'fixture-member-token'));
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes += 1;
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/member/points/redemptions/${redemptionId}/qr`) {
      qrRequests += 1;
      await route.fulfill({ body: png, contentType: 'image/png' });
      return;
    }
    if (path === '/api/member/me') {
      await route.fulfill({ json: { account, events: [] } });
      return;
    }
    if (path === '/api/member/points') {
      await route.fulfill({ json: { available: false } });
      return;
    }
    if (path === '/api/member/points/redemptions') {
      redemptionRequests += 1;
      await route.fulfill({ json: { redemptions: [redemption] } });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cuenta?vista=recompensas');

  await expect(page.getByText('Xplora Points no está disponible para nuevas acciones o canjes.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mis canjes' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Xplora Points' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Recompensas' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Canjear/ })).toHaveCount(0);
  const disclosure = page.locator('.xp-ticket-disclosure');
  await expect(disclosure.getByText('Abrir entrada', { exact: true })).toBeVisible();
  expect(redemptionRequests).toBe(1);
  expect(qrRequests).toBe(0);
  expect(writes).toBe(0);

  await disclosure.locator('summary').click();
  await expect(page.getByRole('img', { name: 'Código QR de tu entrada para LaBitConf' })).toBeVisible();
  expect(qrRequests).toBe(1);
  expect(writes).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('read-only redemptions expose an honest retry state', async ({ page }) => {
  let redemptionRequests = 0;
  let writes = 0;
  await page.addInitScript(() => localStorage.setItem('xplora-member-token', 'fixture-member-token'));
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes += 1;
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/member/me') {
      await route.fulfill({ json: { account, events: [] } });
      return;
    }
    if (path === '/api/member/points') {
      await route.fulfill({ json: { available: false } });
      return;
    }
    if (path === '/api/member/points/redemptions') {
      redemptionRequests += 1;
      if (redemptionRequests === 1) {
        await route.fulfill({ status: 503, json: { error: 'No pudimos cargar tus canjes.' } });
      } else {
        await route.fulfill({ json: { redemptions: [] } });
      }
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.goto('/cuenta?vista=recompensas');
  await expect(page.getByRole('alert')).toContainText('No pudimos cargar tus canjes.');
  await expect(page.getByText('Todavía no hiciste canjes')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reintentar Mis canjes' }).click();
  await expect(page.getByRole('heading', { name: 'Todavía no hiciste canjes' })).toBeVisible();
  expect(redemptionRequests).toBe(2);
  expect(writes).toBe(0);
});
