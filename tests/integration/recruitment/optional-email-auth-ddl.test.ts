/** Actual Auth DDL on an owned disposable target, using existing capabilities only. */
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import { createAccounts, request } from "../rls/data-api.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Auth DDL QA requires an owned disposable target");
const target = await readRecruitmentTarget(id);

async function capabilities(sql: Sql) {
  const [role] = await sql<
    {
      role: string;
      owner: string;
      owns: boolean;
      trigger: boolean;
      execute: boolean;
    }[]
  >`select current_user as role,pg_get_userbyid(c.relowner) as owner,
    (r.rolsuper or pg_has_role(current_user,c.relowner,'USAGE')) as owns,
    has_table_privilege(current_user,c.oid,'TRIGGER') as trigger,
    has_function_privilege(current_user,'email_reminder.auth_changed()','EXECUTE') as execute
    from pg_class c cross join pg_roles r where c.oid='auth.users'::regclass and r.rolname=current_user`;
  assert.ok(role);
  console.log(
    `Auth DDL preflight: role=${role.role}; owner=${role.owner}; ownership=${role.owns}; trigger=${role.trigger}; execute=${role.execute}`,
  );
  return role;
}

for (const scenario of ["disabled", "missing"] as const) {
  test(`actual Auth trigger ${scenario} DDL requires existing ownership`, async (t) => {
    const sql = postgres({ ...target.db, max: 1 });
    try {
      if (!(await capabilities(sql)).owns) {
        t.skip(
          "BLOCKED: no existing ownership for DISABLE/DROP; historical 42501 preserved; no grant or escalation attempted",
        );
        return;
      }
      await assert.rejects(
        sql.begin(async (tx) => {
          const query = tx as unknown as Sql;
          await query.unsafe(
            scenario === "disabled"
              ? "alter table auth.users disable trigger email_reminder_auth_changed"
              : "drop trigger email_reminder_auth_changed on auth.users",
          );
          const [guard] = await query<
            { valid: boolean }[]
          >`select email_reminder.auth_guard_valid() as valid`;
          assert.equal(guard?.valid, false, scenario);
          throw new Error("ROLLBACK owned Auth DDL probe");
        }),
        /ROLLBACK owned Auth DDL probe/,
      );
      const [restored] = await sql<
        { valid: boolean }[]
      >`select email_reminder.auth_guard_valid() as valid`;
      assert.equal(restored?.valid, true);
    } finally {
      await sql.end();
    }
  });
}

test("actual Auth trigger replacement denies a valid prepare using existing TRIGGER privilege", async (t) => {
  const sql = postgres({ ...target.db, max: 1 });
  try {
    const role = await capabilities(sql);
    if (!role.trigger || !role.execute) {
      t.skip(
        "BLOCKED: existing TRIGGER/EXECUTE capabilities absent; no escalation attempted",
      );
      return;
    }
    const [owner] = await createAccounts(target);
    const rpc = async <T>(name: string, body: unknown): Promise<T> => {
      const reply = await request(
        target,
        owner.token,
        `/rest/v1/rpc/${name}`,
        "POST",
        body,
        {},
        "public",
      );
      assert.equal(
        reply.status,
        200,
        `Unexpected Data API status ${reply.status}`,
      );
      return reply.body as T;
    };
    const { task } = await rpc<{ task: { id: string; revision: number } }>(
      "execute_recruitment_task_command",
      {
        p_request_id: randomUUID(),
        p_payload: {
          operation: "create",
          title: `Synthetic ${randomUUID()}`,
          description: null,
          dueOn: null,
          caseId: null,
        },
      },
    );
    const configurationId = randomUUID();
    const when = new Date(Date.now() - 120_000).toISOString();
    await rpc("execute_recruitment_reminder_command", {
      p_request_id: configurationId,
      p_payload: {
        operation: "set-reminder",
        taskId: task.id,
        expectedRevision: task.revision,
        date: when.slice(0, 10),
        time: when.slice(11, 16),
        timeZone: "UTC",
        offset: 0,
      },
    });
    const args = { p_task_id: task.id, p_configuration_id: configurationId };
    const { consentVersion } = await rpc<{ consentVersion: string }>(
      "read_email_reminder",
      args,
    );
    await rpc("execute_email_reminder", {
      ...args,
      p_request_id: randomUUID(),
      p_enabled: true,
      p_consent_version: consentVersion,
    });
    await sql`select email_reminder.enqueue_due()`;
    const [claimed] = await sql<
      { attempt: string }[]
    >`select email_reminder.claim() as attempt`;
    assert.ok(claimed?.attempt);
    const [intent] = await sql<{ configuration_id: string }[]>`
      select configuration_id from email_reminder.intent where attempt_id=${claimed.attempt}`;
    assert.equal(intent?.configuration_id, configurationId);
    const [before] = await sql<{ definition: string }[]>`
      select pg_get_triggerdef(oid) as definition from pg_trigger where tgrelid='auth.users'::regclass and tgname='email_reminder_auth_changed'`;
    assert.ok(before?.definition);
    // Establish that this exact claimed attempt is eligible before the DDL
    // fault; rollback retains the same attempt for the negative preflight.
    await assert.rejects(
      sql.begin(async (tx) => {
        const query = tx as unknown as Sql;
        const [eligible] = await query<{ recipient: string | null }[]>`
          select email_reminder.prepare(${claimed.attempt}::uuid) as recipient`;
        assert.equal(eligible?.recipient, owner.email);
        throw new Error("ROLLBACK healthy preflight baseline");
      }),
      /ROLLBACK healthy preflight baseline/,
    );
    let sends = 0;
    const transport = {
      async send() {
        sends++;
      },
    };
    await assert.rejects(
      sql.begin(async (tx) => {
        const query = tx as unknown as Sql;
        // No ownership transfer, new privilege, or connection as an Auth owner.
        await query.unsafe(
          "create or replace trigger email_reminder_auth_changed after update of email on auth.users for each row execute function email_reminder.auth_changed()",
        );
        const [guard] = await query<
          { valid: boolean }[]
        >`select email_reminder.auth_guard_valid() as valid`;
        assert.equal(guard?.valid, false);
        const [prepared] = await query<{ recipient: string | null }[]>`
        select email_reminder.prepare(${claimed.attempt}::uuid) as recipient`;
        if (prepared?.recipient) await transport.send();
        assert.equal(
          prepared?.recipient,
          null,
          "changed trigger must deny actual dispatch preflight",
        );
        assert.equal(sends, 0);
        throw new Error("ROLLBACK owned Auth replacement probe");
      }),
      /ROLLBACK owned Auth replacement probe/,
    );
    const [after] = await sql<{ definition: string; valid: boolean }[]>`
      select pg_get_triggerdef(oid) as definition,email_reminder.auth_guard_valid() as valid from pg_trigger
      where tgrelid='auth.users'::regclass and tgname='email_reminder_auth_changed'`;
    assert.equal(after?.definition, before.definition);
    assert.equal(
      after?.valid,
      true,
      "rollback restores original healthy trigger",
    );
    // The rolled-back dispatch transaction leaves its committed claim unresolved.
    // Resolve conservatively through the normal unknown path; never retry it.
    await sql`select email_reminder.finish(${claimed.attempt}::uuid, 'unknown')`;
  } finally {
    await sql.end();
  }
});
