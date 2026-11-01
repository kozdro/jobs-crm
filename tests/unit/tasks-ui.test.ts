import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  isTask,
  taskResultMatches,
  formatTaskDay,
  type TaskCommand,
} from "@/components/tasks/client";
import { TaskForm } from "@/components/tasks/task-form";
import { TasksPanel, TaskValues } from "@/components/tasks/tasks-panel";
import {
  isLifecyclePreview,
  parseLifecycleIntent,
} from "@/components/recruitment/lifecycle-intent";
import type { Task } from "@/modules/recruitment/domain/tasks";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const owner = "00000000-0000-4000-8000-000000000001";
const taskId = "00000000-0000-4000-8000-000000000002";
const caseId = "00000000-0000-4000-8000-000000000003";
const requestId = "00000000-0000-4000-8000-000000000004";
const task: Task = {
  id: taskId,
  title: "Przygotować pytania",
  description: null,
  due_on: "2030-12-31",
  case_id: caseId,
  case_title: "Sprawa A",
  status: "Do zrobienia",
  revision: 0,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
};
const create: TaskCommand = {
  operation: "create",
  title: task.title,
  description: null,
  dueOn: task.due_on,
  caseId,
  requestId,
};
const render = (value: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(value);
describe("Tasks Core UI contracts", () => {
  it("requires task identity and rejects missing, malformed, and invented state", () => {
    expect(isTask(task)).toBe(true);
    for (const bad of [
      { ...task, id: "bad" },
      { ...task, status: "W toku" },
      { ...task, due_on: "2030-02-30" },
      { ...task, revision: -1 },
      { ...task, case_id: "bad" },
      { ...task, created_at: "unknown" },
      null,
    ])
      expect(isTask(bad)).toBe(false);
  });
  it("confirms exact create/edit/status intention, never an unrelated recovered task", () => {
    expect(taskResultMatches(task, create)).toBe(true);
    expect(taskResultMatches({ ...task, title: "Inne" }, create)).toBe(false);
    expect(taskResultMatches({ ...task, case_id: null }, create)).toBe(false);
    expect(taskResultMatches({ ...task, status: "Wykonane" }, create)).toBe(
      false,
    );
    const edit: TaskCommand = {
      ...create,
      operation: "edit",
      taskId,
      expectedRevision: 0,
    };
    expect(taskResultMatches({ ...task, revision: 1 }, edit)).toBe(true);
    expect(taskResultMatches({ ...task, revision: 2 }, edit)).toBe(false);
    const status: TaskCommand = {
      operation: "set-status",
      taskId,
      expectedRevision: 0,
      status: "Wykonane",
      requestId,
    };
    expect(
      taskResultMatches({ ...task, status: "Wykonane", revision: 1 }, status),
    ).toBe(true);
    expect(
      taskResultMatches(
        { ...task, id: owner, status: "Wykonane", revision: 1 },
        status,
      ),
    ).toBe(false);
  });
  it("renders optional future day without time, a required title, and no arbitrary priority or alarm", () => {
    const html = render(
      createElement(TaskForm, {
        userId: owner,
        onSaved: vi.fn(),
        onCancel: vi.fn(),
        onReload: vi.fn(),
      }),
    );
    expect(html).toContain("Tytuł zadania");
    expect(html).toContain("160");
    expect(html).toContain("2000");
    expect(html).toContain('type="date"');
    expect(html).not.toContain('type="datetime-local"');
    expect(html).not.toContain('max="2026');
    expect(html).toContain("Zadanie ogólne — bez sprawy");
    expect(html).toContain("Do zrobienia");
    expect(html).not.toContain("Priorytet");
  });
  it("prefills only the explicit case context on create", () => {
    const html = render(
      createElement(TaskForm, {
        userId: owner,
        defaultCase: { id: caseId, title: "Sprawa A" },
        onSaved: vi.fn(),
        onCancel: vi.fn(),
        onReload: vi.fn(),
      }),
    );
    expect(html).toContain(`value="${caseId}" selected=""`);
    expect(html).toContain("Sprawa A");
    expect(html).not.toContain("Przygotować pytania");
  });
  it("separates Dashboard open-task context from urgency and displays no date invention", () => {
    const html = render(
      createElement(TasksPanel, { userId: owner, compact: true }),
    );
    expect(html).toContain("Otwarte zadania");
    expect(html).toContain("Brak terminu nie oznacza zaległości");
    expect(html).toContain("Wczytywanie zadań");
    expect(html).not.toContain("Nie masz otwartych zadań");
    const values = render(
      createElement(TaskValues, {
        task: { ...task, case_id: null, case_title: null, due_on: null },
      }),
    );
    expect(values).toContain("Bez terminu");
    expect(values).toContain("Zadanie ogólne");
    expect(formatTaskDay("2030-12-31")).toBe("31.12.2030");
  });
  it("preserves canonical closure choices in reload recovery and rejects altered task choices", () => {
    const command = {
      operation: "close",
      caseId,
      closureId: null,
      outcome: "Nie aplikowano",
      occurredOn: null,
      offerConfirmed: false,
      requestId,
      expectedCaseRevision: 2,
      expectedClosureRevision: 0,
      expectedTaskSnapshot: [`${taskId}:0`],
      taskResolutions: [{ taskId, action: "detach" }],
    };
    const raw = JSON.stringify({ ownerId: owner, caseId, requestId, command });
    expect(parseLifecycleIntent(raw, owner, caseId)?.command).toEqual(command);
    const malformed = JSON.stringify({
      ownerId: owner,
      caseId,
      requestId,
      command: { ...command, taskResolutions: [{ taskId, action: "delete" }] },
    });
    expect(
      parseLifecycleIntent(malformed, owner, caseId)?.command,
    ).toBeUndefined();
    const preview = {
      caseRevision: 2,
      closureRevision: 0,
      status: "Zakończone",
      currentStage: null,
      cycle: 0,
      before: null,
      after: {
        outcome: "Nie aplikowano",
        occurredOn: null,
        offerConfirmed: false,
      },
      openTasks: [task],
      taskSnapshot: [`${taskId}:0`],
    };
    expect(isLifecyclePreview(preview)).toBe(true);
    expect(
      isLifecyclePreview({
        ...preview,
        openTasks: [{ ...task, status: "Made up" }],
      }),
    ).toBe(false);
  });
});
