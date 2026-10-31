import { isCalendarDate, warsawToday } from "./case-events";
import { storableText, unicodeLength, uuidPattern } from "./recruitment-case";

export type HistoryValues = {
  occurredOn: string | null;
  direction: "inbound" | "outbound" | null;
  stageName: string | null;
  voided: boolean;
};
export type HistoryPreview = {
  caseRevision: number;
  eventRevision: number;
  before: HistoryValues;
  after: HistoryValues;
  status: "Zapisane" | "Kontakt rozpoczęty" | "W rekrutacji" | "Zakończone";
  currentStage: string | null;
  blockedBy: string[];
};
export type HistoryRevision = {
  id: string;
  event_id: string;
  case_id: string;
  operation: "correct" | "void";
  revision: number;
  recorded_at: string;
  before: HistoryValues;
  after: HistoryValues;
  status: HistoryPreview["status"];
  current_stage: string | null;
  expected_case_revision: number;
  expected_event_revision: number;
};
export type HistoryCorrectionInput = {
  caseId: string;
  eventId: string;
  operation: "correct" | "void";
  occurredOn: string | null;
  direction: "inbound" | "outbound" | null;
  stageName: string | null;
};
export type ConfirmHistoryCorrectionInput = HistoryCorrectionInput & {
  requestId: string;
  expectedCaseRevision: number;
  expectedEventRevision: number;
};
export function parseHistoryCorrectionInput(
  value: unknown,
  confirm = false,
  now = new Date(),
):
  | {
      success: true;
      data: HistoryCorrectionInput | ConfirmHistoryCorrectionInput;
    }
  | { success: false; errors: Record<string, string> } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { success: false, errors: { form: "Sprawdź dane korekty." } };
  const row = value as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const allowed = [
    "caseId",
    "eventId",
    "operation",
    "occurredOn",
    "direction",
    "stageName",
    ...(confirm
      ? ["requestId", "expectedCaseRevision", "expectedEventRevision"]
      : []),
  ];
  if (Object.keys(row).some((key) => !allowed.includes(key)))
    errors.form = "Formularz zawiera nieobsługiwane pola.";
  for (const key of ["caseId", "eventId", ...(confirm ? ["requestId"] : [])])
    if (typeof row[key] !== "string" || !uuidPattern.test(row[key] as string))
      errors[key] = "Nieprawidłowy identyfikator.";
  if (row.operation !== "correct" && row.operation !== "void")
    errors.operation = "Wybierz korektę lub unieważnienie.";
  const occurredOn = row.occurredOn ?? null;
  const direction = row.direction ?? null;
  const stageName =
    typeof row.stageName === "string"
      ? row.stageName.trim()
      : (row.stageName ?? null);
  if (
    occurredOn !== null &&
    (typeof occurredOn !== "string" ||
      !isCalendarDate(occurredOn) ||
      occurredOn > warsawToday(now))
  )
    errors.occurredOn =
      "Podaj prawidłowy nieprzyszły dzień lub pozostaw datę nieznaną.";
  if (direction !== null && direction !== "inbound" && direction !== "outbound")
    errors.direction = "Wybierz kierunek kontaktu.";
  if (
    stageName !== null &&
    (typeof stageName !== "string" ||
      !stageName ||
      unicodeLength(stageName) > 160 ||
      !storableText(stageName))
  )
    errors.stageName = "Podaj nazwę etapu od 1 do 160 znaków.";
  if (
    row.operation === "void" &&
    (occurredOn !== null || direction !== null || stageName !== null)
  )
    errors.form = "Unieważnienie nie zmienia pól wpisu.";
  if (confirm)
    for (const key of ["expectedCaseRevision", "expectedEventRevision"])
      if (
        typeof row[key] !== "number" ||
        !Number.isSafeInteger(row[key]) ||
        (row[key] as number) < 0 ||
        (row[key] as number) >= 2_147_483_647
      )
        errors[key] = "Odśwież podgląd korekty.";
  if (Object.keys(errors).length) return { success: false, errors };
  const data: HistoryCorrectionInput = {
    caseId: row.caseId as string,
    eventId: row.eventId as string,
    operation: row.operation as HistoryCorrectionInput["operation"],
    occurredOn: occurredOn as string | null,
    direction: direction as HistoryCorrectionInput["direction"],
    stageName: stageName as string | null,
  };
  return {
    success: true,
    data: confirm
      ? {
          ...data,
          requestId: row.requestId as string,
          expectedCaseRevision: row.expectedCaseRevision as number,
          expectedEventRevision: row.expectedEventRevision as number,
        }
      : data,
  };
}
