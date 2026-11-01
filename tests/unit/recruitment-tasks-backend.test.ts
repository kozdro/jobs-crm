import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseTaskInput,
  type Task,
  type TaskCommandInput,
} from "../../src/modules/recruitment/domain/tasks";
import { parseLifecycleInput } from "../../src/modules/recruitment/domain/lifecycle";
import {
  executeTaskCommand,
  getTask,
  listTasks,
  readTask,
} from "../../src/modules/recruitment/application/tasks";
import { readLifecyclePreview } from "../../src/modules/recruitment/application/lifecycle";
const id = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const create = {
  operation: "create" as const,
  title: "Przygotuj pytania",
  description: null,
  dueOn: null,
  caseId: null,
};
const task: Task = {
  id,
  title: create.title,
  description: null,
  due_on: null,
  status: "Do zrobienia",
  case_id: null,
  case_title: null,
  revision: 0,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
};
function fake(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  for (const method of [query.select, query.eq, query.order])
    method.mockReturnValue(query);
  return {
    query,
    client: {
      rpc: vi.fn().mockResolvedValue({ data, error }),
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient,
  };
}
describe("DEC060 Tasks domain", () => {
  it("canonicalizes title and permits general task without a term", () => {
    expect(parseTaskInput({ ...create, title: " \u00a0Tytuł\u3000 " })).toEqual(
      { success: true, data: { ...create, title: "Tytuł" } },
    );
  });
  it("counts Unicode points rather than UTF16 units", () => {
    expect(parseTaskInput({ ...create, title: "😀".repeat(160) }).success).toBe(
      true,
    );
    expect(parseTaskInput({ ...create, title: "😀".repeat(161) }).success).toBe(
      false,
    );
  });
  it.each(["", " \t ", "x".repeat(161), "x\0", "\ud800"])(
    "rejects invalid title %j",
    (title) => {
      expect(parseTaskInput({ ...create, title }).success).toBe(false);
    },
  );
  it("accepts exactly2000 description points without trimming stored content", () => {
    expect(
      parseTaskInput({ ...create, description: "😀".repeat(2000) }).success,
    ).toBe(true);
    expect(
      parseTaskInput({ ...create, description: "x".repeat(2001) }).success,
    ).toBe(false);
  });
  it("permits future days and leap days without interpreting a time", () => {
    for (const dueOn of [null, "2096-02-29", "9999-12-31", "0001-01-01"])
      expect(parseTaskInput({ ...create, dueOn }).success).toBe(true);
  });
  it.each([
    "2026-02-29",
    "2026-13-01",
    "0000-01-01",
    "2026-11-01T10:00:00Z",
    "2026-1-1",
  ])("rejects invalid task day %s", (dueOn) => {
    expect(parseTaskInput({ ...create, dueOn }).success).toBe(false);
  });
  it("rejects injected statuses, owner and reminders at create", () => {
    for (const extra of [
      { status: "Wykonane" },
      { ownerId: id },
      { reminderAt: "2099-01-01" },
      { priority: "high" },
    ])
      expect(parseTaskInput({ ...create, ...extra }).success).toBe(false);
  });
  it("supports explicit reopen using the approved status and revision", () => {
    expect(
      parseTaskInput({
        operation: "set-status",
        taskId: id,
        expectedRevision: 2,
        status: "Do zrobienia",
      }).success,
    ).toBe(true);
    expect(
      parseTaskInput({
        operation: "set-status",
        taskId: id,
        expectedRevision: 2,
        status: "W toku",
      }).success,
    ).toBe(false);
  });
  it.each([-1, 1.5, 2147483647, "0"])(
    "rejects invalid optimistic revision %j",
    (expectedRevision) => {
      expect(
        parseTaskInput({
          operation: "set-status",
          taskId: id,
          expectedRevision,
          status: "Wykonane",
        }).success,
      ).toBe(false);
    },
  );
  it("does not carry a caller-supplied date or status through an edit", () => {
    expect(
      parseTaskInput({
        ...create,
        operation: "edit",
        taskId: id,
        expectedRevision: 0,
        status: "Wykonane",
      }).success,
    ).toBe(false);
  });
});
describe("Tasks repository response and transport", () => {
  it("sends canonical payload only and preserves replay kind", async () => {
    const { client } = fake({ kind: "replayed", task });
    expect(
      await executeTaskCommand(client, {
        ...create,
        requestId,
        title: "  Przygotuj pytania ",
      }),
    ).toEqual({ kind: "replayed", task });
    expect(client.rpc).toHaveBeenCalledWith(
      "execute_recruitment_task_command",
      { p_request_id: requestId, p_payload: create },
    );
  });
  it("rejects success for a task revision not produced by this command", async () => {
    const { client } = fake({
      kind: "created",
      task: { ...task, revision: 7 },
    });
    await expect(
      executeTaskCommand(client, { ...create, requestId }),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
  it("rejects a response that silently changes the chosen relation", async () => {
    const { client } = fake({
      kind: "created",
      task: { ...task, case_id: caseId, case_title: "Sprawa" },
    });
    await expect(
      executeTaskCommand(client, { ...create, requestId }),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
  it.each([
    ["PT412", "stale"],
    ["PT409", "conflict"],
    ["22023", "invalid"],
    ["42501", "unavailable"],
  ])("maps RPC failure %s without success or retry", async (code, kind) => {
    const { client } = fake(null, { code });
    await expect(
      executeTaskCommand(client, { ...create, requestId }),
    ).rejects.toMatchObject({ kind });
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
  it("filters owned case/open status before pagination", async () => {
    const linked = { ...task, case_id: caseId, case_title: "Sprawa" };
    const { client, query } = fake([linked]);
    expect(
      (await listTasks(client, { caseId, openOnly: true, page: 2 })).tasks,
    ).toEqual([linked]);
    expect(query.eq.mock.calls).toEqual([
      ["case_id", caseId],
      ["status", "Do zrobienia"],
    ]);
    expect(query.range).toHaveBeenCalledWith(25, 50);
  });
  it("rejects mismatched direct ID and malformed missing relation title", async () => {
    const { client } = fake({ ...task, id: caseId });
    await expect(getTask(client, id)).rejects.toMatchObject({
      kind: "unavailable",
    });
    expect(() => readTask({ ...task, case_id: caseId })).toThrow();
  });
  it("allows no-date completed task without invented due value", () => {
    expect(readTask({ ...task, status: "Wykonane" })).toMatchObject({
      due_on: null,
      status: "Wykonane",
    });
  });
  it("validates change-status result against exact requested status", async () => {
    const input: TaskCommandInput = {
      operation: "set-status",
      taskId: id,
      expectedRevision: 0,
      status: "Wykonane",
      requestId,
    };
    const { client } = fake({
      kind: "created",
      task: { ...task, revision: 1, status: "Anulowane" },
    });
    await expect(executeTaskCommand(client, input)).rejects.toMatchObject({
      kind: "unavailable",
    });
  });
});
describe("Tasks closure boundary", () => {
  const close = {
    operation: "close",
    caseId,
    closureId: null,
    outcome: "Inny",
    occurredOn: null,
    offerConfirmed: false,
    requestId,
    expectedCaseRevision: 0,
    expectedClosureRevision: 0,
  };
  it("preserves absent arrays for old intents and validates explicit decisions", () => {
    const old = parseLifecycleInput(close, true);
    expect(old.success && old.data).toEqual(close);
    expect(
      parseLifecycleInput(
        {
          ...close,
          expectedTaskSnapshot: [`${id}:0`],
          taskResolutions: [{ taskId: id, action: "keep" }],
        },
        true,
      ).success,
    ).toBe(true);
  });
  it("rejects duplicate decisions and unsupported implicit action", () => {
    for (const taskResolutions of [
      [
        { taskId: id, action: "keep" },
        { taskId: id, action: "detach" },
      ],
      [{ taskId: id, action: "auto" }],
    ])
      expect(
        parseLifecycleInput({ ...close, taskResolutions }, true).success,
      ).toBe(false);
  });
  it("rejects task decisions outside an explicit close", () => {
    expect(
      parseLifecycleInput(
        {
          ...close,
          operation: "reopen",
          outcome: null,
          taskResolutions: [{ taskId: id, action: "keep" }],
        },
        true,
      ).success,
    ).toBe(false);
  });
  it("fails closed if preview token and pending tasks disagree", () => {
    const preview = {
      caseRevision: 0,
      closureRevision: 0,
      cycle: 0,
      status: "Zakończone",
      currentStage: null,
      before: null,
      after: { outcome: "Inny", occurredOn: null, offerConfirmed: false },
      openTasks: [{ ...task, case_id: caseId, case_title: "Sprawa" }],
      taskSnapshot: [],
    };
    expect(() => readLifecyclePreview(preview)).toThrow();
    expect(
      readLifecyclePreview({ ...preview, taskSnapshot: [`${id}:0`] }).openTasks,
    ).toHaveLength(1);
  });
});
