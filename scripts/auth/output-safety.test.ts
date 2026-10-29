import assert from "node:assert/strict";
import test from "node:test";
import {
  captureAuthOutput,
  requireAuthObservations,
  assertPrivateValuesAbsent,
} from "./output-safety.ts";
const publicKey = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.publicsignature";
function capture(maxBytes?: number) {
  return captureAuthOutput({
    publicKey,
    privateValues: ["private-service-role-key", "private-server-canary"],
    maxBytes,
  });
}
test("ordinary build/server logs and exact publishable anon key produce only bounded summaries", () => {
  const output = capture();
  output.push(`Ready in 100ms\n${publicKey}\n`);
  const summary = output.verify();
  assert.equal(
    Object.keys(summary).sort().join(","),
    "bytes,counts,observations,sha256",
  );
  assert.match(summary.sha256, /^[a-f0-9]{64}$/);
  assert.ok(summary.bytes > 0);
});
test("session JWT fragmented across process chunks fails without reflecting its value", () => {
  const output = capture();
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.privatesignature";
  output.push(jwt.slice(0, 20));
  output.push(jwt.slice(20));
  assert.throws(
    () => output.verify(),
    (error) =>
      error instanceof Error &&
      /withheld/.test(error.message) &&
      !error.message.includes(jwt),
  );
});
test("private server credentials, serialized refresh token and synthetic passwords fail closed", () => {
  for (const value of [
    "private-service-role-key",
    "private-server-canary",
    '"refresh_token":"abcde1234567890"',
    "access_token=abcde1234567890",
    "Synthetic-F3-random-password!",
    "Updated-synthetic-123456!",
    "Wrong-12345678-1234-1234-1234-123456789012!",
    "Recovered-12345678-1234-1234-1234-123456789012!",
  ]) {
    const output = capture();
    output.push(value);
    assert.throws(() => output.verify(), /withheld/);
  }
});
test("oversized logs cannot silently truncate away a secret after the bounded capture limit", () => {
  const output = capture(8);
  output.push("01234567");
  output.push("private-service-role-key");
  assert.throws(() => output.verify(), /budget/);
});
test("browser artifact private-value scan rejects secret bytes and allows public SDK code", () => {
  assert.doesNotThrow(() =>
    assertPrivateValuesAbsent(`const key=${publicKey};`, [
      "private-server-canary",
    ]),
  );
  assert.throws(
    () =>
      assertPrivateValuesAbsent("private-server-canary", [
        "private-server-canary",
      ]),
    /withheld/,
  );
});

test("TAP and Playwright counts plus whitelisted observation values are retained safely", () => {
  const output = capture();
  output.push(
    'ℹ tests 12\nℹ pass 12\nℹ fail 0\n  7 passed (1m)\nF3_SIGNUP_OBSERVATION {"confirmationsFixture":true,"newEmail":{"userReturned":true,"sessionReturned":false,"identityCount":1,"errorCode":null},"existingEmail":{"userReturned":true,"sessionReturned":false,"identityCount":0,"errorCode":null},"productionAntiEnumerationPolicy":"OPEN-041/013"}',
  );
  const summary = output.verify();
  assert.equal(summary.counts.tests, 12);
  assert.equal(summary.counts.passed, 7);
  assert.equal(summary.counts.failed, 0);
  assert.equal(summary.observations[0].kind, "F3_SIGNUP_OBSERVATION");
});
test("structured observations cannot smuggle unknown credential or arbitrary text fields", () => {
  for (const content of [
    'F3_SIGNUP_OBSERVATION {"email":"someone@example.test"}',
    'F3_UNKNOWN_OBSERVATION {"value":123}',
  ]) {
    const output = capture();
    output.push(content);
    assert.throws(() => output.verify(), /withheld/);
  }
});

test("zero or partial reporter evidence cannot give successful Auth measurement acceptance", () => {
  const summary = {
    bytes: 0,
    sha256: "0".repeat(64),
    counts: { passed: 0 },
    observations: [] as { kind: string; values: unknown }[],
  };
  assert.throws(() => requireAuthObservations(summary, "sdk"), /counts/);
  summary.counts.passed = 13;
  assert.throws(() => requireAuthObservations(summary, "sdk"), /observations/);
  summary.observations = [
    "F3_JWT_REPLAY",
    "F3_SIGNUP_OBSERVATION",
    "F3_RECOVERY_SESSION_OBSERVATION",
    "F3_PASSWORD_POLICY_OBSERVATION",
  ].map((kind) => ({ kind, values: { scope: "local" } }));
  assert.throws(() => requireAuthObservations(summary, "sdk"), /three-scope/);
  summary.observations.push(
    { kind: "F3_JWT_REPLAY", values: { scope: "global" } },
    { kind: "F3_JWT_REPLAY", values: { scope: "others" } },
  );
  assert.doesNotThrow(() => requireAuthObservations(summary, "sdk"));
  assert.throws(
    () => requireAuthObservations(summary, "browser"),
    /observations/,
  );
  summary.observations = [
    "F3_SIGNUP_UI_OBSERVATION",
    "F3_REFRESH_FAULT_OBSERVATION",
    "F3_BFCACHE_OBSERVATION",
  ].map((kind) => ({ kind, values: {} }));
  assert.doesNotThrow(() => requireAuthObservations(summary, "browser"));
});
