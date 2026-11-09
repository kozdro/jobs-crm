/** Database unit tests for the pure consent-evidence matcher; no Auth mutations. */
import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id)
  throw new Error("Consent evidence tests require an owned disposable target");
const target = await readRecruitmentTarget(id);

test("consent evidence rejects changed, missing, backwards and reused tuple contexts", async () => {
  const sql = postgres({ ...target.db, max: 1 });
  const context = {
    email: "synthetic@example.invalid",
    confirmedAt: "2099-01-01T00:00:00+00:00",
    xmin: "100",
    ctid: "(0,1)",
    relation: "10000",
    filenode: "10000",
  };
  const matches = async (
    saved: Record<string, string | null> | null,
    captured: string | null,
    current: Record<string, string | null> | null,
    now: string,
  ) => {
    const [row] = await sql<{ valid: boolean }[]>`
      select email_reminder.consent_context_matches(
        ${sql.json(saved)}::jsonb, ${captured}::numeric,
        ${sql.json(current)}::jsonb, ${now}::numeric) as valid`;
    return row.valid;
  };
  try {
    assert.equal(await matches(context, "101", context, "102"), true);
    assert.equal(await matches(null, null, context, "102"), false);
    assert.equal(await matches(context, "101", null, "102"), false);
    for (const field of Object.keys(context)) {
      const changed = { ...context, [field]: null };
      assert.equal(await matches(context, "101", changed, "102"), false, field);
    }
    assert.equal(await matches(context, "101", context, "100"), false);
    // xmin 100 can recur at full XID 4294967396, not at an arbitrary
    // half-range after the capture. The exact reuse boundary must deny.
    assert.equal(await matches(context, "101", context, "4294967395"), true);
    assert.equal(await matches(context, "101", context, "4294967396"), false);
    assert.equal(await matches(context, "101", context, "4294967397"), false);
    // An ancient/frozen tuple low XID can be only one allocation from reuse.
    const ancient = { ...context, xmin: "102" };
    assert.equal(
      await matches(ancient, "4294967397", ancient, "4294967397"),
      true,
    );
    assert.equal(
      await matches(ancient, "4294967397", ancient, "4294967398"),
      false,
    );
    // A tuple created by the capture transaction has one full cycle until reuse.
    assert.equal(await matches(context, "100", context, "4294967395"), true);
    assert.equal(await matches(context, "100", context, "4294967396"), false);
    // ctid is required even when A→B→A updates share the same xmin.
    assert.equal(
      await matches(context, "100", { ...context, ctid: "(0,3)" }, "100"),
      false,
    );
    // Rewrites may reuse a ctid: relation incarnation remains part of evidence.
    assert.equal(
      await matches(context, "101", { ...context, filenode: "20000" }, "102"),
      false,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
});
