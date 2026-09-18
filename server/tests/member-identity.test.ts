import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { linkExistingUsuario } from "../src/services/member-accounts.service.js";

test("member access only links an existing contact and never creates or rewrites CRM data", async () => {
  const calls: { method: string; path: string }[] = [];
  let hasContact = true;
  const sb = createClient("https://example.invalid", "test-server-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      calls.push({ method: request.method, path });
      if (path.endsWith("/usuarios")) {
        assert.equal(request.method, "GET");
        return Response.json(hasContact ? [{ id: "contact-id", email: "member@example.test" }] : []);
      }
      assert.equal(path, "/rest/v1/member_accounts");
      assert.equal(request.method, "PATCH");
      return Response.json({ id: "member-id" });
    } },
  });
  const account = { id: "member-id", email: "member@example.test", usuario_id: null };
  assert.equal(await linkExistingUsuario(sb, account), "contact-id");
  hasContact = false;
  assert.equal(await linkExistingUsuario(sb, account), null);
  assert.equal(calls.filter(call => call.method !== "GET").length, 1);
});
