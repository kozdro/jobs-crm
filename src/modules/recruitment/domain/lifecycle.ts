import { isCalendarDate, warsawToday } from "./case-events";
import { uuidPattern } from "./recruitment-case";

export const closureOutcomes = [
  "Oferta przyjęta",
  "Oferta odrzucona przez użytkownika",
  "Odmowa firmy",
  "Rezygnacja użytkownika",
  "Brak odpowiedzi",
  "Anulowanie procesu",
  "Nie aplikowano",
  "Inny",
] as const;
export type ClosureOutcome = (typeof closureOutcomes)[number];
export type LifecycleStatus =
  "Zapisane" | "Kontakt rozpoczęty" | "W rekrutacji" | "Zakończone";
export type ClosureValues = {
  outcome: ClosureOutcome;
  occurredOn: string | null;
  offerConfirmed: boolean;
};
export type LifecycleInput = {
  operation: "close" | "reopen" | "correct-closure";
  caseId: string;
  closureId: string | null;
  outcome: ClosureOutcome | null;
  occurredOn: string | null;
  offerConfirmed: boolean;
};
export type ConfirmLifecycleInput = LifecycleInput & {
  requestId: string;
  expectedCaseRevision: number;
  expectedClosureRevision: number;
};
export type LifecyclePreview = {
  caseRevision: number;
  closureRevision: number;
  status: LifecycleStatus;
  currentStage: string | null;
  cycle: number;
  before: ClosureValues | null;
  after: ClosureValues | null;
};
export type LifecycleEntry = {
  id: string;
  request_id: string;
  expected_case_revision: number;
  case_id: string;
  kind: "close" | "reopen";
  cycle: number;
  occurred_on: string | null;
  recorded_at: string;
  outcome: ClosureOutcome | null;
  offer_confirmed: boolean;
  previous_status: LifecycleStatus;
  previous_stage: string | null;
  resulting_status: LifecycleStatus;
  resulting_stage: string | null;
  revision: number;
  original: ClosureValues | null;
};
export type ClosureRevision = {
  id: string;
  request_id: string;
  case_id: string;
  closure_id: string;
  revision: number;
  recorded_at: string;
  before: ClosureValues;
  after: ClosureValues;
  expected_case_revision: number;
  expected_closure_revision: number;
};
export function isOfferOutcome(outcome: unknown) {
  return outcome === closureOutcomes[0] || outcome === closureOutcomes[1];
}
export function parseLifecycleInput(
  value: unknown,
  confirm = false,
  now = new Date(),
):
  | { success: true; data: LifecycleInput | ConfirmLifecycleInput }
  | { success: false; errors: Record<string, string> } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { success: false, errors: { form: "Sprawdź dane operacji." } };
  const row = value as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const allowed = [
    "operation",
    "caseId",
    "closureId",
    "outcome",
    "occurredOn",
    "offerConfirmed",
    ...(confirm
      ? ["requestId", "expectedCaseRevision", "expectedClosureRevision"]
      : []),
  ];
  if (Object.keys(row).some((key) => !allowed.includes(key)))
    errors.form = "Formularz zawiera nieobsługiwane pola.";
  if (!["close", "reopen", "correct-closure"].includes(row.operation as string))
    errors.operation = "Wybierz operację.";
  if (typeof row.caseId !== "string" || !uuidPattern.test(row.caseId))
    errors.caseId = "Nieprawidłowy identyfikator sprawy.";
  const closureId = row.closureId ?? null;
  const outcome = row.outcome ?? null;
  const occurredOn = row.occurredOn ?? null;
  const offerConfirmed = row.offerConfirmed ?? false;
  if (
    row.operation === "correct-closure"
      ? typeof closureId !== "string" || !uuidPattern.test(closureId)
      : closureId !== null
  )
    errors.closureId = "Nieprawidłowe zakończenie.";
  if (
    row.operation === "reopen"
      ? outcome !== null || offerConfirmed !== false
      : !closureOutcomes.includes(outcome as ClosureOutcome) ||
        offerConfirmed !== isOfferOutcome(outcome)
  )
    errors.outcome =
      "Wybierz wynik. Wynik dotyczący oferty wymaga potwierdzenia rzeczywistej oferty.";
  if (typeof offerConfirmed !== "boolean")
    errors.offerConfirmed = "Potwierdź dane oferty.";
  if (
    occurredOn !== null &&
    (typeof occurredOn !== "string" ||
      !isCalendarDate(occurredOn) ||
      occurredOn > warsawToday(now))
  )
    errors.occurredOn =
      "Podaj prawidłowy nieprzyszły dzień albo pozostaw datę nieznaną.";
  if (confirm) {
    if (typeof row.requestId !== "string" || !uuidPattern.test(row.requestId))
      errors.requestId = "Nieprawidłowy identyfikator zapisu.";
    for (const key of ["expectedCaseRevision", "expectedClosureRevision"])
      if (
        typeof row[key] !== "number" ||
        !Number.isSafeInteger(row[key]) ||
        (row[key] as number) < 0 ||
        (row[key] as number) >= 2147483647
      )
        errors[key] = "Odśwież podgląd operacji.";
    if (
      row.operation !== "correct-closure" &&
      row.expectedClosureRevision !== 0
    )
      errors.expectedClosureRevision = "Odśwież podgląd operacji.";
  }
  if (Object.keys(errors).length) return { success: false, errors };
  const data: LifecycleInput = {
    operation: row.operation as LifecycleInput["operation"],
    caseId: row.caseId as string,
    closureId: closureId as string | null,
    outcome: outcome as ClosureOutcome | null,
    occurredOn: occurredOn as string | null,
    offerConfirmed: offerConfirmed as boolean,
  };
  return {
    success: true,
    data: confirm
      ? {
          ...data,
          requestId: row.requestId as string,
          expectedCaseRevision: row.expectedCaseRevision as number,
          expectedClosureRevision: row.expectedClosureRevision as number,
        }
      : data,
  };
}
