import type { ReminderCommand } from "@/modules/recruitment/domain/reminders";

export type Reminder = {
  id: string;
  taskId: string;
  taskTitle: string;
  date: string;
  time: string;
  timeZone: string;
  offset: number;
  instant: string;
  state: string;
};
export type Suggestion = {
  caseId: string;
  caseTitle: string;
  eventId: string;
  eventRevision: number;
  occurredOn: string;
  dueOn: string;
};
export type ReminderData = {
  reminders: Reminder[];
  rule: null | { intervalDays: number; timeZone: string };
  suggestions: Suggestion[];
};
export type Command = ReminderCommand;

export class ReminderError extends Error {
  constructor(
    public kind: string,
    public uncertain = false,
  ) {
    super(kind);
  }
}
export function isReminderData(value: unknown): value is ReminderData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  const obj = (v: unknown): v is Record<string, unknown> =>
    Boolean(v && typeof v === "object" && !Array.isArray(v));
  return (
    Array.isArray(r.reminders) &&
    r.reminders.every(
      (v: unknown) =>
        obj(v) &&
        [
          v.id,
          v.taskId,
          v.taskTitle,
          v.date,
          v.time,
          v.timeZone,
          v.instant,
          v.state,
        ].every((x) => typeof x === "string") &&
        Number.isInteger(v.offset) &&
        ["scheduled", "due"].includes(v.state as string) &&
        Number.isFinite(Date.parse(v.instant as string)),
    ) &&
    (r.rule === null ||
      (obj(r.rule) &&
        Number.isSafeInteger(r.rule.intervalDays) &&
        (r.rule.intervalDays as number) > 0 &&
        typeof r.rule.timeZone === "string")) &&
    Array.isArray(r.suggestions) &&
    r.suggestions.every(
      (v: unknown) =>
        obj(v) &&
        [v.caseId, v.caseTitle, v.eventId, v.occurredOn, v.dueOn].every(
          (x) => typeof x === "string",
        ) &&
        Number.isSafeInteger(v.eventRevision),
    )
  );
}
export async function reminderRequest(
  userId: string,
  command?: Command,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(
      command
        ? "/reminders/commands"
        : `/reminders/commands?${new URLSearchParams({ expectedUserId: userId })}`,
      {
        cache: "no-store",
        credentials: "same-origin",
        signal: AbortSignal.timeout(20000),
        ...(command
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...command, expectedUserId: userId }),
            }
          : {}),
      },
    );
  } catch {
    throw new ReminderError("unavailable", Boolean(command));
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403)
    throw new ReminderError("unauthenticated");
  if (!response.ok)
    throw new ReminderError(
      body &&
        typeof body === "object" &&
        "kind" in body &&
        typeof body.kind === "string"
        ? body.kind
        : "unavailable",
      Boolean(command && response.status >= 500),
    );
  if (!body || typeof body !== "object")
    throw new ReminderError("unavailable", Boolean(command));
  if (
    command &&
    (!("kind" in body) || (body.kind !== "created" && body.kind !== "replayed"))
  )
    throw new ReminderError("unavailable", true);
  return body;
}
