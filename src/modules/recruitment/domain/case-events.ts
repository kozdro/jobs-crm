import { uuidPattern } from "./recruitment-case";

export type RecordCaseEventInput = {
  requestId: string;
  caseId: string;
  kind: "application" | "contact";
  direction: "inbound" | "outbound" | null;
  occurredOn: string | null;
};
export type CaseEvent = {
  id: string;
  case_id: string;
  kind: RecordCaseEventInput["kind"];
  direction: RecordCaseEventInput["direction"];
  occurred_on: string | null;
  recorded_at: string;
};
export type CaseEventInputErrors = Partial<
  Record<keyof RecordCaseEventInput | "form", string>
>;

/** Calendar day only: never parse an unknown time as midnight. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return (
    day <=
    [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  );
}
export function warsawToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function parseRecordCaseEventInput(
  value: unknown,
  now: Date = new Date(),
):
  | { success: true; data: RecordCaseEventInput }
  | { success: false; errors: CaseEventInputErrors } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { success: false, errors: { form: "Sprawdź dane zdarzenia." } };
  const input = value as Record<string, unknown>;
  const errors: CaseEventInputErrors = {};
  if (
    Object.keys(input).some(
      (key) =>
        !["requestId", "caseId", "kind", "direction", "occurredOn"].includes(
          key,
        ),
    )
  )
    errors.form = "Formularz zawiera nieobsługiwane pola.";
  if (typeof input.requestId !== "string" || !uuidPattern.test(input.requestId))
    errors.requestId = "Nieprawidłowy identyfikator zapisu.";
  if (typeof input.caseId !== "string" || !uuidPattern.test(input.caseId))
    errors.caseId = "Nieprawidłowy identyfikator sprawy.";
  if (input.kind !== "application" && input.kind !== "contact")
    errors.kind = "Wybierz faktycznie wykonane działanie.";
  const direction = input.direction ?? null;
  if (
    (input.kind === "application" && direction !== null) ||
    (input.kind === "contact" &&
      direction !== "inbound" &&
      direction !== "outbound")
  )
    errors.direction = "Wybierz kierunek kontaktu.";
  const occurredOn = input.occurredOn ?? null;
  if (
    occurredOn !== null &&
    (typeof occurredOn !== "string" ||
      !isCalendarDate(occurredOn) ||
      occurredOn > warsawToday(now))
  )
    errors.occurredOn =
      "Podaj poprawną datę zdarzenia, nie późniejszą niż dzisiaj, albo pozostaw datę nieznaną.";
  if (Object.keys(errors).length) return { success: false, errors };
  return {
    success: true,
    data: {
      requestId: input.requestId as string,
      caseId: input.caseId as string,
      kind: input.kind as RecordCaseEventInput["kind"],
      direction: direction as RecordCaseEventInput["direction"],
      occurredOn: occurredOn as string | null,
    },
  };
}
