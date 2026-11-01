import type { Task, TaskInput } from "@/modules/recruitment/domain/tasks";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { isCalendarDate } from "@/modules/recruitment/domain/case-events";

export type TaskCommand = TaskInput & { requestId: string };
export class TaskClientError extends Error {
  constructor(
    public readonly kind: string,
    public readonly uncertain = false,
  ) {
    super("Nie potwierdzono operacji na zadaniu.");
  }
}
export function isTask(value: unknown): value is Task {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    uuidPattern.test(row.id) &&
    typeof row.title === "string" &&
    Boolean(row.title.trim()) &&
    (row.description === null || typeof row.description === "string") &&
    (row.due_on === null ||
      (typeof row.due_on === "string" && isCalendarDate(row.due_on))) &&
    ["Do zrobienia", "Wykonane", "Anulowane"].includes(row.status as string) &&
    (row.case_id === null ||
      (typeof row.case_id === "string" && uuidPattern.test(row.case_id))) &&
    (row.case_title === null || typeof row.case_title === "string") &&
    Number.isSafeInteger(row.revision) &&
    (row.revision as number) >= 0 &&
    typeof row.created_at === "string" &&
    Number.isFinite(Date.parse(row.created_at)) &&
    typeof row.updated_at === "string" &&
    Number.isFinite(Date.parse(row.updated_at))
  );
}
export function taskResultMatches(
  task: unknown,
  command: TaskCommand,
): task is Task {
  if (!isTask(task)) return false;
  if (
    command.operation !== "create" &&
    (task.id !== command.taskId ||
      task.revision !== command.expectedRevision + 1)
  )
    return false;
  if (command.operation === "set-status") return task.status === command.status;
  return (
    task.title === command.title.trim() &&
    task.description === command.description &&
    task.due_on === command.dueOn &&
    task.case_id === command.caseId &&
    (command.operation !== "create" || task.status === "Do zrobienia")
  );
}
/** A confirmed receipt creates a revision barrier before another write. A
 * delayed list read for an older revision (or another task) cannot lift it. */
export function taskReadAcknowledges(task: Task, receipt: Task): boolean {
  return task.id === receipt.id && task.revision >= receipt.revision;
}
export async function taskRequest(
  userId: string,
  query: Record<string, string | number | boolean> | TaskCommand,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const write = "operation" in query;
  const params = new URLSearchParams({ expectedUserId: userId });
  if (!write)
    for (const [key, value] of Object.entries(query))
      params.set(key, String(value));
  const response = await fetch(
    write ? "/tasks/commands" : `/tasks/commands?${params}`,
    {
      cache: "no-store",
      credentials: "same-origin",
      signal: signal ?? AbortSignal.timeout(20000),
      ...(write
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...query, expectedUserId: userId }),
          }
        : {}),
    },
  );
  const value: unknown = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403)
    throw new TaskClientError("unauthenticated");
  const body =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!response.ok)
    throw new TaskClientError(
      typeof body?.kind === "string" ? body.kind : "unavailable",
      write && response.status >= 500,
    );
  if (!body) throw new TaskClientError("unavailable", write);
  return body;
}
export function formatTaskDay(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}.${month}.${year}`;
}
