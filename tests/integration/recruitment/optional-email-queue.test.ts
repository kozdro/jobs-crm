/** Real DB/pgmq, fake transport and owner commands on an owned disposable target. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres, { type Sql } from "postgres";
import { processQueueOnce } from "../../../scripts/email-worker/queue.ts";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import { createAccounts, request, type Reply } from "../rls/data-api.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Queue QA requires an owned disposable target");
const target = await readRecruitmentTarget(id);
function ok<T>(response: Reply): T {
  assert.equal(
    response.status,
    200,
    `Unexpected Data API status ${response.status}`,
  );
  return response.body as T;
}

test(
  "pgmq dispatch serializes owner revoke and task completion across the transport boundary",
  { timeout: 120_000 },
  async () => {
    const [owner] = await createAccounts(target);
    assert.equal(target.db.host, "127.0.0.1");
    const admin = postgres({ ...target.db, max: 1 });
    const worker = postgres({ ...target.db, max: 1 });
    const worker2 = postgres({ ...target.db, max: 1 });
    let granted = false;
    let wasMember = false;
    try {
      const [membership] = await admin<
        { member: boolean; can_set: boolean }[]
      >`select pg_has_role(current_user, 'jobs_email_worker', 'MEMBER') as member, pg_has_role(current_user, 'jobs_email_worker', 'SET') as can_set`;
      assert.equal(
        membership?.can_set,
        false,
        "Worker fixture requires no existing SET privilege",
      );
      wasMember = Boolean(membership?.member);
      const [publicAccess] = await admin<
        { anon: boolean; authenticated: boolean }[]
      >`
        select has_function_privilege('anon', 'email_reminder.enqueue_due()', 'EXECUTE') as anon,
               has_function_privilege('authenticated', 'email_reminder.enqueue_due()', 'EXECUTE') as authenticated`;
      assert.deepEqual(
        { ...publicAccess },
        { anon: false, authenticated: false },
      );
      await admin`grant jobs_email_worker to postgres with set true`;
      granted = true;
      await worker`set role jobs_email_worker`;
      await worker2`set role jobs_email_worker`;
      const [privileges] = await worker<
        { own_table: boolean; enqueue: boolean }[]
      >`
        select has_table_privilege(current_user, 'email_reminder.intent', 'SELECT') as own_table,
               has_function_privilege(current_user, 'email_reminder.enqueue_due()', 'EXECUTE') as enqueue`;
      assert.deepEqual({ ...privileges }, { own_table: false, enqueue: true });
      const rpc = (name: string, body: unknown) =>
        request(
          target,
          owner.token,
          `/rest/v1/rpc/${name}`,
          "POST",
          body,
          {},
          "public",
        );
      const create = async (ageMs = 120_000) => {
        const task = ok<{ task: { id: string; revision: number } }>(
          await rpc("execute_recruitment_task_command", {
            p_request_id: randomUUID(),
            p_payload: {
              operation: "create",
              title: `Synthetic ${randomUUID()}`,
              description: null,
              dueOn: null,
              caseId: null,
            },
          }),
        ).task;
        const when = new Date(Date.now() - ageMs).toISOString();
        const configurationId = randomUUID();
        ok(
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
          }),
        );
        const consent = ok<{ consentVersion: string }>(
          await rpc("read_email_reminder", {
            p_task_id: task.id,
            p_configuration_id: configurationId,
          }),
        );
        ok(
          await rpc("execute_email_reminder", {
            p_request_id: randomUUID(),
            p_task_id: task.id,
            p_configuration_id: configurationId,
            p_enabled: true,
            p_consent_version: consent.consentVersion,
          }),
        );
        return { task, configurationId };
      };
      for (const action of ["revoke", "complete", "acknowledge"] as const) {
        const { task, configurationId } = await create();
        let unblock!: () => void;
        const barrier = new Promise<void>((resolve) => {
          unblock = resolve;
        });
        let reached!: () => void;
        const entered = new Promise<void>((resolve) => {
          reached = resolve;
        });
        let sends = 0;
        const sending = processQueueOnce(
          worker,
          {
            async send(message) {
              sends++;
              assert.equal(message.recipient, owner.email);
              assert.equal(message.subject, "Przypomnienie");
              assert.equal(
                message.text,
                "Masz przypomnienie w aplikacji. Zaloguj się, aby je zobaczyć: https://crm.example.test/",
              );
              reached();
              await barrier;
              return "accepted";
            },
          },
          new URL("https://crm.example.test/"),
        );
        await Promise.race([
          entered,
          sending.then(() => {
            throw new Error("Dispatch never reached fake transport");
          }),
        ]);
        if (action === "revoke") {
          const [message] = await admin<
            { queued_message_id: string }[]
          >`select queued_message_id from email_reminder.intent where configuration_id=${configurationId}`;
          assert.ok(message?.queued_message_id);
          await admin`select pgmq.set_vt('email_reminders', ${message.queued_message_id}::bigint, 0)`;
          let extraSends = 0;
          const contender = processQueueOnce(
            worker2,
            {
              async send() {
                extraSends++;
                return "accepted";
              },
            },
            new URL("https://crm.example.test/"),
          );
          const contenderResult = await Promise.race([
            contender.then((value) => (value ? "claimed" : "idle")),
            new Promise<string>((resolve) =>
              setTimeout(() => resolve("blocked"), 2000),
            ),
          ]);
          if (contenderResult === "blocked") unblock();
          await contender;
          assert.equal(
            contenderResult,
            "idle",
            "second worker must not deadlock or duplicate a locked delivery",
          );
          assert.equal(extraSends, 0);
        }
        const command =
          action === "revoke"
            ? rpc("execute_email_reminder", {
                p_request_id: randomUUID(),
                p_task_id: task.id,
                p_configuration_id: configurationId,
                p_enabled: false,
                p_consent_version: null,
              })
            : action === "complete"
              ? rpc("execute_recruitment_task_command", {
                  p_request_id: randomUUID(),
                  p_payload: {
                    operation: "set-status",
                    taskId: task.id,
                    expectedRevision: task.revision,
                    status: "Wykonane",
                  },
                })
              : rpc("execute_recruitment_reminder_command", {
                  p_request_id: randomUUID(),
                  p_payload: {
                    operation: "acknowledge",
                    taskId: task.id,
                    configurationId,
                  },
                });
        const before = await Promise.race([
          command.then(() => "finished"),
          new Promise<string>((resolve) =>
            setTimeout(() => resolve("waiting"), 250),
          ),
        ]);
        unblock();
        assert.equal(await sending, true);
        assert.equal(
          before,
          "waiting",
          `${action} must serialize with the provider handoff`,
        );
        ok(await command);
        assert.equal(sends, 1);
      }
      // A revoke committed before prepare must suppress the provider call.
      const revoked = await create();
      await worker`select email_reminder.enqueue_due()`;
      const [claimed] = await worker<
        { attempt: string }[]
      >`select email_reminder.claim() as attempt`;
      assert.ok(claimed?.attempt);
      ok(
        await rpc("execute_email_reminder", {
          p_request_id: randomUUID(),
          p_task_id: revoked.task.id,
          p_configuration_id: revoked.configurationId,
          p_enabled: false,
          p_consent_version: null,
        }),
      );
      const [prepared] = await worker<
        { recipient: string | null }[]
      >`select email_reminder.prepare(${claimed.attempt}::uuid) as recipient`;
      assert.equal(prepared?.recipient, null);

      // A task over six hours old is expired, without invoking the transport.
      const expired = await create(7 * 60 * 60 * 1_000);
      let expiredSends = 0;
      assert.equal(
        await processQueueOnce(
          worker,
          {
            async send() {
              expiredSends++;
              return "accepted";
            },
          },
          new URL("https://crm.example.test/"),
        ),
        false,
      );
      assert.equal(expiredSends, 0);
      const [expiredState] = await admin<
        { state: string }[]
      >`select state from email_reminder.intent where configuration_id=${expired.configurationId}`;
      assert.equal(expiredState?.state, "expired");

      // Simulate an accepted transport followed by lost DB transaction, then force
      // visibility on this test's queue message rather than sleeping for a minute.
      const uncertain = await create();
      await worker`select email_reminder.enqueue_due()`;
      const [claimedUnknown] = await worker<
        { attempt: string }[]
      >`select email_reminder.claim() as attempt`;
      assert.ok(claimedUnknown?.attempt);
      let accepted = 0;
      await assert.rejects(
        worker.begin(async (tx) => {
          // TransactionSql omits the tagged-template overload from its type.
          const query = tx as unknown as Sql;
          const [p] = await query<
            { recipient: string | null }[]
          >`select email_reminder.prepare(${claimedUnknown.attempt}::uuid) as recipient`;
          assert.equal(p?.recipient, owner.email);
          accepted++;
          throw new Error(
            "Synthetic connection loss after provider acceptance",
          );
        }),
        /Synthetic connection loss/,
      );
      const [queued] = await admin<
        { queued_message_id: string }[]
      >`select queued_message_id from email_reminder.intent where configuration_id=${uncertain.configurationId}`;
      assert.ok(queued?.queued_message_id);
      await admin`select pgmq.set_vt('email_reminders', ${queued.queued_message_id}::bigint, 0)`;
      const [redelivery] = await worker<
        { attempt: string | null }[]
      >`select email_reminder.claim() as attempt`;
      assert.equal(redelivery?.attempt, null);
      const [unknown] = await admin<
        { state: string }[]
      >`select state from email_reminder.intent where configuration_id=${uncertain.configurationId}`;
      assert.equal(unknown?.state, "unknown");
      assert.equal(accepted, 1);

      // Only an explicitly safe failure can retry. The 30-day age is measured
      // from terminal state; test-only clock fixtures do not set product policy.
      const retry = await create();
      let tries = 0;
      const transport = {
        async send() {
          tries++;
          return tries === 1
            ? ("safe_failure" as const)
            : ("accepted" as const);
        },
      };
      assert.equal(
        await processQueueOnce(
          worker,
          transport,
          new URL("https://crm.example.test/"),
        ),
        true,
      );
      assert.equal(
        await processQueueOnce(
          worker,
          transport,
          new URL("https://crm.example.test/"),
        ),
        false,
      );
      assert.equal(tries, 1);
      await admin`update email_reminder.intent set retry_after=clock_timestamp()-interval '1 second' where configuration_id=${retry.configurationId}`;
      assert.equal(
        await processQueueOnce(
          worker,
          transport,
          new URL("https://crm.example.test/"),
        ),
        true,
      );
      assert.equal(tries, 2);
      const attempts = await admin<
        { id: string; outcome: string }[]
      >`select a.id,a.outcome from email_reminder.attempt a join email_reminder.intent i on i.id=a.intent_id where i.configuration_id=${retry.configurationId} order by a.started_at`;
      assert.deepEqual(
        attempts.map((x) => x.outcome),
        ["safe_failure", "accepted"],
      );
      await admin`update email_reminder.intent set terminal_at=clock_timestamp()-interval '29 days' where configuration_id=${retry.configurationId}`;
      await worker`select email_reminder.purge_terminal()`;
      assert.equal(
        (
          await admin`select 1 from email_reminder.intent where configuration_id=${retry.configurationId}`
        ).length,
        1,
      );
      await admin`update email_reminder.intent set terminal_at=clock_timestamp()-interval '31 days' where configuration_id=${retry.configurationId}`;
      await worker`select email_reminder.purge_terminal()`;
      assert.equal(
        (
          await admin`select 1 from email_reminder.intent where configuration_id=${retry.configurationId}`
        ).length,
        0,
      );
      assert.equal(
        (
          await admin`select a.id from email_reminder.attempt a where a.id in ${admin(attempts.map((x) => x.id))}`
        ).length,
        0,
      );
    } finally {
      await worker.end();
      await worker2.end();
      if (granted) {
        if (wasMember)
          await admin`revoke set option for jobs_email_worker from postgres`;
        else await admin`revoke jobs_email_worker from postgres`;
      }
      await admin.end();
    }
  },
);
