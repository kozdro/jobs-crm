/** Separate required worker-role proof; never elevates a local fixture role. */
import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Worker role QA requires an owned disposable target");
const target = await readRecruitmentTarget(id);

test("dedicated worker role can execute dispatch preflight without table access", async (t) => {
  const sql = postgres({ ...target.db, max: 1 });
  try {
    const [membership] = await sql<{ can_set: boolean }[]>`
      select pg_has_role(current_user, 'jobs_email_worker', 'SET') as can_set`;
    if (!membership?.can_set) {
      t.skip(
        "BLOCKED: existing fixture has no SET worker role; grants/escalation forbidden",
      );
      return;
    }
    await sql`set role jobs_email_worker`;
    const [role] = await sql<{ role: string; table_access: boolean }[]>`
      select current_user as role, has_table_privilege(current_user, 'email_reminder.intent', 'SELECT') as table_access`;
    assert.equal(role?.role, "jobs_email_worker");
    assert.equal(role?.table_access, false);
    const [prepared] = await sql<{ recipient: string | null }[]>`
      select email_reminder.prepare('00000000-0000-0000-0000-000000000001'::uuid) as recipient`;
    assert.equal(prepared?.recipient, null);
  } finally {
    await sql.end();
  }
});
