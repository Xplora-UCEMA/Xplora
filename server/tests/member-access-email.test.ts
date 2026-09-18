import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMemberAccessEmail } from "../src/services/member-access-email.js";

test("access-only emails do not promise Points before that system is activated", () => {
  const html = renderMemberAccessEmail("123456", "http://127.0.0.1:5174/cuenta/confirmar#test", "http://127.0.0.1:5174", { pointsEnabled: false });
  assert.doesNotMatch(html, /20 Xplora Points|sumar Xplora Points/);
  assert.match(html, /crear tu cuenta o iniciar sesión/);
  assert.match(html, /Entrar a Xplora/);
});

test("access email has branded link, code, expiry and escaped attributes", () => {
  const html = renderMemberAccessEmail(
    "123456",
    'https://example.test/cuenta#token=a&b="x"',
    "https://example.test",
  );
  assert.match(html, /123456/);
  assert.match(html, /10 minutos/);
  assert.match(html, /Entrar a Xplora/);
  assert.ok(html.includes("a&amp;b=&quot;x&quot;"));
  assert.match(html, /20/);
  assert.match(html, /role="presentation"/);
});
