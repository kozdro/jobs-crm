import { isCalendarDate } from "./case-events";
import { storableText, unicodeLength, uuidPattern } from "./recruitment-case";
import {
  isIanaTimeZone,
  scheduleInstant,
  validateSchedule,
  type CalendarSchedule,
} from "./calendar-time";

export type CalendarStatus =
  "planned" | "occurred" | "not_occurred" | "cancelled";
export type CalendarParticipant = {
  contactId: string;
  attendance: "unknown" | "attended" | "absent";
};
export type CalendarActual = {
  date: string;
  time: string | null;
  offset: number | null;
  timeZone: string;
} | null;
export type CalendarValues = {
  title: string;
  description: string | null;
  caseId: string | null;
  status: CalendarStatus;
  schedule: CalendarSchedule | null;
  timeZone: string;
  actual: CalendarActual;
  participants: CalendarParticipant[];
};
export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  case_id: string | null;
  case_title: string | null;
  status: CalendarStatus;
  schedule: CalendarSchedule | null;
  timeZone: string;
  actual: CalendarActual;
  participants: CalendarParticipant[];
  revision: number;
  created_at: string;
  updated_at: string;
};
export type CalendarCommandInput = {
  requestId: string;
  operation: "create" | "edit" | "resolve";
  eventId?: string;
  expectedRevision?: number;
  zoneChangeMode?: "keep-local" | "keep-instant";
  values: CalendarValues;
};
export type CalendarResolution = {
  eventId: string;
  action: "cancel" | "keep" | "detach";
};
export type CalendarAudit = {
  id: string;
  request_id: string;
  event_id: string;
  operation: string;
  before: CalendarEvent | null;
  after: CalendarEvent;
  recorded_at: string;
  closure_id: string | null;
};

const statuses: CalendarStatus[] = [
  "planned",
  "occurred",
  "not_occurred",
  "cancelled",
];
const attendance = ["unknown", "attended", "absent"];
const keys = (r: Record<string, unknown>, expected: string[]) =>
  Object.keys(r).every((k) => expected.includes(k)) &&
  expected.every((k) => k in r);
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const uuid = (v: unknown): v is string =>
  typeof v === "string" && uuidPattern.test(v);

/** Validate the full intended value, leaving unknown dates and times genuinely unknown. */
export function parseCalendarCommand(
  value: unknown,
  now = new Date(),
):
  | { success: true; data: CalendarCommandInput }
  | { success: false; errors: Record<string, string> } {
  const bad = (field: string, reason = "Sprawdź dane wydarzenia.") => ({
    success: false as const,
    errors: { [field]: reason },
  });
  if (
    !object(value) ||
    !uuid(value.requestId) ||
    !["create", "edit", "resolve"].includes(value.operation as string) ||
    !object(value.values)
  )
    return bad("form");
  const op = value.operation as CalendarCommandInput["operation"];
  const outer =
    op === "create"
      ? ["requestId", "operation", "values"]
      : ["requestId", "operation", "eventId", "expectedRevision", "values"];
  if (op !== "create" && value.zoneChangeMode !== undefined)
    outer.push("zoneChangeMode");
  if (
    !keys(value, outer) ||
    (value.zoneChangeMode !== undefined &&
      !["keep-local", "keep-instant"].includes(value.zoneChangeMode as string))
  )
    return bad("form");
  if (
    op !== "create" &&
    (!uuid(value.eventId) ||
      !Number.isSafeInteger(value.expectedRevision) ||
      (value.expectedRevision as number) < 0 ||
      (value.expectedRevision as number) >= 2147483647)
  )
    return bad("revision", "Odśwież wydarzenie przed zapisem.");
  const v = value.values;
  if (
    !keys(v, [
      "title",
      "description",
      "caseId",
      "status",
      "schedule",
      "timeZone",
      "actual",
      "participants",
    ])
  )
    return bad("form");
  const title = typeof v.title === "string" ? v.title.trim() : "";
  if (!title || unicodeLength(title) > 160 || !storableText(title))
    return bad("title", "Podaj tytuł od 1 do 160 znaków.");
  if (
    v.description !== null &&
    (typeof v.description !== "string" ||
      unicodeLength(v.description) > 2000 ||
      !storableText(v.description))
  )
    return bad("description", "Opis może mieć do 2000 znaków.");
  if (v.caseId !== null && !uuid(v.caseId)) return bad("caseId");
  if (
    !statuses.includes(v.status as CalendarStatus) ||
    !isIanaTimeZone(v.timeZone)
  )
    return bad("timeZone");
  if (op === "create" && !["planned", "occurred"].includes(v.status as string))
    return bad("status");
  if (v.schedule !== null) {
    if (
      !object(v.schedule) ||
      !keys(v.schedule, [
        "startDate",
        "startTime",
        "endDate",
        "endTime",
        "allDay",
        "timeZone",
        "startOffset",
        "endOffset",
      ]) ||
      v.schedule.timeZone !== v.timeZone ||
      !validateSchedule(v.schedule as CalendarSchedule)
    )
      return bad(
        "schedule",
        "Sprawdź termin, strefę i wybór czasu przy zmianie czasu.",
      );
  } else if (v.status === "planned")
    return bad("schedule", "Podaj planowany termin.");
  if (v.actual !== null) {
    if (
      !object(v.actual) ||
      !keys(v.actual, ["date", "time", "offset", "timeZone"]) ||
      typeof v.actual.date !== "string" ||
      !isCalendarDate(v.actual.date) ||
      !isIanaTimeZone(v.actual.timeZone)
    )
      return bad("actual");
    if (v.actual.time === null) {
      if (v.actual.offset !== null) return bad("actual");
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: v.actual.timeZone as string,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      if (v.actual.date > today)
        return bad("actual", "Rzeczywisty termin nie może być przyszły.");
    } else {
      if (
        typeof v.actual.time !== "string" ||
        typeof v.actual.offset !== "number"
      )
        return bad("actual");
      const instant = scheduleInstant(
        v.actual.date,
        v.actual.time,
        v.actual.timeZone as string,
        v.actual.offset,
      );
      if (instant === null || instant > now.getTime())
        return bad(
          "actual",
          "Sprawdź rzeczywisty czas. Nie może być przyszły.",
        );
    }
  }
  if (v.status !== "occurred" && v.actual !== null) return bad("actual");
  if (!Array.isArray(v.participants)) return bad("participants");
  const participants: CalendarParticipant[] = [];
  for (const p of v.participants) {
    if (
      !object(p) ||
      !keys(p, ["contactId", "attendance"]) ||
      !uuid(p.contactId) ||
      !attendance.includes(p.attendance as string) ||
      (v.status !== "occurred" && p.attendance !== "unknown")
    )
      return bad("participants");
    participants.push({
      contactId: p.contactId.toLowerCase(),
      attendance: p.attendance as CalendarParticipant["attendance"],
    });
  }
  if (
    new Set(participants.map((p) => p.contactId)).size !== participants.length
  )
    return bad("participants");
  participants.sort((a, b) => a.contactId.localeCompare(b.contactId));
  const data: CalendarCommandInput = {
    requestId: (value.requestId as string).toLowerCase(),
    operation: op,
    values: {
      title,
      description: v.description as string | null,
      caseId: typeof v.caseId === "string" ? v.caseId.toLowerCase() : null,
      status: v.status as CalendarStatus,
      schedule: v.schedule as CalendarSchedule | null,
      timeZone: v.timeZone as string,
      actual: v.actual as CalendarActual,
      participants,
    },
  };
  if (value.zoneChangeMode !== undefined)
    data.zoneChangeMode = value.zoneChangeMode as "keep-local" | "keep-instant";
  if (op !== "create") {
    data.eventId = (value.eventId as string).toLowerCase();
    data.expectedRevision = value.expectedRevision as number;
  }
  return { success: true, data };
}
