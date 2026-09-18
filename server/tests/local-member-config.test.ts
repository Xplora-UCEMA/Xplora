import assert from "node:assert/strict";
import { test } from "node:test";
import { getAppConfig } from "../src/config/env.js";
import { createLocalMemberConfig } from "../src/config/local-member.js";

test("local member startup isolates sessions, enables the installed Points program and requires working services", () => {
  const source = {
    ...getAppConfig(),
    supabaseUrl: "https://example.invalid",
    supabaseServiceRoleKey: "test-only",
    resend: { apiKey: "test-only", from: "test@example.invalid", fromName: null },
  };
  assert.throws(() => createLocalMemberConfig(source, "short"), /secreto local/);
  const secret = "test-only-session-key-".repeat(3);
  const local = createLocalMemberConfig(source, secret);
  assert.equal(local.memberJwtSecret, secret);
  assert.equal(local.port, 8788);
  assert.equal(local.publicSiteUrl, "http://127.0.0.1:5174");
  assert.equal(local.nodeEnv, "development");
  assert.equal(local.pointsEnabled, true);
  assert.equal(local.supabaseUrl, source.supabaseUrl);
  assert.throws(() => createLocalMemberConfig({ ...source, resend: null }, secret), /Resend/);
  assert.throws(() => createLocalMemberConfig({ ...source, supabaseServiceRoleKey: null }, secret), /Supabase/);
});
