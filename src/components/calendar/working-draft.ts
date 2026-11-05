import type {
  CalendarValues,
  CalendarCommandInput,
} from "@/modules/recruitment/domain/calendar";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

export type WorkingDraft = {
  ownerId: string;
  eventId: string | null;
  mode: "create" | "occurred" | "edit" | "resolve";
  values: CalendarValues;
  zoneDraft: string;
  zoneMode: "wall" | "instant" | "";
  zoneChangeMode?: CalendarCommandInput["zoneChangeMode"];
};
export const workPrefix = (ownerId: string) =>
  `jobs-crm.calendar.working.${ownerId}.`;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const nullableString = (v: unknown) => v === null || typeof v === "string";
const nullableNumber = (v: unknown) =>
  v === null || (typeof v === "number" && Number.isFinite(v));
/** Drafts may be incomplete, but malformed storage is never rendered or sent. */
export function readWorkingDraft(
  raw: string,
  ownerId: string,
): WorkingDraft | null {
  try {
    if (raw.length > 100_000) return null;
    const d: unknown = JSON.parse(raw);
    if (
      !object(d) ||
      d.ownerId !== ownerId ||
      !(
        d.eventId === null ||
        (typeof d.eventId === "string" && uuidPattern.test(d.eventId))
      ) ||
      !["create", "occurred", "edit", "resolve"].includes(String(d.mode)) ||
      !object(d.values) ||
      typeof d.zoneDraft !== "string" ||
      !["", "wall", "instant"].includes(String(d.zoneMode))
    )
      return null;
    if ((d.mode === "create" || d.mode === "occurred") !== (d.eventId === null))
      return null;
    if (
      d.zoneChangeMode !== undefined &&
      !["keep-local", "keep-instant"].includes(String(d.zoneChangeMode))
    )
      return null;
    const v = d.values;
    if (
      typeof v.title !== "string" ||
      !nullableString(v.description) ||
      !nullableString(v.caseId) ||
      typeof v.timeZone !== "string" ||
      !["planned", "occurred", "not_occurred", "cancelled"].includes(
        String(v.status),
      ) ||
      !Array.isArray(v.participants)
    )
      return null;
    if (v.caseId !== null && !uuidPattern.test(v.caseId as string)) return null;
    if (
      !v.participants.every(
        (p) =>
          object(p) &&
          typeof p.contactId === "string" &&
          uuidPattern.test(p.contactId) &&
          ["unknown", "attended", "absent"].includes(String(p.attendance)),
      )
    )
      return null;
    if (
      v.actual !== null &&
      (!object(v.actual) ||
        typeof v.actual.date !== "string" ||
        !nullableString(v.actual.time) ||
        !nullableNumber(v.actual.offset) ||
        typeof v.actual.timeZone !== "string")
    )
      return null;
    if (
      v.schedule !== null &&
      (!object(v.schedule) ||
        typeof v.schedule.startDate !== "string" ||
        !nullableString(v.schedule.startTime) ||
        !nullableString(v.schedule.endDate) ||
        !nullableString(v.schedule.endTime) ||
        typeof v.schedule.allDay !== "boolean" ||
        typeof v.schedule.timeZone !== "string" ||
        !nullableNumber(v.schedule.startOffset) ||
        !nullableNumber(v.schedule.endOffset))
    )
      return null;
    return d as WorkingDraft;
  } catch {
    return null;
  }
}
