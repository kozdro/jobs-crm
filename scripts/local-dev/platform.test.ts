import { test } from "node:test";
import assert from "node:assert/strict";
import { redactDevLog } from "./logs.ts";
import { assertResetConfirmation } from "./validation.ts";
import type { DevManifest } from "./validation.ts";
test("development logs withhold auth callback query, tokens and passwords", () => {
  for (const line of [
    "GET /auth/callback?code=private 200",
    "refresh_token=private",
    "password=private",
    "cookie: private",
    "SUPABASE_SERVICE_ROLE_KEY=private",
  ])
    assert.equal(
      redactDevLog(line),
      "[sensitive development log line withheld]",
    );
  assert.equal(
    redactDevLog("compiled /signup in 30ms"),
    "compiled /signup in 30ms",
  );
  assert.equal(
    redactDevLog(
      "connection postgresql://postgres:private@127.0.0.1:56722/postgres",
    ),
    "connection [credential URL redacted]",
  );
});
test("reset requires explicit exact project ID", () => {
  const m = { projectId: "jobs-crm-dev-0123456789ab" } as DevManifest;
  for (const confirmation of [
    undefined,
    "yes",
    "manual-dev",
    "jobs-crm-dev-other",
  ])
    assert.throws(
      () => assertResetConfirmation(m, confirmation),
      /Reset refused/,
    );
  assert.doesNotThrow(() => assertResetConfirmation(m, m.projectId));
});
