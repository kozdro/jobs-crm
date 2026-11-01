import { isCalendarDate } from "./case-events";
import { storableText, unicodeLength, uuidPattern } from "./recruitment-case";

export const taskStatuses = ["Do zrobienia", "Wykonane", "Anulowane"] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export type Task = {
  id: string;
  title: string;
  description: string | null;
  due_on: string | null;
  status: TaskStatus;
  case_id: string | null;
  case_title: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type TaskValues = {
  title: string;
  description: string | null;
  dueOn: string | null;
  caseId: string | null;
};
export type TaskInput =
  | (TaskValues & { operation: "create" })
  | (TaskValues & {
      operation: "edit";
      taskId: string;
      expectedRevision: number;
    })
  | {
      operation: "set-status";
      taskId: string;
      expectedRevision: number;
      status: TaskStatus;
    };
export type TaskCommandInput = TaskInput & { requestId: string };
export type TaskResolution = {
  taskId: string;
  action: "cancel" | "keep" | "detach";
};
export type TaskAudit = {
  id: string;
  request_id: string;
  task_id: string;
  operation: string;
  before: Task | null;
  after: Task;
  recorded_at: string;
  closure_id: string | null;
};
export function parseTaskInput(
  value: unknown,
):
  | { success: true; data: TaskInput }
  | { success: false; errors: Record<string, string> } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { success: false, errors: { form: "Sprawdź dane zadania." } };
  const r = value as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const op = r.operation;
  if (!["create", "edit", "set-status"].includes(op as string))
    errors.operation = "Wybierz działanie.";
  const allowed =
    op === "set-status"
      ? ["operation", "taskId", "expectedRevision", "status"]
      : [
          "operation",
          "title",
          "description",
          "dueOn",
          "caseId",
          ...(op === "edit" ? ["taskId", "expectedRevision"] : []),
        ];
  if (Object.keys(r).some((k) => !allowed.includes(k)))
    errors.form = "Formularz zawiera nieobsługiwane pola.";
  if (op !== "create") {
    if (typeof r.taskId !== "string" || !uuidPattern.test(r.taskId))
      errors.taskId = "Nieprawidłowe zadanie.";
    if (
      typeof r.expectedRevision !== "number" ||
      !Number.isSafeInteger(r.expectedRevision) ||
      r.expectedRevision < 0 ||
      r.expectedRevision >= 2147483647
    )
      errors.expectedRevision = "Odśwież zadanie przed zapisem.";
  }
  let title = "";
  const description = r.description ?? null;
  const dueOn = r.dueOn ?? null;
  const caseId = r.caseId ?? null;
  if (op === "set-status") {
    if (!taskStatuses.includes(r.status as TaskStatus))
      errors.status = "Wybierz status zadania.";
  } else {
    title = typeof r.title === "string" ? r.title.trim() : "";
    if (!title || unicodeLength(title) > 160 || !storableText(title))
      errors.title = "Podaj tytuł od 1 do 160 znaków.";
    if (
      description !== null &&
      (typeof description !== "string" ||
        unicodeLength(description) > 2000 ||
        !storableText(description))
    )
      errors.description = "Opis może mieć do 2000 znaków.";
    if (dueOn !== null && (typeof dueOn !== "string" || !isCalendarDate(dueOn)))
      errors.dueOn = "Podaj prawidłowy dzień albo pozostaw termin pusty.";
    if (
      caseId !== null &&
      (typeof caseId !== "string" || !uuidPattern.test(caseId))
    )
      errors.caseId = "Wybierz własną sprawę albo zadanie ogólne.";
  }
  if (Object.keys(errors).length) return { success: false, errors };
  if (op === "set-status")
    return {
      success: true,
      data: {
        operation: op,
        taskId: (r.taskId as string).toLowerCase(),
        expectedRevision: r.expectedRevision as number,
        status: r.status as TaskStatus,
      },
    };
  const fields: TaskValues = {
    title,
    description: description as string | null,
    dueOn: dueOn as string | null,
    caseId: typeof caseId === "string" ? caseId.toLowerCase() : null,
  };
  return {
    success: true,
    data:
      op === "edit"
        ? {
            ...fields,
            operation: op,
            taskId: (r.taskId as string).toLowerCase(),
            expectedRevision: r.expectedRevision as number,
          }
        : { ...fields, operation: "create" },
  };
}
