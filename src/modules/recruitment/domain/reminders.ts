import { isIanaTimeZone, scheduleInstant } from "./calendar-time";
import { uuidPattern } from "./recruitment-case";

export type ReminderCommand =
  | {
      operation: "set-reminder";
      requestId: string;
      taskId: string;
      expectedRevision: number;
      date: string;
      time: string;
      timeZone: string;
      offset: number;
    }
  | {
      operation: "acknowledge" | "disable";
      requestId: string;
      taskId: string;
      configurationId: string;
    }
  | {
      operation: "set-rule";
      requestId: string;
      intervalDays: number;
      timeZone: string;
    }
  | { operation: "disable-rule"; requestId: string }
  | {
      operation: "dismiss-suggestion";
      requestId: string;
      caseId: string;
      eventId: string;
      eventRevision: number;
    };

const uuid = (v: unknown): v is string =>
  typeof v === "string" && uuidPattern.test(v);
const revision = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) < 2147483647;
const exactKeys = (r: Record<string, unknown>, keys: string[]) =>
  Object.keys(r).length === keys.length &&
  keys.every((k) => Object.hasOwn(r, k));

/** Parse the complete user intent; never supply reminder or follow-up defaults. */
export function parseReminderCommand(value: unknown): ReminderCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (!uuid(r.requestId) || typeof r.operation !== "string") return null;
  if (r.operation === "set-reminder") {
    if (
      !exactKeys(r, [
        "operation",
        "requestId",
        "taskId",
        "expectedRevision",
        "date",
        "time",
        "timeZone",
        "offset",
      ]) ||
      !uuid(r.taskId) ||
      !revision(r.expectedRevision) ||
      typeof r.date !== "string" ||
      typeof r.time !== "string" ||
      !isIanaTimeZone(r.timeZone) ||
      typeof r.offset !== "number" ||
      scheduleInstant(r.date, r.time, r.timeZone, r.offset) === null
    )
      return null;
    return {
      operation: r.operation,
      requestId: r.requestId,
      taskId: r.taskId,
      expectedRevision: r.expectedRevision,
      date: r.date,
      time: r.time,
      timeZone: r.timeZone,
      offset: r.offset,
    };
  }
  if (r.operation === "acknowledge" || r.operation === "disable") {
    if (
      !exactKeys(r, ["operation", "requestId", "taskId", "configurationId"]) ||
      !uuid(r.taskId) ||
      !uuid(r.configurationId)
    )
      return null;
    return {
      operation: r.operation,
      requestId: r.requestId,
      taskId: r.taskId,
      configurationId: r.configurationId,
    };
  }
  if (r.operation === "set-rule") {
    if (
      !exactKeys(r, ["operation", "requestId", "intervalDays", "timeZone"]) ||
      !revision(r.intervalDays) ||
      r.intervalDays === 0 ||
      !isIanaTimeZone(r.timeZone)
    )
      return null;
    return {
      operation: r.operation,
      requestId: r.requestId,
      intervalDays: r.intervalDays,
      timeZone: r.timeZone,
    };
  }
  if (r.operation === "disable-rule") {
    if (!exactKeys(r, ["operation", "requestId"])) return null;
    return { operation: r.operation, requestId: r.requestId };
  }
  if (r.operation === "dismiss-suggestion") {
    if (
      !exactKeys(r, [
        "operation",
        "requestId",
        "caseId",
        "eventId",
        "eventRevision",
      ]) ||
      !uuid(r.caseId) ||
      !uuid(r.eventId) ||
      !revision(r.eventRevision)
    )
      return null;
    return {
      operation: r.operation,
      requestId: r.requestId,
      caseId: r.caseId,
      eventId: r.eventId,
      eventRevision: r.eventRevision,
    };
  }
  return null;
}
