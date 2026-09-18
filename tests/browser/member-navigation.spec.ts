import { expect, test } from "@playwright/test";

test('public member entry is hidden while direct account access remains available', async ({ page }) => {
  test.skip(process.env.VITE_PUBLIC_MEMBER_ENTRY_ENABLED === 'true', 'Visible-entry variant is tested separately.');
  await page.route('**/api/**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/public/site-media' ? null : [] }));
  await page.goto('/cuenta');
  await expect(page.getByRole('heading', { name: 'Tu lugar en Xplora.' })).toBeVisible();
  for (const signedIn of [false, true]) {
    if (signedIn) {
      await page.addInitScript(() => localStorage.setItem('xplora-member-token', 'fixture-only'));
      await page.route('**/api/member/me', route => route.fulfill({ json: { account: { id: 'fixture', email: 'demo@example.test', displayName: 'Alex', emailConfirmed: true }, events: [] } }));
    }
    for (const path of ['/', '/?startupday=1', '/sponsors']) {
      await page.goto(path);
      await expect(page.locator('.sd-top')).toBeVisible();
      await expect(page.locator('.sd-top__account')).toHaveCount(0);
      await expect(page.locator('.sd-tabs a')).toHaveCount(3);
    }
  }
});

test("member access is the prominent local CTA, including mobile and signed-in navigation", async ({
  page,
}) => {
  test.skip(process.env.VITE_PUBLIC_MEMBER_ENTRY_ENABLED !== 'true', 'Hidden by default; run explicitly enabled to verify the public CTA.');
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path === "/api/public/site-media" ? null : [],
    });
  });
  for (const path of ["/", "/?startupday=1", "/sponsors"]) {
    await page.goto(path);
    const header = page.locator(".sd-top");
    const access = header.getByRole("link", {
      name: "Iniciar sesión",
      exact: true,
    });
    await expect(access).toHaveClass(/sd-top__cta/);
    await expect(access).toHaveAttribute(
      "href",
      "http://127.0.0.1:5199/cuenta",
    );
    await expect(access).not.toHaveAttribute("target", "_blank");
    await expect(header.getByText("Sumarme", { exact: true })).toHaveCount(0);
    await expect(header.locator(".sd-tabs a")).toHaveCount(3);
  }

  await page.goto("/");
  await expect(page.locator(".sd-root")).toHaveClass(/is-loaded/);
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.screenshot({ path: ".impeccable/review/member-nav-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const access = page.locator(".sd-top__account");
  await expect(access).toBeVisible();
  await expect(access).toHaveCSS("min-height", "44px");
  await access.focus();
  await expect(access).toBeFocused();
  await page.screenshot({ path: ".impeccable/review/member-nav-mobile.png" });
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page
      .locator(".sd-top")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await access.press("Enter");
  await expect(page).toHaveURL("http://127.0.0.1:5199/cuenta");
  await expect(
    page.getByRole("heading", { name: "Tu lugar en Xplora." }),
  ).toBeVisible();

  await page.evaluate(() =>
    localStorage.setItem(
      "xplora-member-token",
      "test-fixture-not-a-valid-token",
    ),
  );
  await page.route("**/api/member/me", (route) =>
    route.fulfill({
      json: {
        account: {
          id: "demo",
          email: "demo@example.test",
          displayName: "Alex",
          emailConfirmed: true,
        },
        events: [],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".sd-top__account")).toHaveText("Mi cuenta");
  await expect(page.locator(".sd-top__account")).toHaveAttribute(
    "href",
    "http://127.0.0.1:5199/cuenta",
  );
});
