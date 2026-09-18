import { test, expect, type Page } from "@playwright/test";
import { renderMemberAccessEmail } from "../../server/src/services/member-access-email";

const account = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.test",
  displayName: "Alex Demo",
  firstName: "Alex",
  lastName: "Demo",
  phone: "",
  avatarUrl: "",
  studies: [],
  jobs: [],
  languages: [],
  skills: [],
  cvUrl: "",
  emailConfirmed: true,
  createdAt: "2026-09-17T12:00:00Z",
};
const snapshot = {
  balance: "150",
  streaks: { commitment: 2, consecutive: 1 },
  program: { notice: "", closes_at: null },
  rewards: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      title: "Entrada a LaBitConf",
      description:
        "Un encuentro con ideas, proyectos y personas de la comunidad.",
      cost: 150,
      active: true,
      per_member: 1,
      available: 3,
      redeemed: 0,
    },
  ],
  ledger: [
    {
      id: "1",
      amount: "30",
      description: "Encuesta Startup Day",
      metadata: {},
      created_at: "2026-09-12T12:00:00Z",
    },
    {
      id: "2",
      amount: "100",
      description: "Asistencia · Startup Day",
      metadata: { multiplier: 1 },
      created_at: "2026-09-11T12:00:00Z",
    },
    {
      id: "3",
      amount: "20",
      description: "Bienvenida a Xplora",
      metadata: {},
      created_at: "2026-09-10T12:00:00Z",
    },
  ],
  redemptions: [],
};

test('mobile member navigation and task filters are accessible without issuing claims', async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let writes = 0;
  page.on('request', request => { if (request.method() === 'POST') writes++; });
  await page.route('**/api/member/points/tasks', route => route.fulfill({ json: { tasks: [
    { id: 'open', title: 'Encuesta disponible', kind: 'survey', points: 30, date: '2099-01-01', status: 'available', href: null },
    { id: 'done', title: 'Encuesta completada', kind: 'survey', points: 30, date: '2099-01-01', status: 'completed', href: null },
  ] } }));
  await page.goto('/cuenta?vista=tasks');
  const navigation = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(navigation.getByRole('link')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: 'Sumá Points.' })).toBeVisible();
  await page.getByRole('button', { name: /Completadas/ }).click();
  await expect(page.getByRole('heading', { name: 'Encuesta completada' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Encuesta disponible' })).toHaveCount(0);
  await page.getByRole('button', { name: /Disponibles/ }).click();
  await expect(page.getByRole('button', { name: 'Completar encuesta' })).toBeVisible();
  expect(writes).toBe(0);
  for (const link of await navigation.getByRole('link').all()) {
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
});

test('member home is a personal hub across mobile and desktop', async ({ page }) => {
  await mock(page);
  await page.route('**/api/member/points/tasks', route => route.fulfill({ json: { tasks: [
    { id: 'survey', title: 'Contanos cómo estuvo Startup Day', kind: 'survey', points: 30, date: '2026-09-30T23:59:00Z', status: 'available', href: null },
  ] } }));
  await page.route('**/api/member/jobs', route => route.fulfill({ json: { jobs: [
    { id: 'job-1', title: 'Product Analyst', company: 'Núcleo', location: 'Buenos Aires', type: 'Híbrido', area: 'Producto' },
    { id: 'job-2', title: 'Founders Associate', company: 'Lumen', location: 'Remoto', type: 'Full time', area: 'Estrategia' },
  ] } }));
  await page.route('**/api/public/eventos', route => route.fulfill({ json: [{
    id: 'demo-event', title: 'Founder Sessions: de cero a primera venta', emoji: '✦', tag_type: 'p', tag_label: 'Founder Sessions',
    date_display: '28 de septiembre de 2099 · 18:30', day: '28', month: 'SEP', location: 'UCEMA · Reconquista 775', modality: 'Presencial',
    capacity: '120', cost: 'Sin cargo', registration_link: 'https://lu.ma/xplora-demo', summary: 'Una conversación honesta sobre los primeros clientes.',
    about: '', speaker_name: 'Comunidad Xplora', speaker_role: '', speaker_initials: 'XP', speaker_bio: '', speakers: [],
    thumbnail_url: null, home_poster_url: null, realizado: false, created_at: '2099-09-18T00:00:00Z',
  }] }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cuenta');
  await expect(page.getByRole('heading', { name: /Alex\.$/ })).toBeVisible();
  await expect(page.locator('.mh-balance')).toHaveAttribute('aria-label', '150 points disponibles');
  await expect(page.getByText('Beneficio desbloqueado', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explorar beneficios' }).first()).toHaveAttribute('href', '/cuenta?vista=recompensas');
  await expect(page.getByRole('heading', { name: 'Founder Sessions: de cero a primera venta' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reservar mi lugar' })).toHaveAttribute('href', 'https://lu.ma/xplora-demo');
  await expect(page.getByRole('heading', { name: 'Contanos cómo estuvo Startup Day' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Oportunidades para vos' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Product Analyst/ })).toHaveAttribute('href', '/empleo');
  await expect(page.getByRole('heading', { name: 'Podés llegar a esto' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Perfil completo al 13%' })).toBeVisible();
  const mobileNav = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(mobileNav.getByRole('link')).toHaveCount(5);
  expect(await mobileNav.getByRole('link').allTextContents()).toEqual(['Inicio', 'Eventos', 'Points', 'Empleo', 'Perfil']);
  await expect(page.locator('.mh-sidebar')).toBeHidden();
  await expect(page.locator('.ma-app__top')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.impeccable/review/hub-mobile-390.png', fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.mh-sidebar')).toBeVisible();
  await expect(page.locator('.mh-bottom-nav')).toBeHidden();
  await expect(page.locator('.mh-points-card')).toBeVisible();
  await expect(page.locator('.mh-event-card')).toBeVisible();
  const [pointsBox, eventBox] = await Promise.all([
    page.locator('.mh-points-card').boundingBox(),
    page.locator('.mh-event-card').boundingBox(),
  ]);
  expect(pointsBox?.y).toBe(eventBox?.y);
  expect(pointsBox?.width).toBeGreaterThan(350);
  expect(eventBox?.width).toBeGreaterThan(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.impeccable/review/hub-desktop-1440.png', fullPage: true, animations: 'disabled' });
});

test('member greeting never exposes the email as the name', async ({ page }) => {
  await mock(page);
  await page.route('**/api/member/me', route => route.fulfill({ json: {
    account: { ...account, email: 'xplorer@example.test', displayName: '', firstName: '', lastName: '' },
    events: [],
  } }));
  await page.goto('/cuenta');
  await expect(page.getByRole('heading', { name: /Xplorer\.$/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /xplorer@example\.test/i })).toHaveCount(0);
});

test('member web layout stays readable across phone widths and account sections', async ({ page }) => {
  await mock(page);
  const routes = ['/cuenta', '/cuenta/perfil', '/cuenta/eventos', '/cuenta/propuestas', '/empleo'];
  for (const width of [320, 375, 390, 430, 844, 1440]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    for (const [index, path] of routes.entries()) {
      await page.goto(path);
      await expect(page.locator('.ma-premium')).toBeVisible();
      await expect(page.locator('main h1, main h2').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width < 1024) await expect(page.locator('.mh-bottom-nav')).toBeVisible();
      else await expect(page.locator('.mh-sidebar')).toBeVisible();
      for (const input of await page.locator('main input:not([type="file"]):not([type="checkbox"]), main select, main textarea').all()) {
        expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      }
      if (width === 390 || width === 1440) {
        await page.screenshot({ path: `.impeccable/review/member-${index}-${width}.png`, fullPage: true, animations: 'disabled' });
      }
    }
  }
});

test('Tasks opens real registration and completes an eligible survey without awarding points on open', async ({ page }) => {
  await mock(page);
  const tasks = [
    { id: 'event', title: 'Encuentro futuro', kind: 'event', points: 20, date: '2099-01-01', status: 'available', href: 'https://lu.ma/example' },
    { id: 'past', title: 'Encuentro pasado', kind: 'event', points: 20, date: '2020-01-01', status: 'pending', href: null },
    { id: 'survey', title: 'Encuesta del encuentro', kind: 'survey', points: 30, date: '2099-01-01', status: 'available', href: null },
  ];
  await page.route('**/api/member/points/tasks', route => route.fulfill({ json: { tasks } }));
  let claims = 0;
  await page.route('**/api/member/points/tasks/survey/claim', route => {
    claims++; tasks[2].status = 'completed';
    expect(route.request().postDataJSON()).toEqual({ rating: 5, feedback: 'Excelente experiencia' });
    return route.fulfill({ json: { points: 30, alreadyClaimed: false } });
  });
  await page.goto('/cuenta?vista=tasks');
  await expect(page.getByRole('link', { name: 'Inscribirme' })).toHaveAttribute('href', 'https://lu.ma/example');
  await expect(page.getByRole('listitem').filter({ hasText: 'Encuentro pasado' }).getByRole('link')).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('.xp-mark img').evaluateAll(async images => { await Promise.all(images.map(async image => { if (image instanceof HTMLImageElement) { image.loading = 'eager'; await image.decode(); } })); });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.impeccable/review/tasks-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.getByRole('button', { name: 'Completar encuesta' }).click();
  expect(claims).toBe(0);
  await page.getByLabel('¿Cómo estuvo la experiencia?').selectOption('5');
  await page.getByLabel('¿Qué te llevás? ¿Qué mejorarías?').fill('Excelente experiencia');
  await page.screenshot({ path: '.impeccable/review/task-survey-mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Enviar encuesta y sumar puntos' }).click();
  await expect(page.getByText('¡Sumaste 30 Xplora Points!')).toBeVisible();
  expect(claims).toBe(1);
  await expect(page.getByRole('button', { name: 'Completar encuesta' })).toHaveCount(0);
});
test('Google Forms opens externally without claiming and refreshes the balance on return', async ({ page }) => {
  await mock(page);
  let balance = '150';
  let claims = 0;
  await page.route('**/api/member/points', route => route.fulfill({ json: { ...snapshot, balance } }));
  await page.route('**/api/member/points/tasks', route => route.fulfill({ json: { tasks: [{
    id: 'google-task', kind: 'google_form', title: 'Formulario de prueba', points: 30,
    date: '2099-01-01', status: 'available', href: 'https://docs.google.com/forms/d/e/fixture/viewform',
  }] } }));
  await page.route('**/api/member/points/claim', route => { claims++; return route.fulfill({ json: {} }); });
  await page.goto('/cuenta?vista=tasks');
  await expect(page.getByRole('link', { name: 'Completar formulario' })).toHaveAttribute('href', 'https://docs.google.com/forms/d/e/fixture/viewform');
  await expect(page.getByText('Usá el mismo correo de tu cuenta de Xplora.')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: '.impeccable/review/member-google-task-390.png', fullPage: true, animations: 'disabled' });
  expect(claims).toBe(0);
  balance = '180';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.xp-wallet strong')).toHaveText('180');
  expect(claims).toBe(0);
});

test("empty Points panels explain the next action without invented activity", async ({ page }) => {
  await mock(page);
  await page.route("**/api/member/points", (route) => route.fulfill({
    json: { ...snapshot, balance: "0", streaks: { commitment: 0, consecutive: 0 }, ledger: [], rewards: [] },
  }));
  await page.goto("/cuenta?vista=tasks");
  await expect(page.getByText("No hay tareas disponibles por ahora.")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: ".impeccable/review/empty-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".impeccable/review/empty-mobile.png", fullPage: true, animations: "disabled" });
  await page.getByRole('link', { name: 'Movimientos', exact: true }).click();
  await expect(page.getByRole("heading", { name: "Todavía no hay movimientos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver acciones" })).toHaveAttribute("href", "/cuenta?vista=tasks");
  await page.getByRole('link', { name: 'Beneficios', exact: true }).click();
  await expect(page.getByRole("heading", { name: "Estamos preparando las recompensas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Todavía no hiciste canjes" })).toBeVisible();
});
test("Points separates tasks, rewards, streaks and movements without a featured goal", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/cuenta?vista=tasks");
  await expect(page.getByRole("heading", { name: "Sumá Points.", exact: true })).toBeVisible();
  await expect(page.getByText("Tu primer objetivo: 150.")).toHaveCount(0);
  await expect(page.getByText("Entrada a LaBitConf")).toHaveCount(0);
  await expect(page.locator('.xp-mark')).toHaveCount(1);
  await page.getByRole('link', { name: 'Beneficios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entrada a LaBitConf' })).toBeVisible();
  await expect(page.locator('.xp-mark')).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.impeccable/review/rewards-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.getByRole('link', { name: 'Rachas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tus inscripciones' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Eventos seguidos' })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.impeccable/review/streaks-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.getByRole('link', { name: 'Movimientos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tus movimientos' })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `.impeccable/review/movements-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tus movimientos' })).toBeVisible();
});
test("empty events link to the actual public agenda", async ({ page }) => {
  await mock(page);
  await page.goto("/cuenta/eventos");
  await expect(page.getByRole("link", { name: "Explorar eventos" })).toHaveAttribute("href", "/#proximo");
});
test('mobile account menu exposes every account section without horizontal scrolling', async ({ page }) => {
  await mock(page); await page.setViewportSize({ width: 320, height: 844 }); await page.goto('/cuenta');
  await expect(page.getByRole('heading', { name: /Alex\.$/ })).toBeVisible();
  await page.getByLabel('Menú de cuenta', { exact: true }).filter({ has: page.locator('span') }).first().click();
  const logout = await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).boundingBox();
  expect(logout!.x + logout!.width).toBeLessThanOrEqual(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.xp-mark img').evaluateAll(async images => { await Promise.all(images.map(async image => { if (image instanceof HTMLImageElement) { image.loading = 'eager'; await image.decode(); } })); });
  await page.screenshot({ path: '.impeccable/review/narrow-320.png', fullPage: true, animations: 'disabled' });
  await expect(page.getByRole('link', { name: 'Propuestas', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Propuestas', exact: true }).click();
  await expect(page).toHaveURL(/\/cuenta\/propuestas$/);
});
test("proposal loading failure offers retry instead of pretending the list is empty", async ({ page }) => {
  await mock(page);
  await page.route("**/api/member/proposals", (route) => route.fulfill({ status: 503, json: { error: "Temporal" } }));
  await page.goto("/cuenta/propuestas");
  await expect(page.getByRole("button", { name: "Reintentar propuestas" })).toBeVisible();
  await expect(page.getByText("Todavía no enviaste nada")).toHaveCount(0);
});
test("account stays usable before Points is installed", async ({ page }) => {
  await mock(page);
  await page.route("**/api/member/points", (route) =>
    route.fulfill({ json: { available: false } }),
  );
  await page.goto("/cuenta");
  await expect(page.getByRole("heading", { name: /Alex\.$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Completar mi perfil" })).toHaveAttribute("href", "/cuenta/perfil");
  await expect(page.getByText("Points estará disponible muy pronto.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tus Xplora Points" })).toHaveCount(0);
});
test("signup makes clear that the welcome bonus requires an active Points program", async ({ page }) => {
  await mock(page, false);
  await page.goto("/cuenta?vista=tasks");
  await expect(page.getByText("El bonus de bienvenida se acredita cuando Points está habilitado.")).toBeVisible();
});
test("closed program explains why redemption is unavailable even without a notice", async ({
  page,
}) => {
  await mock(page);
  await page.route("**/api/member/points", (route) =>
    route.fulfill({
      json: {
        ...snapshot,
        program: { notice: "", closes_at: "2020-01-01T00:00:00Z" },
      },
    }),
  );
  await page.goto("/cuenta?vista=tasks");
  await expect(
    page.getByText("El programa finalizó. Los canjes están cerrados."),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Beneficios', exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Programa finalizado" }),
  ).toBeDisabled();
  await page.screenshot({
    path: ".impeccable/review/closed-program.png",
    fullPage: true,
  });
});
async function mock(page: Page, signedIn = true) {
  if (signedIn)
    await page.addInitScript(() =>
      localStorage.setItem(
        "xplora-member-token",
        "test-fixture-not-a-valid-token",
      ),
    );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      path === "/api/member/me"
        ? { account, events: [] }
        : path === "/api/member/points"
          ? snapshot
          : path === "/api/member/points/tasks"
            ? { tasks: [] }
          : path === "/api/member/jobs"
            ? { jobs: [] }
          : path === "/api/public/eventos"
            ? []
          : path === "/api/public/site-media"
            ? null
            : [];
    return route.fulfill({ json: body });
  });
}

test("temporary connection failure never erases a saved member session", async ({
  page,
}) => {
  await mock(page);
  await page.route("**/api/member/me", (route) =>
    route.fulfill({ status: 503, json: { error: "Temporal" } }),
  );
  await page.goto("/cuenta");
  await expect(
    page.getByRole("button", { name: "Reintentar conexión" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("xplora-member-token")),
  ).toBe("test-fixture-not-a-valid-token");
});

test("account is usable on desktop and mobile and only redeems after explicit confirmation", async ({
  page,
}) => {
  await mock(page);
  let redemptions = 0;
  await page.route("**/api/member/points/redeem", async (route) => {
    redemptions++;
    const body = route.request().postDataJSON() as { requestId: string };
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    await route.fulfill({ json: { id: "demo-redemption", emailSent: true } });
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/cuenta");
  await expect(
    page.getByRole("heading", { name: /Alex\.$/ }),
  ).toBeVisible();
  await expect(
    page.getByText("150", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".impeccable/review/desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1906, height: 882 });
  await page.locator('.xp-mark img').evaluateAll(async (images) => {
    await Promise.all(images.map(async (image) => {
      if (image instanceof HTMLImageElement) {
        image.loading = 'eager';
        await image.decode();
      }
    }));
  });
  await page.screenshot({ path: ".impeccable/review/user-1906.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".impeccable/review/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole('link', { name: 'Explorar beneficios' }).first().click();
  await page
    .getByRole("button", { name: "Canjear recompensa", exact: true })
    .click();
  expect(redemptions).toBe(0);
  await page.getByRole("button", { name: "Confirmar por 150 puntos" }).click();
  await expect(
    page.getByText("¡Listo! Entrada a LaBitConf ya está en Mis canjes. También te enviamos un email de confirmación."),
  ).toBeVisible();
  expect(redemptions).toBe(1);
});

test("email login supports paste, creates a session, and the magic link waits for confirmation", async ({
  page,
}) => {
  await mock(page, false);
  await page.route("**/api/member/access/request", (route) =>
    route.fulfill({
      json: {
        challengeId: "50000000-0000-4000-8000-000000000001",
        resendAfterSec: 120,
      },
    }),
  );
  let verifies = 0;
  await page.route("**/api/member/access/verify", (route) => {
    verifies++;
    return route.fulfill({ json: { accessToken: "fixture-token", account } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/cuenta");
  await expect(
    page.getByRole("heading", { name: "Tu lugar en Xplora." }),
  ).toBeVisible();
  await page.screenshot({
    path: ".impeccable/review/access-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".impeccable/review/access-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("Email", { exact: true }).fill("demo@example.test");
  await page.getByRole("button", { name: "Continuar con email" }).click();
  await page.getByLabel("Código de seis dígitos").fill("123456");
  await page.getByRole("button", { name: "Entrar a mi cuenta" }).click();
  await expect(
    page.getByRole("heading", { name: /Alex\.$/ }),
  ).toBeVisible();
  expect(verifies).toBe(1);
  await page.goto(
    "/cuenta/confirmar#challenge=50000000-0000-4000-8000-000000000001&token=synthetic-link",
  );
  await expect(
    page.getByRole("button", { name: "Entrar a Xplora", exact: true }),
  ).toBeVisible();
  expect(verifies).toBe(1);
  expect(page.url()).not.toContain("token=");
  await page
    .getByRole("button", { name: "Entrar a Xplora", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Alex\.$/ }),
  ).toBeVisible();
  expect(verifies).toBe(2);
});

test("branded email renders at desktop and phone widths without clipping the access code", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.setContent(
    renderMemberAccessEmail(
      "123456",
      "https://example.test/cuenta/confirmar#test",
      "https://example.test",
    ),
  );
  await expect(
    page.getByRole("link", { name: "Entrar a Xplora" }),
  ).toBeVisible();
  await page.screenshot({
    path: ".impeccable/review/email-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".impeccable/review/email-mobile.png",
    fullPage: true,
  });
});

test("authorized Points staff can manage rewards and create a scoped survey QR", async ({
  page,
}) => {
  await mock(page, false);
  await page.addInitScript(() =>
    localStorage.setItem(
      "sb-xplora-staff-auth",
      JSON.stringify({
        access_token: "fixture-token-not-valid-on-server",
        refresh_token: "fixture-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: {
          id: "70000000-0000-4000-8000-000000000001",
          email: "staff@example.test",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      }),
    ),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        email: "staff@example.test",
        nombre: "Equipo",
        apellido: "Demo",
        equipo: "Xplora",
        permissions: ["points_manage"],
      },
    }),
  );
  let googleCreated = false;
  let googleConnected = false;
  let googleActive = false;
  await page.route('**/api/admin/points/google/status', route => route.fulfill({json:{configured:true,connected:true,
    email:'staff@example.test',workerReady:true,forms:googleCreated ? [{action_id:'google-task',mode:'oauth',sync_error:null}] : []}}));
  await page.route('**/api/admin/points/google/tasks', route => {
    submitted = route.request().postDataJSON() as Record<string,unknown>;
    googleCreated=true; googleConnected=true; googleActive=true;
    return route.fulfill({json:{id:'google-task',url:null,active:true}});
  });
  await page.route('**/api/admin/points/actions/google-task', route => {
    googleActive = Boolean((route.request().postDataJSON() as { active: boolean }).active);
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/admin/points", (route) =>
    route.fulfill({
      json: {
        events: [],
        catalog: [
          { id: "10000000-0000-4000-8000-000000000001", title: "Startup Day" },
        ],
        rewards: snapshot.rewards,
        actions: googleCreated ? [{ id: 'google-task', kind: 'google_form', title: 'Encuesta Google · demo', points: 30,
          active: googleActive, expires_at: '2027-01-01T18:00:00Z', max_claims: 100, xp_claims: [{ count: 0 }],
          xp_google_forms: { form_id: 'fixture-form', connected_at: googleConnected ? '2026-09-17T00:00:00Z' : null, last_received_at: null } }] : [],
        inventory: [],
        redemptions: [],
        responses: [],
      },
    }),
  );
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/admin/points/actions", (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    if (submitted.kind === 'google_form') {
      googleCreated = true;
      return route.fulfill({ json: { id: 'google-task', url: null, connectorSecret: 'synthetic-fixture-only', formId: 'fixture-form' } });
    }
    return route.fulfill({
      json: {
        id: "fixture-action",
        url: "https://example.test/cuenta#claim=synthetic-demo-only",
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/panel");
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Xplora Points", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recompensas", exact: true }).click();
  await expect(
    page.getByText("Entrada a LaBitConf", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tasks", exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('survey');
  await page.getByLabel("Nombre", { exact: true }).fill("Encuesta Startup Day");
  await page.getByLabel("Cupo de personas").fill("400");
  await page.getByLabel("Vence · hora local").fill("2027-01-01T18:00");
  await page
    .getByLabel("Asistencia requerida")
    .selectOption("10000000-0000-4000-8000-000000000001");
  await page.screenshot({
    path: ".impeccable/review/admin-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".impeccable/review/admin-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Crear tarea", exact: true }).click();
  await expect(page.getByRole("link", { name: "Descargar QR" })).toBeVisible();
  expect(submitted).toMatchObject({
    kind: "survey",
    points: 30,
    maxClaims: 400,
    eventId: "10000000-0000-4000-8000-000000000001",
  });
  await page.locator('summary').filter({ hasText: /^Crear tarea$/ }).click();
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('google_form');
  await page.getByLabel('Nombre', { exact: true }).fill('Encuesta Google · demo');
  await page.getByLabel('Enlace de edición de Google Forms').fill('https://docs.google.com/forms/d/fixture-form/edit');
  await page.getByLabel('Cupo de personas').fill('100');
  await page.getByLabel('Vence · hora local').fill('2027-01-01T18:00');
  await page.getByRole('button', { name: 'Conectar y activar', exact: true }).click();
  await expect(page.getByText('Tarea conectada y activa. Las nuevas respuestas válidas suman puntos.')).toBeVisible();
  expect(submitted).toMatchObject({ kind: 'google_form', formUrl: 'https://docs.google.com/forms/d/fixture-form/edit', points: 30 });
  await expect(page.getByLabel('URL pública del backend')).toHaveCount(0);
  await expect(page.getByRole('button', { name:'Descargar script privado' })).toHaveCount(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.impeccable/review/ops-tasks-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar script privado' })).toBeHidden();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.impeccable/review/ops-connected-${width}.png`, fullPage: true, animations: 'disabled' });
  }
});
