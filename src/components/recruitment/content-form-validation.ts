import {
  isCalendarDate,
  warsawToday,
} from "@/modules/recruitment/domain/case-events";
import { parseCreateCaseInput } from "@/modules/recruitment/domain/recruitment-case";
export function noteFormErrors(
  body: string,
  dateChoice: string,
  occurredOn: string,
  now = new Date(),
) {
  const count = Array.from(body.trim()).length;
  const errors: { body?: string; date?: string } = {};
  if (count < 1 || count > 10000 || !body.isWellFormed() || body.includes("\0"))
    errors.body = "Wpisz treść od 1 do 10 000 poprawnych znaków.";
  if (
    dateChoice === "known" &&
    (!isCalendarDate(occurredOn) || occurredOn > warsawToday(now))
  )
    errors.date = "Podaj poprawną datę, która nie jest przyszła.";
  return errors;
}
export function linkFormError(url: string): string | null {
  return canonicalCaseLink(url) === null
    ? "Podaj poprawny adres HTTP lub HTTPS."
    : null;
}
/** The same validation and URL.href normalization as Quick Capture. */
export function canonicalCaseLink(url: string): string | null {
  const parsed = parseCreateCaseInput({
    requestId: "00000000-0000-4000-8000-000000000001",
    title: "link",
    sourceUrl: url,
    description: null,
    allowDuplicate: false,
  });
  return parsed.success ? parsed.data.sourceUrl : null;
}
export function noteTimelineDay(note: {
  date_kind: "ordinary" | "historical";
  created_at: string;
  occurred_on: string | null;
}) {
  return note.date_kind === "ordinary"
    ? warsawToday(new Date(note.created_at))
    : note.occurred_on;
}
