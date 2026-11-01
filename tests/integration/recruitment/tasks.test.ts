/** DEC-060: real JWT/Data API/RLS and transactional BR-011 task proof. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import {
  createAccounts,
  denied,
  request,
  type Reply,
} from "../rls/data-api.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Tasks require a guarded disposable target");
const target = await readRecruitmentTarget(id);
type Row = Record<string, unknown>;
type Task = Row & {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  due_on: string | null;
  status: "Do zrobienia" | "Wykonane" | "Anulowane";
  case_id: string | null;
  revision: number;
};
type Preview = {
  caseRevision: number;
  closureRevision: number | null;
  openTasks: Task[];
  taskSnapshot: string[];
};
type Resolution = { taskId: string; action: "cancel" | "keep" | "detach" };
function ok<T>(reply: Reply): T {
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return reply.body as T;
}

test(
  "DEC060 private Tasks Core and atomic closure resolutions",
  { timeout: 240_000 },
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
    const createCase = async (token = a.token) =>
      ok<{ case: { id: string } }>(
        await call(
          "create_recruitment_case",
          {
            p_request_id: randomUUID(),
            p_title: `Tasks QA ${randomUUID()}`,
          },
          token,
        ),
      ).case.id;
    const command = (
      payload: Row,
      requestId = randomUUID(),
      token: string | null = a.token,
    ) =>
      call(
        "execute_recruitment_task_command",
        {
          p_request_id: requestId,
          p_payload: payload,
        },
        token,
      );
    const createPayload = (
      caseId: string | null = null,
      changes: Row = {},
    ) => ({
      operation: "create",
      title: `Task ${randomUUID()}`,
      description: null,
      dueOn: null,
      caseId,
      ...changes,
    });
    const create = async (caseId: string | null = null, changes: Row = {}) =>
      ok<{ kind: string; task: Task }>(
        await command(createPayload(caseId, changes)),
      ).task;
    const taskRows = async (query = "", token: string | null = a.token) =>
      ok<Task[]>(
        await api(
          `/rest/v1/recruitment_task?select=*&${query}`,
          "GET",
          undefined,
          token,
        ),
      );
    const readTask = async (taskId: string) =>
      (await taskRows(`id=eq.${taskId}`))[0];
    const audit = async (taskId: string) =>
      ok<Row[]>(
        await api(
          `/rest/v1/recruitment_task_command?select=*&task_id=eq.${taskId}&order=recorded_at.asc,id.asc`,
        ),
      );
    const state = async (caseId: string) =>
      ok<Row[]>(
        await api(
          `/rest/v1/recruitment_case?select=status,current_stage,case_revision&id=eq.${caseId}`,
        ),
      )[0];
    const history = async (caseId: string) =>
      ok<Row[]>(
        await api(
          `/rest/v1/recruitment_case_lifecycle?select=*&case_id=eq.${caseId}`,
        ),
      );
    const facts = async (caseId: string) =>
      ok<Row[]>(
        await api(
          `/rest/v1/recruitment_case_event?select=*&case_id=eq.${caseId}`,
        ),
      );
    const closeInput = (caseId: string) => ({
      p_case_id: caseId,
      p_operation: "close",
      p_closure_id: null,
      p_outcome: "Inny",
      p_occurred_on: null,
      p_offer_confirmed: false,
    });
    const preview = async (caseId: string) =>
      ok<Preview>(
        await call("preview_recruitment_case_lifecycle", closeInput(caseId)),
      );
    const closePayload = (
      caseId: string,
      p: Preview,
      choices: Resolution[],
      requestId = randomUUID(),
    ) => ({
      ...closeInput(caseId),
      p_request_id: requestId,
      p_expected_case_revision: p.caseRevision,
      p_expected_closure_revision: p.closureRevision,
      p_expected_task_snapshot: p.taskSnapshot,
      p_task_resolutions: choices,
    });
    const close = async (caseId: string, choices: Resolution[] = []) => {
      const p = await preview(caseId);
      const payload = closePayload(caseId, p, choices);
      const result = ok<{ kind: string; entry: Row }>(
        await call("confirm_recruitment_case_lifecycle_tasks", payload),
      );
      return { p, payload, result };
    };
    const statusPayload = (task: Task, status: Task["status"]) => ({
      operation: "set-status",
      taskId: task.id,
      expectedRevision: task.revision,
      status,
    });
    const editPayload = (task: Task, changes: Row = {}) => ({
      operation: "edit",
      taskId: task.id,
      expectedRevision: task.revision,
      title: task.title,
      description: task.description,
      dueOn: task.due_on,
      caseId: task.case_id,
      ...changes,
    });

    await t.test(
      "General and case tasks accept no deadline, future calendar day and exact Unicode limits",
      async () => {
        const c = await createCase();
        const before = await state(c);
        const general = await create(null, { title: "  Ogólne zadanie  " });
        assert.equal(general.title, "Ogólne zadanie");
        assert.equal(general.status, "Do zrobienia");
        assert.equal(general.case_id, null);
        assert.equal(general.due_on, null);
        const linked = await create(c, {
          title: "🧪".repeat(160),
          description: "x".repeat(2000),
          dueOn: "2999-12-31",
        });
        assert.equal(linked.case_id, c);
        assert.equal(linked.due_on, "2999-12-31");
        assert.equal(Array.from(linked.title).length, 160);
        assert.equal((await readTask(linked.id)).description?.length, 2000);
        assert.deepEqual(await state(c), before);
        assert.deepEqual(await facts(c), []);
        assert.deepEqual(await history(c), []);
      },
    );

    await t.test(
      "Invalid fields/status/date never save tasks or accept client-owned authorization",
      async () => {
        const foreignCase = await createCase(b.token);
        const before = (await taskRows()).length;
        for (const changes of [
          { title: "   " },
          { title: "🧪".repeat(161) },
          { description: "x".repeat(2001) },
          { dueOn: "2025-02-29" },
          { dueOn: "2026-01-01T12:00:00Z" },
          { status: "Wykonane" },
          { ownerId: b.id },
          { caseId: foreignCase },
          { caseId: randomUUID() },
        ])
          denied(await command(createPayload(null, changes)));
        assert.equal((await taskRows()).length, before);
        const task = await create();
        denied(
          await command({
            ...statusPayload(task, "Wykonane"),
            status: "W toku",
          }),
        );
        assert.deepEqual(await readTask(task.id), task);
      },
    );

    await t.test(
      "Edits and explicit status restore preserve audit and never modify case lifecycle",
      async () => {
        const c = await createCase();
        const before = await state(c);
        let task = await create(c);
        task = ok<{ task: Task }>(
          await command(
            editPayload(task, {
              title: "Poprawiony tytuł",
              description: "Opis",
              dueOn: "2999-01-01",
            }),
          ),
        ).task;
        for (const status of [
          "Wykonane",
          "Do zrobienia",
          "Anulowane",
          "Do zrobienia",
        ] as const) {
          task = ok<{ task: Task }>(
            await command(statusPayload(task, status)),
          ).task;
          assert.equal(task.status, status);
        }
        const entries = await audit(task.id);
        assert.equal(entries.length, 6);
        assert.ok(
          entries.every(
            (row) =>
              row.owner_id === a.id && typeof row.recorded_at === "string",
          ),
        );
        assert.ok(
          entries.some((row) =>
            JSON.stringify(row.before_values).includes("Wykonane"),
          ),
        );
        assert.equal((await readTask(task.id)).status, "Do zrobienia");
        assert.deepEqual(await state(c), before);
        assert.deepEqual(await facts(c), []);
      },
    );

    await t.test(
      "Concurrent same intent, mismatched retry and old replay never duplicate or overwrite",
      async () => {
        const requestId = randomUUID();
        const payload = createPayload();
        const results = (
          await Promise.all([
            command(payload, requestId),
            command(payload, requestId),
          ])
        ).map((r) => ok<{ kind: string; task: Task }>(r));
        assert.deepEqual(results.map((r) => r.kind).sort(), [
          "created",
          "replayed",
        ]);
        assert.equal(results[0].task.id, results[1].task.id);
        const task = results[0].task;
        assert.equal((await taskRows(`id=eq.${task.id}`)).length, 1);
        denied(
          await command({ ...payload, title: "Od innego zamiaru" }, requestId),
        );
        const done = ok<{ task: Task }>(
          await command(statusPayload(task, "Wykonane")),
        ).task;
        assert.equal(
          ok<{ kind: string }>(await command(payload, requestId)).kind,
          "replayed",
        );
        assert.deepEqual(await readTask(task.id), done);
        assert.equal((await audit(task.id)).length, 2);
      },
    );

    await t.test(
      "Concurrent stale edit and ABA revision cannot silently overwrite newer task",
      async () => {
        const original = await create();
        const replies = await Promise.all([
          command(editPayload(original, { title: "Pierwsza zmiana" })),
          command(editPayload(original, { title: "Druga zmiana" })),
        ]);
        assert.equal(replies.filter((r) => r.status === 200).length, 1);
        replies.filter((r) => r.status !== 200).forEach(denied);
        let current = await readTask(original.id);
        current = ok<{ task: Task }>(
          await command(statusPayload(current, "Wykonane")),
        ).task;
        current = ok<{ task: Task }>(
          await command(statusPayload(current, "Do zrobienia")),
        ).task;
        denied(
          await command(editPayload(original, { description: "Stara zmiana" })),
        );
        assert.deepEqual(await readTask(original.id), current);
      },
    );

    await t.test(
      "Owner A reads list/ID/audit/recovery; B and anon leak no rows, metadata or counts",
      async () => {
        const task = await create();
        const entries = await audit(task.id);
        assert.equal(entries.length, 1);
        for (const table of [
          "recruitment_task",
          "recruitment_task_current",
          "recruitment_task_command",
        ]) {
          for (const query of [
            "select=*",
            `select=*&${table === "recruitment_task_command" ? "task_id" : "id"}=eq.${task.id}`,
            `select=id&owner_id=eq.${a.id}`,
          ]) {
            const path = `/rest/v1/${table}?${query}`;
            const foreign = await api(path, "GET", undefined, b.token);
            assert.deepEqual(ok(foreign), []);
            assert.equal(foreign.range?.split("/")[1], "0");
            denied(await api(path, "GET", undefined, null));
          }
        }
        const requestId = entries[0].request_id;
        assert.deepEqual(
          ok(
            await api(
              `/rest/v1/recruitment_task_command?select=*&request_id=eq.${requestId}`,
              "GET",
              undefined,
              b.token,
            ),
          ),
          [],
        );
        for (const token of [b.token, null]) {
          denied(
            await command(
              editPayload(task, { title: "Cudza zmiana" }),
              randomUUID(),
              token,
            ),
          );
          denied(
            await command(
              statusPayload(task, "Anulowane"),
              randomUUID(),
              token,
            ),
          );
        }
        assert.deepEqual(await readTask(task.id), task);
      },
    );

    await t.test(
      "Projection and audit cannot be forged, reassigned, updated or deleted through Data API",
      async () => {
        const task = await create();
        denied(
          await api("/rest/v1/recruitment_task", "POST", {
            ...task,
            id: randomUUID(),
          }),
        );
        for (const change of [
          { title: "BYPASS" },
          { owner_id: b.id },
          { case_id: randomUUID() },
          { status: "Wykonane" },
        ]) {
          denied(
            await api(
              `/rest/v1/recruitment_task?id=eq.${task.id}`,
              "PATCH",
              change,
            ),
          );
        }
        denied(
          await api(`/rest/v1/recruitment_task?id=eq.${task.id}`, "DELETE"),
        );
        const entry = (await audit(task.id))[0];
        denied(
          await api(
            `/rest/v1/recruitment_task_command?id=eq.${entry.id}`,
            "PATCH",
            { after_values: { status: "Wykonane" } },
          ),
        );
        denied(
          await api(
            `/rest/v1/recruitment_task_command?id=eq.${entry.id}`,
            "DELETE",
          ),
        );
        denied(
          await api("/rest/v1/recruitment_task_command", "POST", {
            request_id: randomUUID(),
            payload: createPayload(),
            owner_id: b.id,
            task_id: task.id,
          }),
        );
        assert.deepEqual(await readTask(task.id), task);
        assert.deepEqual(await audit(task.id), [entry]);
      },
    );

    await t.test(
      "Closure requires exact one explicit resolution for every open task and preview writes nothing",
      async () => {
        const c = await createCase();
        const task = await create(c);
        const p = await preview(c);
        assert.deepEqual(
          p.openTasks.map((row) => row.id),
          [task.id],
        );
        assert.deepEqual(p.taskSnapshot, [`${task.id}:${task.revision}`]);
        assert.equal((await audit(task.id)).length, 1);
        assert.deepEqual(await history(c), []);
        for (const choices of [
          [],
          [{ taskId: task.id, action: "invented" }],
          [
            { taskId: task.id, action: "keep" },
            { taskId: task.id, action: "keep" },
          ],
          [{ taskId: randomUUID(), action: "keep" }],
        ]) {
          denied(
            await call(
              "confirm_recruitment_case_lifecycle_tasks",
              closePayload(c, p, choices as Resolution[]),
            ),
          );
        }
        assert.deepEqual(await history(c), []);
        assert.equal((await state(c)).status, "Zapisane");
        assert.deepEqual(await readTask(task.id), task);
      },
    );

    await t.test(
      "Cancel, keep and detach are atomic with closure and preserve prior relationship in audit",
      async () => {
        const c = await createCase();
        const canceled = await create(c);
        const kept = await create(c);
        const detached = await create(c);
        const done = await create(c);
        await command(statusPayload(done, "Wykonane"));
        const choices: Resolution[] = [
          { taskId: canceled.id, action: "cancel" },
          { taskId: kept.id, action: "keep" },
          { taskId: detached.id, action: "detach" },
        ];
        const result = await close(c, choices);
        assert.equal((await state(c)).status, "Zakończone");
        assert.equal((await history(c)).length, 1);
        assert.equal((await readTask(canceled.id)).status, "Anulowane");
        assert.equal((await readTask(canceled.id)).case_id, c);
        assert.equal((await readTask(kept.id)).status, "Do zrobienia");
        assert.equal((await readTask(kept.id)).case_id, c);
        assert.equal((await readTask(detached.id)).status, "Do zrobienia");
        assert.equal((await readTask(detached.id)).case_id, null);
        for (const task of [canceled, kept, detached]) {
          const entries = await audit(task.id);
          assert.equal(entries.length, 2);
          const resolution = entries.find(
            (row) => row.closure_id === result.result.entry.id,
          );
          assert.ok(
            resolution,
            "resolution audit references the actual closure",
          );
          assert.equal((resolution.before_values as Row).case_id, c);
        }
        assert.equal(
          (await audit(done.id)).length,
          2,
          "terminal task is not resolved again",
        );
        assert.deepEqual(await facts(c), []);
        assert.equal(
          ok<{ kind: string }>(
            await call(
              "confirm_recruitment_case_lifecycle_tasks",
              result.payload,
            ),
          ).kind,
          "replayed",
        );
        assert.equal((await audit(detached.id)).length, 2);
        denied(
          await call("confirm_recruitment_case_lifecycle_tasks", {
            ...result.payload,
            p_task_resolutions: choices.map((row) => ({
              ...row,
              action: "keep",
            })),
          }),
        );
      },
    );

    await t.test(
      "Task edits, attachment and status ABA invalidate an already displayed closure snapshot",
      async () => {
        for (const change of ["edit", "add", "restore"] as const) {
          const c = await createCase();
          const task = await create(c);
          const p = await preview(c);
          if (change === "edit")
            await command(
              editPayload(task, { title: "Zmienione po podglądzie" }),
            );
          if (change === "add") await create(c);
          if (change === "restore") {
            const done = ok<{ task: Task }>(
              await command(statusPayload(task, "Wykonane")),
            ).task;
            await command(statusPayload(done, "Do zrobienia"));
          }
          denied(
            await call(
              "confirm_recruitment_case_lifecycle_tasks",
              closePayload(c, p, [{ taskId: task.id, action: "keep" }]),
            ),
          );
          assert.deepEqual(await history(c), []);
          assert.equal((await state(c)).status, "Zapisane");
          const fresh = await preview(c);
          await call(
            "confirm_recruitment_case_lifecycle_tasks",
            closePayload(
              c,
              fresh,
              fresh.openTasks.map((row) => ({
                taskId: row.id,
                action: "keep",
              })),
            ),
          ).then(ok);
        }
      },
    );

    await t.test(
      "Legacy close RPC and direct lifecycle insertion cannot bypass pending task choices",
      async () => {
        const c = await createCase();
        const task = await create(c);
        const p = await preview(c);
        const {
          p_expected_task_snapshot: _snapshot,
          p_task_resolutions: _choices,
          ...legacy
        } = closePayload(c, p, []);
        void _snapshot;
        void _choices;
        denied(await call("confirm_recruitment_case_lifecycle", legacy));
        denied(
          await api("/rest/v1/recruitment_case_lifecycle", "POST", {
            request_id: randomUUID(),
            case_id: c,
            kind: "close",
            outcome: "Inny",
            occurred_on: null,
            offer_confirmed: false,
            expected_case_revision: p.caseRevision,
          }),
        );
        assert.equal((await state(c)).status, "Zapisane");
        assert.deepEqual(await readTask(task.id), task);
        assert.deepEqual(await history(c), []);
      },
    );

    await t.test(
      "Closed-case create/edit/restore never reopens RecruitmentCase; case reopen never restores canceled tasks",
      async () => {
        const c = await createCase();
        const canceled = await create(c);
        await close(c, [{ taskId: canceled.id, action: "cancel" }]);
        const before = await state(c);
        let task = await create(c, { dueOn: "2999-01-01" });
        task = ok<{ task: Task }>(
          await command(
            editPayload(task, { description: "Działanie po zakończeniu" }),
          ),
        ).task;
        task = ok<{ task: Task }>(
          await command(statusPayload(task, "Wykonane")),
        ).task;
        await command(statusPayload(task, "Do zrobienia"));
        assert.deepEqual(await state(c), before);
        assert.equal((await history(c)).length, 1);
        const reopenInput = {
          ...closeInput(c),
          p_operation: "reopen",
          p_outcome: null,
        };
        const p = ok<Preview>(
          await call("preview_recruitment_case_lifecycle", reopenInput),
        );
        ok(
          await call("confirm_recruitment_case_lifecycle_tasks", {
            ...reopenInput,
            p_request_id: randomUUID(),
            p_expected_case_revision: p.caseRevision,
            p_expected_closure_revision: p.closureRevision,
            p_expected_task_snapshot: [],
            p_task_resolutions: [],
          }),
        );
        assert.equal((await readTask(canceled.id)).status, "Anulowane");
        assert.deepEqual(await facts(c), []);
      },
    );

    await t.test(
      "Real close/update and close/close races preserve one coherent resolution and monotonic conflicts",
      async () => {
        const c = await createCase();
        const task = await create(c);
        const p = await preview(c);
        const replies = await Promise.all([
          call(
            "confirm_recruitment_case_lifecycle_tasks",
            closePayload(c, p, [{ taskId: task.id, action: "cancel" }]),
          ),
          command(editPayload(task, { title: "Równoczesna zmiana" })),
        ]);
        assert.equal(replies.filter((row) => row.status === 200).length, 1);
        replies.filter((row) => row.status !== 200).forEach(denied);
        if (replies[0].status === 200) {
          assert.equal((await state(c)).status, "Zakończone");
          assert.equal((await readTask(task.id)).status, "Anulowane");
        } else {
          assert.equal((await state(c)).status, "Zapisane");
          assert.deepEqual(await history(c), []);
          assert.equal((await readTask(task.id)).title, "Równoczesna zmiana");
        }
        const c2 = await createCase();
        const task2 = await create(c2);
        const p2 = await preview(c2);
        const closings = await Promise.all(
          [1, 2].map(() =>
            call(
              "confirm_recruitment_case_lifecycle_tasks",
              closePayload(c2, p2, [{ taskId: task2.id, action: "detach" }]),
            ),
          ),
        );
        assert.equal(closings.filter((row) => row.status === 200).length, 1);
        closings.filter((row) => row.status !== 200).forEach(denied);
        assert.equal((await history(c2)).length, 1);
        assert.equal((await audit(task2.id)).length, 2);
      },
    );

    await t.test(
      "Permitted command INSERT derives its owner and runs the same audited validation",
      async () => {
        const c = await createCase();
        const requestId = randomUUID();
        const payload = createPayload(c);
        const reply = await api("/rest/v1/recruitment_task_command", "POST", {
          request_id: requestId,
          payload,
        });
        assert.equal(reply.status, 201, JSON.stringify(reply.body));
        const entry = (reply.body as Row[])[0];
        assert.equal(entry.owner_id, a.id);
        const task = await readTask(String(entry.task_id));
        assert.equal(task.case_id, c);
        assert.equal(task.status, "Do zrobienia");
        assert.equal((await audit(task.id)).length, 1);
        denied(
          await api("/rest/v1/recruitment_task_command", "POST", {
            request_id: randomUUID(),
            payload: { ...payload, caseId: await createCase(b.token) },
          }),
        );
        assert.equal((await taskRows(`case_id=eq.${c}`)).length, 1);
      },
    );

    await t.test(
      "Real close/create and close/complete races serialize without lost tasks or unacknowledged prior work",
      async () => {
        const c = await createCase();
        const p = await preview(c);
        const creation = createPayload(c);
        const replies = await Promise.all([
          call(
            "confirm_recruitment_case_lifecycle_tasks",
            closePayload(c, p, []),
          ),
          command(creation),
        ]);
        const created = ok<{ task: Task }>(replies[1]).task;
        assert.equal((await readTask(created.id)).case_id, c);
        assert.equal((await audit(created.id)).length, 1);
        if (replies[0].status === 200) {
          // A new task is allowed after the serialized close, without implicitly reopening.
          assert.equal((await state(c)).status, "Zakończone");
          assert.equal((await history(c)).length, 1);
        } else {
          denied(replies[0]);
          assert.equal((await state(c)).status, "Zapisane");
          assert.deepEqual(await history(c), []);
          await close(c, [{ taskId: created.id, action: "keep" }]);
        }
        const c2 = await createCase();
        const task = await create(c2);
        const p2 = await preview(c2);
        const completing = await Promise.all([
          call(
            "confirm_recruitment_case_lifecycle_tasks",
            closePayload(c2, p2, [{ taskId: task.id, action: "cancel" }]),
          ),
          command(statusPayload(task, "Wykonane")),
        ]);
        assert.equal(completing.filter((row) => row.status === 200).length, 1);
        completing.filter((row) => row.status !== 200).forEach(denied);
        assert.equal(
          (await readTask(task.id)).status,
          completing[0].status === 200 ? "Anulowane" : "Wykonane",
        );
        assert.equal(
          (await history(c2)).length,
          completing[0].status === 200 ? 1 : 0,
        );
        assert.equal((await audit(task.id)).length, 2);
      },
    );

    await t.test(
      "Failure after task resolution rolls back tasks, their audits and closure; same intent can retry",
      async () => {
        const c = await createCase();
        const task = await create(c);
        const p = await preview(c);
        const payload = closePayload(c, p, [
          { taskId: task.id, action: "cancel" },
        ]);
        const beforeState = await state(c);
        const beforeAudit = await audit(task.id);
        const sql = postgres({
          ...target.db,
          max: 1,
          ssl: false,
          onnotice: () => {},
        });
        const name = `qa_tasks_failure_${randomUUID().replaceAll("-", "")}`;
        try {
          await sql.unsafe(
            `CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Synthetic Tasks after-projection failure'; END $$`,
          );
          await sql.unsafe(
            `REVOKE ALL ON FUNCTION public.${name}() FROM PUBLIC,anon,authenticated,service_role`,
          );
          await sql.unsafe(
            `CREATE TRIGGER ${name} AFTER UPDATE ON public.recruitment_task FOR EACH ROW WHEN (NEW.id='${task.id}'::uuid) EXECUTE FUNCTION public.${name}()`,
          );
          denied(
            await call("confirm_recruitment_case_lifecycle_tasks", payload),
          );
          assert.deepEqual(await readTask(task.id), task);
          assert.deepEqual(await audit(task.id), beforeAudit);
          assert.deepEqual(await state(c), beforeState);
          assert.deepEqual(await history(c), []);
        } finally {
          await sql.unsafe(
            `DROP TRIGGER IF EXISTS ${name} ON public.recruitment_task`,
          );
          await sql.unsafe(`DROP FUNCTION IF EXISTS public.${name}()`);
          await sql.end();
        }
        assert.equal(
          ok<{ kind: string }>(
            await call("confirm_recruitment_case_lifecycle_tasks", payload),
          ).kind,
          "created",
        );
        assert.equal((await readTask(task.id)).status, "Anulowane");
      },
    );

    await t.test(
      "Future CalendarEvent tables preserve fail-closed guard for new and legacy close paths",
      async () => {
        const sql = postgres({
          ...target.db,
          max: 1,
          ssl: false,
          onnotice: () => {},
        });
        const c = await createCase();
        const p = await preview(c);
        for (const table of ["calendar_event", "recruitment_calendar_event"]) {
          try {
            await sql.unsafe(
              `CREATE TABLE public.${table}(id uuid PRIMARY KEY)`,
            );
            denied(
              await call("preview_recruitment_case_lifecycle", closeInput(c)),
            );
            denied(
              await call(
                "confirm_recruitment_case_lifecycle_tasks",
                closePayload(c, p, []),
              ),
            );
            const {
              p_expected_task_snapshot: _snapshot,
              p_task_resolutions: _choices,
              ...legacy
            } = closePayload(c, p, []);
            void _snapshot;
            void _choices;
            denied(await call("confirm_recruitment_case_lifecycle", legacy));
            assert.equal((await state(c)).status, "Zapisane");
            assert.deepEqual(await history(c), []);
          } finally {
            await sql.unsafe(`DROP TABLE IF EXISTS public.${table}`);
          }
        }
        await sql.end();
        await close(c);
        assert.equal((await state(c)).status, "Zakończone");
      },
    );
  },
);
