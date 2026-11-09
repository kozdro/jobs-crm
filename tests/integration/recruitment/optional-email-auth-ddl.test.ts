/** Actual protected Auth trigger DDL, only when the owned disposable login already owns it. */
import assert from "node:assert/strict";
import test from "node:test";
import postgres, { type Sql } from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Auth DDL QA requires an owned disposable target");
const target = await readRecruitmentTarget(id);

test("actual Auth trigger DDL makes catalog validation fail closed", async (t) => {
  const sql = postgres({ ...target.db, max: 1 });
  try {
    const [ownership] = await sql<
      { role: string; owner: string; can_ddl: boolean }[]
    >`select current_user as role,pg_get_userbyid(c.relowner) as owner,
      (r.rolsuper or pg_has_role(current_user,c.relowner,'USAGE')) as can_ddl
      from pg_class c cross join pg_roles r where c.oid='auth.users'::regclass and r.rolname=current_user`;
    assert.ok(ownership?.role);
    console.log(
      `Auth DDL preflight: role=${ownership.role}; owner=${ownership.owner}; existingOwnership=${ownership.can_ddl}`,
    );
    if (!ownership.can_ddl) {
      t.skip(
        "BLOCKED: no existing ownership for protected Auth trigger DDL; historical 42501 preserved; no grant or escalation attempted",
      );
      return;
    }
    const [original] = await sql<{ definition: string }[]>`
      select pg_get_triggerdef(oid) as definition from pg_trigger
      where tgrelid='auth.users'::regclass and tgname='email_reminder_auth_changed'`;
    assert.ok(original?.definition);
    for (const scenario of ["disabled", "missing", "changed"] as const) {
      await assert.rejects(
        sql.begin(async (tx) => {
          const query = tx as unknown as Sql;
          if (scenario === "disabled")
            await query.unsafe(
              "alter table auth.users disable trigger email_reminder_auth_changed",
            );
          else if (scenario === "missing")
            await query.unsafe(
              "drop trigger email_reminder_auth_changed on auth.users",
            );
          else {
            await query.unsafe(
              "drop trigger email_reminder_auth_changed on auth.users",
            );
            await query.unsafe(
              original.definition.replace(
                "UPDATE OF email, email_confirmed_at",
                "UPDATE OF email",
              ),
            );
          }
          const [guard] = await query<{ valid: boolean }[]>`
            select email_reminder.auth_guard_valid() as valid`;
          assert.equal(guard?.valid, false, scenario);
          throw new Error("ROLLBACK owned Auth DDL probe");
        }),
        /ROLLBACK owned Auth DDL probe/,
      );
    }
    const [restored] = await sql<{ valid: boolean }[]>`
      select email_reminder.auth_guard_valid() as valid`;
    assert.equal(restored?.valid, true);
  } finally {
    await sql.end();
  }
});
