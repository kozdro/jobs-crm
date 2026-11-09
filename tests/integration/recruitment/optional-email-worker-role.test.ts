/** Separate required worker-role proof; never elevates a local fixture role. */
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { processQueueOnce } from "../../../scripts/email-worker/queue.ts";
import { createAccounts, request, type Reply } from "../rls/data-api.ts";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Worker role QA requires an owned disposable target");
const target = await readRecruitmentTarget(id);

test("dedicated worker role can execute dispatch preflight without table access", async (t) => {
  const sql = postgres({ ...target.db, max: 1 });
  const fixture = postgres({ ...target.db, max: 1 });
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
    const [owner] = await createAccounts(target);
    const rpc = async <T>(name: string, body: unknown): Promise<T> => {
      const reply: Reply = await request(
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
    const create = async () => {
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
      return configurationId;
    };
    const accepted = await create();
    let sends = 0;
    const transport = {
      async send(message: { recipient: string }) {
        sends++;
        assert.equal(message.recipient, owner.email);
        return "accepted" as const;
      },
    };
    assert.equal(
      await processQueueOnce(
        sql,
        transport,
        new URL("https://crm.example.test/"),
      ),
      true,
    );
    assert.equal(
      sends,
      1,
      "valid consent reaches provider under dedicated worker role",
    );
    const [state] = await fixture<{ state: string }[]>`
      select state from email_reminder.intent where configuration_id=${accepted}`;
    assert.equal(state?.state, "accepted");
    await create();
    // A real update to this synthetic owner's unrelated Auth data invalidates
    // its captured tuple context without relying on email-change triggers.
    await fixture`update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||'{"qaContextChanged":true}'::jsonb where id=${owner.id}`;
    await processQueueOnce(
      sql,
      transport,
      new URL("https://crm.example.test/"),
    );
    assert.equal(
      sends,
      1,
      "changed context blocks provider under dedicated worker role",
    );
  } finally {
    await sql.end();
    await fixture.end();
  }
});
