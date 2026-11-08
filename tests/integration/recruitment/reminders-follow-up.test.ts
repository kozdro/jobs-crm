/** DEC-063: owner-isolated reminders and follow-up, exercised through real JWTs. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import {
  createAccounts,
  denied,
  request,
  type Reply,
} from "../rls/data-api.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("DEC-063 requires a guarded disposable target");
const target = await readRecruitmentTarget(id);
type Row = Record<string, unknown>;
type Task = {
  id: string;
  revision: number;
  title: string;
  description: string | null;
  due_on: string | null;
  case_id: string | null;
};
type Reminder = { id: string; taskId: string; state: string };
type Suggestion = { caseId: string; eventId: string; eventRevision: number };
type Snapshot = {
  reminders: Reminder[];
  rule: null | { intervalDays: number; timeZone: string };
  suggestions: Suggestion[];
};
function ok<T>(reply: Reply): T {
  assert.equal(reply.status, 200, `Unexpected Data API status ${reply.status}`);
  return reply.body as T;
}

test(
  "DEC063 private reminder and follow-up contract",
  { timeout: 180_000 },
  async (t) => {
    const [a, b] = await createAccounts(target);
    const api = (
      path: string,
      method = "GET",
      body?: unknown,
      token: string | null = a.token,
    ) => request(target, token ?? undefined, path, method, body, {}, "public");
    const call = (
      name: string,
      body: unknown,
      token: string | null = a.token,
    ) => api(`/rest/v1/rpc/${name}`, "POST", body, token);
    const read = async (token = a.token) =>
      ok<Snapshot>(await call("read_recruitment_reminders", {}, token));
    const command = (
      payload: Row,
      requestId = randomUUID(),
      token: string | null = a.token,
    ) =>
      call(
        "execute_recruitment_reminder_command",
        { p_request_id: requestId, p_payload: payload },
        token,
      );
    const taskCommand = (payload: Row) =>
      call("execute_recruitment_task_command", {
        p_request_id: randomUUID(),
        p_payload: payload,
      });
    const createTask = async (caseId: string | null = null) =>
      ok<{ task: Task }>(
        await taskCommand({
          operation: "create",
          title: `Reminder QA ${randomUUID()}`,
          description: null,
          dueOn: "2099-01-01",
          caseId,
        }),
      ).task;
    const createCase = async (token = a.token) =>
      ok<{ case: { id: string } }>(
        await call(
          "create_recruitment_case",
          {
            p_request_id: randomUUID(),
            p_title: `Follow-up QA ${randomUUID()}`,
          },
          token,
        ),
      ).case.id;
    const set = (task: Task) => ({
      operation: "set-reminder",
      taskId: task.id,
      expectedRevision: task.revision,
      date: "2001-01-01",
      time: "12:00",
      timeZone: "Europe/Warsaw",
      offset: 60,
    });

    await t.test(
      "no defaults; reminder is independent of due date and duplicate replay is idempotent",
      async () => {
        const initial = await read();
        assert.equal(initial.rule, null);
        assert.deepEqual(initial.reminders, []);
        assert.deepEqual(initial.suggestions, []);
        const task = await createTask();
        assert.deepEqual((await read()).reminders, []);
        const payload = set(task);
        const requestId = randomUUID();
        const first = await command(payload, requestId);
        ok(first);
        assert.equal(
          ok<{ kind: string }>(await command(payload, requestId)).kind,
          "replayed",
        );
        denied(await command({ ...payload, time: "12:01" }, requestId));
        const rows = (await read()).reminders.filter(
          (r) => r.taskId === task.id,
        );
        assert.equal(rows.length, 1);
        assert.deepEqual(
          (await read()).reminders.filter((r) => r.taskId === task.id),
          rows,
        );
      },
    );

    await t.test(
      "complete and restore cannot reactivate a prior reminder",
      async () => {
        const task = await createTask();
        ok(await command(set(task)));
        const active = (await read()).reminders.filter(
          (r) => r.taskId === task.id,
        );
        assert.equal(active.length, 1);
        const completed = ok<{ task: Task }>(
          await taskCommand({
            operation: "set-status",
            taskId: task.id,
            expectedRevision: task.revision,
            status: "Wykonane",
          }),
        ).task;
        assert.equal(
          (await read()).reminders.filter((r) => r.taskId === task.id).length,
          0,
        );
        ok(
          await taskCommand({
            operation: "set-status",
            taskId: task.id,
            expectedRevision: completed.revision,
            status: "Do zrobienia",
          }),
        );
        assert.equal(
          (await read()).reminders.filter((r) => r.taskId === task.id).length,
          0,
        );
      },
    );

    await t.test(
      "changing deadline or case invalidates the configuration, even if reverted",
      async () => {
        const caseId = await createCase();
        let task = await createTask();
        ok(await command(set(task)));
        const edit = async (changes: Row) => {
          task = ok<{ task: Task }>(
            await taskCommand({
              operation: "edit",
              taskId: task.id,
              expectedRevision: task.revision,
              title: task.title,
              description: task.description,
              dueOn: task.due_on,
              caseId: task.case_id,
              ...changes,
            }),
          ).task;
        };
        await edit({ dueOn: "2099-01-02" });
        assert.equal(
          (await read()).reminders.some((r) => r.taskId === task.id),
          false,
        );
        await edit({ dueOn: "2099-01-01" });
        assert.equal(
          (await read()).reminders.some((r) => r.taskId === task.id),
          false,
        );
        ok(await command(set(task)));
        await edit({ caseId });
        assert.equal(
          (await read()).reminders.some((r) => r.taskId === task.id),
          false,
        );
        await edit({ caseId: null });
        assert.equal(
          (await read()).reminders.some((r) => r.taskId === task.id),
          false,
        );
      },
    );

    await t.test(
      "rule requires explicit setting; inbound and unknown contact dates cannot suggest",
      async () => {
        const caseId = await createCase();
        const record = (direction: string, day: string | null) =>
          call("record_manual_recruitment_contact", {
            p_request_id: randomUUID(),
            p_case_id: caseId,
            p_direction: direction,
            p_occurred_on: day,
          });
        ok(await record("inbound", "2000-01-01"));
        ok(await record("outbound", null));
        ok(
          await command({
            operation: "set-rule",
            intervalDays: 3,
            timeZone: "Europe/Warsaw",
          }),
        );
        const unverified = await createCase();
        ok(
          await call("record_recruitment_case_event", {
            p_request_id: randomUUID(),
            p_case_id: unverified,
            p_kind: "contact",
            p_direction: "outbound",
            p_occurred_on: "2000-01-01",
          }),
        );
        assert.equal(
          (await read()).suggestions.some((s) => s.caseId === unverified),
          false,
        );
        assert.equal(
          (await read()).suggestions.some((s) => s.caseId === caseId),
          false,
        );
        const event = ok<{ event: { id: string } }>(
          await record("outbound", "2000-01-01"),
        ).event;
        const beforeFacts = ok<Row[]>(
          await api(
            `/rest/v1/recruitment_case_event?select=*&case_id=eq.${caseId}`,
          ),
        );
        const beforeTasks = ok<Row[]>(
          await api(`/rest/v1/recruitment_task?select=*&case_id=eq.${caseId}`),
        );
        const beforeCase = ok<Row[]>(
          await api(
            `/rest/v1/recruitment_case?select=status,case_revision&id=eq.${caseId}`,
          ),
        );
        const suggestions = (await read()).suggestions.filter(
          (s) => s.caseId === caseId,
        );
        assert.equal(suggestions.length, 1);
        assert.equal(suggestions[0].eventId, event.id);
        assert.deepEqual(
          ok<Row[]>(
            await api(
              `/rest/v1/recruitment_case_event?select=*&case_id=eq.${caseId}`,
            ),
          ),
          beforeFacts,
        );
        assert.deepEqual(
          ok<Row[]>(
            await api(
              `/rest/v1/recruitment_task?select=*&case_id=eq.${caseId}`,
            ),
          ),
          beforeTasks,
        );
        assert.deepEqual(
          ok<Row[]>(
            await api(
              `/rest/v1/recruitment_case?select=status,case_revision&id=eq.${caseId}`,
            ),
          ),
          beforeCase,
        );
        const dismissal = {
          operation: "dismiss-suggestion",
          caseId,
          eventId: event.id,
          eventRevision: suggestions[0].eventRevision,
        };
        const requestId = randomUUID();
        const first = await command(dismissal, requestId);
        ok(first);
        assert.equal(
          ok<{ kind: string }>(await command(dismissal, requestId)).kind,
          "replayed",
        );
        assert.equal(
          (await read()).suggestions.some((s) => s.caseId === caseId),
          false,
        );
        const next = ok<{ event: { id: string } }>(
          await record("outbound", "2001-01-01"),
        ).event;
        assert.equal(
          (await read()).suggestions.find((s) => s.caseId === caseId)?.eventId,
          next.id,
        );
      },
    );

    await t.test(
      "A/B/anon: foreign IDs cannot mutate state or reveal relations",
      async () => {
        const task = await createTask();
        ok(await command(set(task)));
        const before = await read();
        assert.equal(
          (await read(b.token)).reminders.some((r) => r.taskId === task.id),
          false,
        );
        denied(await command(set(task), randomUUID(), b.token));
        denied(await command(set(task), randomUUID(), null));
        const commands = "/rest/v1/recruitment_reminder_command";
        denied(
          await api(commands, "POST", {
            request_id: randomUUID(),
            payload: set(task),
            order_no: 999999999,
          }),
        );
        const foreign = ok<Row[]>(
          await api(
            `${commands}?select=id,owner_id,payload`,
            "GET",
            undefined,
            b.token,
          ),
        );
        assert.equal(
          foreign.some((row) => row.owner_id === a.id),
          false,
        );
        denied(
          await api(
            commands,
            "POST",
            { owner_id: a.id, request_id: randomUUID(), payload: set(task) },
            b.token,
          ),
        );
        denied(
          await api(
            `${commands}?owner_id=eq.${a.id}`,
            "PATCH",
            { payload: {} },
            b.token,
          ),
        );
        denied(
          await api(
            commands,
            "POST",
            { request_id: randomUUID(), payload: set(task) },
            null,
          ),
        );
        assert.deepEqual(await read(), before);
      },
    );
    await t.test(
      "correction, void, close and reopen update visibility without resurrecting a dismissed basis",
      async () => {
        const caseId = await createCase();
        const contact = async (day: string) =>
          ok<{ event: { id: string } }>(
            await call("record_manual_recruitment_contact", {
              p_request_id: randomUUID(),
              p_case_id: caseId,
              p_direction: "outbound",
              p_occurred_on: day,
            }),
          ).event;
        const first = await contact("2001-01-01");
        let suggestion = (await read()).suggestions.find(
          (s) => s.caseId === caseId,
        );
        assert.equal(suggestion?.eventId, first.id);
        const correction = {
          p_case_id: caseId,
          p_event_id: first.id,
          p_operation: "correct",
          p_occurred_on: "2001-01-01",
          p_direction: "inbound",
          p_stage_name: null,
        };
        const preview = ok<{
          caseRevision: number;
          eventRevision: number;
          blockedBy: string[];
        }>(await call("preview_recruitment_case_correction", correction));
        assert.deepEqual(preview.blockedBy, []);
        ok(
          await call("correct_recruitment_case_event", {
            ...correction,
            p_request_id: randomUUID(),
            p_expected_case_revision: preview.caseRevision,
            p_expected_event_revision: preview.eventRevision,
          }),
        );
        assert.equal(
          (await read()).suggestions.some((s) => s.caseId === caseId),
          false,
        );
        const second = await contact("2002-01-01");
        suggestion = (await read()).suggestions.find(
          (s) => s.caseId === caseId,
        );
        assert.equal(suggestion?.eventId, second.id);
        const closeInput = {
          p_case_id: caseId,
          p_operation: "close",
          p_closure_id: null,
          p_outcome: "Inny",
          p_occurred_on: null,
          p_offer_confirmed: false,
        };
        const close = ok<{
          caseRevision: number;
          closureRevision: number | null;
          taskSnapshot: string[];
        }>(await call("preview_recruitment_case_lifecycle", closeInput));
        ok<{ entry: { id: string } }>(
          await call("confirm_recruitment_case_lifecycle_tasks", {
            ...closeInput,
            p_request_id: randomUUID(),
            p_expected_case_revision: close.caseRevision,
            p_expected_closure_revision: close.closureRevision,
            p_expected_task_snapshot: close.taskSnapshot,
            p_task_resolutions: [],
          }),
        );
        assert.equal(
          (await read()).suggestions.some((s) => s.caseId === caseId),
          false,
        );
        const reopenInput = {
          ...closeInput,
          p_operation: "reopen",
          p_outcome: null,
        };
        const reopen = ok<{
          caseRevision: number;
          closureRevision: number | null;
          taskSnapshot: string[];
        }>(await call("preview_recruitment_case_lifecycle", reopenInput));
        ok(
          await call("confirm_recruitment_case_lifecycle_tasks", {
            ...reopenInput,
            p_request_id: randomUUID(),
            p_expected_case_revision: reopen.caseRevision,
            p_expected_closure_revision: reopen.closureRevision,
            p_expected_task_snapshot: reopen.taskSnapshot,
            p_task_resolutions: [],
          }),
        );
        suggestion = (await read()).suggestions.find(
          (s) => s.caseId === caseId,
        );
        assert.equal(suggestion?.eventId, second.id);
        ok(
          await command({
            operation: "dismiss-suggestion",
            caseId,
            eventId: second.id,
            eventRevision: suggestion!.eventRevision,
          }),
        );
        const afterDismiss = ok<{
          caseRevision: number;
          closureRevision: number | null;
          taskSnapshot: string[];
        }>(await call("preview_recruitment_case_lifecycle", closeInput));
        ok<{ entry: { id: string } }>(
          await call("confirm_recruitment_case_lifecycle_tasks", {
            ...closeInput,
            p_request_id: randomUUID(),
            p_expected_case_revision: afterDismiss.caseRevision,
            p_expected_closure_revision: afterDismiss.closureRevision,
            p_expected_task_snapshot: afterDismiss.taskSnapshot,
            p_task_resolutions: [],
          }),
        );
        const reopenAgainInput = reopenInput;
        const reopenAgain = ok<{
          caseRevision: number;
          closureRevision: number | null;
          taskSnapshot: string[];
        }>(await call("preview_recruitment_case_lifecycle", reopenAgainInput));
        ok(
          await call("confirm_recruitment_case_lifecycle_tasks", {
            ...reopenAgainInput,
            p_request_id: randomUUID(),
            p_expected_case_revision: reopenAgain.caseRevision,
            p_expected_closure_revision: reopenAgain.closureRevision,
            p_expected_task_snapshot: reopenAgain.taskSnapshot,
            p_task_resolutions: [],
          }),
        );
        assert.equal(
          (await read()).suggestions.some((s) => s.caseId === caseId),
          false,
        );
        const third = await contact("2003-01-01");
        assert.equal(
          (await read()).suggestions.find((s) => s.caseId === caseId)?.eventId,
          third.id,
        );
        const voidInput = {
          ...correction,
          p_event_id: third.id,
          p_operation: "void",
          p_occurred_on: null,
          p_direction: null,
        };
        const voidPreview = ok<{
          caseRevision: number;
          eventRevision: number;
          blockedBy: string[];
        }>(await call("preview_recruitment_case_correction", voidInput));
        assert.deepEqual(voidPreview.blockedBy, []);
        ok(
          await call("correct_recruitment_case_event", {
            ...voidInput,
            p_request_id: randomUUID(),
            p_expected_case_revision: voidPreview.caseRevision,
            p_expected_event_revision: voidPreview.eventRevision,
          }),
        );
        assert.equal(
          (await read()).suggestions.some((s) => s.caseId === caseId),
          false,
        );
      },
    );
    await t.test(
      "newer uncertain provenance suppresses an older qualifying contact",
      async () => {
        const caseId = await createCase();
        ok(
          await call("record_manual_recruitment_contact", {
            p_request_id: randomUUID(),
            p_case_id: caseId,
            p_direction: "outbound",
            p_occurred_on: "2000-01-01",
          }),
        );
        assert.equal(
          (await read()).suggestions.some((s) => s.caseId === caseId),
          true,
        );
        ok(
          await call("record_recruitment_case_event", {
            p_request_id: randomUUID(),
            p_case_id: caseId,
            p_kind: "contact",
            p_direction: "outbound",
            p_occurred_on: "2001-01-01",
          }),
        );
        assert.equal(
          (await read()).suggestions.some((s) => s.caseId === caseId),
          false,
        );
      },
    );

    await t.test(
      "mixed close expires cancelled and detached reminders while keeping an unchanged relation",
      async () => {
        const caseId = await createCase();
        const cancelled = await createTask(caseId);
        const detached = await createTask(caseId);
        const kept = await createTask(caseId);
        for (const task of [cancelled, detached, kept])
          ok(await command(set(task)));
        const input = {
          p_case_id: caseId,
          p_operation: "close",
          p_closure_id: null,
          p_outcome: "Inny",
          p_occurred_on: null,
          p_offer_confirmed: false,
        };
        const preview = ok<{
          caseRevision: number;
          closureRevision: number | null;
          taskSnapshot: string[];
        }>(await call("preview_recruitment_case_lifecycle", input));
        ok(
          await call("confirm_recruitment_case_lifecycle_tasks", {
            ...input,
            p_request_id: randomUUID(),
            p_expected_case_revision: preview.caseRevision,
            p_expected_closure_revision: preview.closureRevision,
            p_expected_task_snapshot: preview.taskSnapshot,
            p_task_resolutions: [
              { taskId: cancelled.id, action: "cancel" },
              { taskId: detached.id, action: "detach" },
              { taskId: kept.id, action: "keep" },
            ],
          }),
        );
        const reminders = (await read()).reminders;
        assert.equal(
          reminders.some((r) => r.taskId === cancelled.id),
          false,
        );
        assert.equal(
          reminders.some((r) => r.taskId === detached.id),
          false,
        );
        assert.equal(
          reminders.some((r) => r.taskId === kept.id),
          true,
        );
      },
    );
    await t.test(
      "invalid DST and timezone cannot be saved by RPC or direct Data API",
      async () => {
        const task = await createTask();
        const before = await read();
        for (const payload of [
          { ...set(task), date: "2026-03-29", time: "02:30", offset: 60 },
          { ...set(task), timeZone: "No/Such_Zone" },
          { ...set(task), offset: 0 },
        ]) {
          denied(await command(payload));
          denied(
            await api("/rest/v1/recruitment_reminder_command", "POST", {
              request_id: randomUUID(),
              payload,
            }),
          );
        }
        assert.deepEqual(await read(), before);
      },
    );
    await t.test("concurrent retry creates one configuration", async () => {
      const task = await createTask();
      const requestId = randomUUID();
      const replies = await Promise.all([
        command(set(task), requestId),
        command(set(task), requestId),
      ]);
      assert.deepEqual(
        replies.map((reply) => ok<{ kind: string }>(reply).kind).sort(),
        ["created", "replayed"],
      );
      assert.equal(
        (await read()).reminders.filter((r) => r.taskId === task.id).length,
        1,
      );
    });
    await t.test(
      "acknowledge and disable are durable and replayed idempotently",
      async () => {
        for (const operation of ["acknowledge", "disable"] as const) {
          const task = await createTask();
          ok(await command(set(task)));
          const reminder = (await read()).reminders.find(
            (row) => row.taskId === task.id,
          );
          assert.ok(reminder);
          const payload = {
            operation,
            taskId: task.id,
            configurationId: reminder.id,
          };
          const requestId = randomUUID();
          assert.equal(
            ok<{ kind: string }>(await command(payload, requestId)).kind,
            "created",
          );
          assert.equal(
            ok<{ kind: string }>(await command(payload, requestId)).kind,
            "replayed",
          );
          assert.equal(
            (await read()).reminders.some((row) => row.taskId === task.id),
            false,
          );
          denied(await command(payload));
        }
      },
    );
    await t.test(
      "a failed bulk command rolls back preceding valid command",
      async () => {
        const task = await createTask();
        const before = await read();
        denied(
          await api("/rest/v1/recruitment_reminder_command", "POST", [
            { request_id: randomUUID(), payload: set(task) },
            {
              request_id: randomUUID(),
              payload: { ...set(task), timeZone: "No/Such_Zone" },
            },
          ]),
        );
        assert.deepEqual(await read(), before);
      },
    );
    await t.test(
      "committed unknown-provenance facts cannot gain a marker, including A/B/anon attempts",
      async () => {
        const caseId = await createCase();
        const requestId = randomUUID();
        const event = ok<{ event: { id: string } }>(
          await call("record_recruitment_case_event", {
            p_request_id: requestId,
            p_case_id: caseId,
            p_kind: "contact",
            p_direction: "outbound",
            p_occurred_on: "2000-01-01",
          }),
        ).event;
        const marker = {
          request_id: requestId,
          case_id: caseId,
          direction: "outbound",
          occurred_on: "2000-01-01",
          event_id: event.id,
        };
        for (const token of [a.token, b.token, null])
          denied(
            await api(
              "/rest/v1/recruitment_manual_contact",
              "POST",
              marker,
              token,
            ),
          );
        assert.equal(
          (await read()).suggestions.some((row) => row.caseId === caseId),
          false,
        );
        assert.deepEqual(
          ok<Row[]>(
            await api(
              `/rest/v1/recruitment_manual_contact?select=*&case_id=eq.${caseId}`,
            ),
          ),
          [],
        );
        assert.deepEqual(
          ok<Row[]>(
            await api(
              `/rest/v1/recruitment_manual_contact?select=*&case_id=eq.${caseId}`,
              "GET",
              undefined,
              b.token,
            ),
          ),
          [],
        );
      },
    );
  },
);
