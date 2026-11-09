/** Consent evidence SQL tests on an owned fixture; no Auth object mutations. */
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import { createAccounts, request } from "../rls/data-api.ts";

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

test("actual consent read and enable capture a fresh committed-XID boundary after caller XID assignment", async () => {
  const [owner] = await createAccounts(target);
  const sql = postgres({ ...target.db, max: 1 });
  const other = postgres({ ...target.db, max: 1 });
  const rpc = async (name: string, body: unknown) => {
    const reply = await request(
      target,
      owner.token,
      `/rest/v1/rpc/${name}`,
      "POST",
      body,
      {},
      "public",
    );
    assert.equal(reply.status, 200);
    return reply.body;
  };
  try {
    const task = (
      (await rpc("execute_recruitment_task_command", {
        p_request_id: randomUUID(),
        p_payload: {
          operation: "create",
          title: `Synthetic ${randomUUID()}`,
          description: null,
          dueOn: null,
          caseId: null,
        },
      })) as { task: { id: string; revision: number } }
    ).task;
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
    const allocate = async () => {
      const [row] = await other<
        { xid: string }[]
      >`select pg_catalog.pg_current_xact_id()::text as xid`;
      return BigInt(row.xid);
    };
    await sql.begin(async (transaction) => {
      const tx = transaction as unknown as Sql;
      await tx`select set_config('request.jwt.claim.sub', ${owner.id}, true)`;
      const [initial] = await tx<
        { xid: string }[]
      >`select pg_catalog.pg_current_xact_id()::text as xid`;
      const later = await allocate();
      assert.ok(later > BigInt(initial.xid));
      const [read] = await tx<{ result: { consentVersion: string } }[]>`
        select public.read_email_reminder(${task.id}::uuid, ${configurationId}::uuid) as result`;
      const [preview] = await tx<{ xid: string }[]>`
        select consent_xid::text as xid from email_reminder.auth_version where owner_id=${owner.id}::uuid`;
      assert.ok(
        BigInt(preview.xid) >= later,
        "actual read must see later committed XIDs",
      );
      const afterRead = await allocate();
      await tx`select public.execute_email_reminder(${randomUUID()}::uuid, ${task.id}::uuid, ${configurationId}::uuid, true, ${read.result.consentVersion}::uuid)`;
      const [intent] = await tx<{ xid: string }[]>`
        select consent_xid::text as xid from email_reminder.intent where owner_id=${owner.id}::uuid and configuration_id=${configurationId}::uuid`;
      assert.ok(
        BigInt(intent.xid) >= afterRead,
        "actual enable must refresh boundary after read",
      );
      const [unchanged] = await tx<
        { xid: string }[]
      >`select pg_catalog.pg_current_xact_id()::text as xid`;
      assert.equal(
        unchanged.xid,
        initial.xid,
        "caller XID remains stale while evidence boundary advances",
      );
    });
    await sql`select email_reminder.enqueue_due()`;
    const [claim] = await sql<
      { attempt: string }[]
    >`select email_reminder.claim() as attempt`;
    assert.ok(claim.attempt);
    await sql.begin(async (transaction) => {
      const tx = transaction as unknown as Sql;
      const [initial] = await tx<
        { xid: string }[]
      >`select pg_catalog.pg_current_xact_id()::text as xid`;
      assert.ok((await allocate()) > BigInt(initial.xid));
      // Real prepare compatibility smoke. Its fresh boundary is not persisted,
      // so the assertions above establish observable freshness for read/enable.
      const [prepared] = await tx<
        { recipient: string }[]
      >`select email_reminder.prepare(${claim.attempt}::uuid) as recipient`;
      assert.equal(prepared.recipient, owner.email);
      await tx`select email_reminder.finish(${claim.attempt}::uuid, 'accepted')`;
    });
  } finally {
    await sql.end({ timeout: 5 });
    await other.end({ timeout: 5 });
  }
});
