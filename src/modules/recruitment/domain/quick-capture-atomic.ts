import {
  parseCreateCaseInput,
  storableText,
  unicodeLength,
  uuidPattern,
  type CaseInputErrors,
  type RecruitmentCase,
} from "./recruitment-case";
import { isCalendarDate, warsawToday, type CaseEvent } from "./case-events";

export type QuickCaptureAction =
  | { kind: "save_only" }
  | {
      kind: "application" | "contact_inbound" | "contact_outbound";
      occurredOn: string | null;
      factConfirmed: true;
    };

export type QuickCaptureAtomicIntent = {
  title: string;
  description: string | null;
  sourceUrl: string | null;
  action: QuickCaptureAction;
};

export type QuickCaptureDuplicateAcknowledgement = {
  intentFingerprint: string;
  matchSetFingerprint: string;
  createSeparateCase: true;
};

export type QuickCaptureAtomicInput = {
  contractVersion: 1;
  requestId: string;
  intent: QuickCaptureAtomicIntent;
  duplicateAcknowledgement?: QuickCaptureDuplicateAcknowledgement;
};

export type QuickCaptureAtomicReceipt = {
  requestId: string;
  contractVersion: 1;
  intent: QuickCaptureAtomicIntent;
  intentFingerprint: string;
  case: RecruitmentCase;
  event: CaseEvent | null;
  recordedAt: string;
};

export type QuickCaptureAtomicResult =
  | { kind: "created" | "replayed"; receipt: QuickCaptureAtomicReceipt }
  | {
      kind: "duplicates";
      matches: RecruitmentCase[];
      hasMore: boolean;
      intentFingerprint: string;
      matchSetFingerprint: string;
    };

export type QuickCaptureAtomicErrors = Partial<
  Record<
    | keyof CaseInputErrors
    | "contractVersion"
    | "action"
    | "occurredOn"
    | "factConfirmed"
    | "duplicateAcknowledgement",
    string
  >
>;

/** Strict v1 command parser. Situation is deliberately absent from this DTO. */
export function parseQuickCaptureAtomicInput(
  value: unknown,
  now: Date = new Date(),
):
  | { success: true; data: QuickCaptureAtomicInput }
  | { success: false; errors: QuickCaptureAtomicErrors } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { success: false, errors: { form: "Sprawdź dane formularza." } };
  const raw = value as Record<string, unknown>;
  const errors: QuickCaptureAtomicErrors = {};
  if (
    Object.keys(raw).some(
      (key) =>
        ![
          "contractVersion",
          "requestId",
          "intent",
          "duplicateAcknowledgement",
        ].includes(key),
    )
  )
    errors.form = "Formularz zawiera nieobsługiwane pola.";
  if (raw.contractVersion !== 1)
    errors.contractVersion = "Nieobsługiwana wersja zapisu.";
  if (typeof raw.requestId !== "string" || !uuidPattern.test(raw.requestId))
    errors.requestId = "Nieprawidłowy identyfikator zapisu.";

  const intent = parseQuickCaptureIntent(raw.intent, now);
  if (!intent.success) Object.assign(errors, intent.errors);

  let duplicateAcknowledgement:
    QuickCaptureDuplicateAcknowledgement | undefined;
  if (raw.duplicateAcknowledgement !== undefined) {
    const acknowledgement = raw.duplicateAcknowledgement;
    if (
      !acknowledgement ||
      typeof acknowledgement !== "object" ||
      Array.isArray(acknowledgement)
    ) {
      errors.duplicateAcknowledgement = "Potwierdź decyzję o duplikacie.";
    } else {
      const value = acknowledgement as Record<string, unknown>;
      if (
        Object.keys(value).some(
          (key) =>
            ![
              "intentFingerprint",
              "matchSetFingerprint",
              "createSeparateCase",
            ].includes(key),
        ) ||
        value.createSeparateCase !== true ||
        typeof value.intentFingerprint !== "string" ||
        !/^[0-9a-f]{32}$/.test(value.intentFingerprint) ||
        typeof value.matchSetFingerprint !== "string" ||
        !/^[0-9a-f]{32}$/.test(value.matchSetFingerprint)
      ) {
        errors.duplicateAcknowledgement =
          "Potwierdź aktualny zamiar i dopasowania.";
      } else {
        duplicateAcknowledgement = {
          intentFingerprint: value.intentFingerprint,
          matchSetFingerprint: value.matchSetFingerprint,
          createSeparateCase: true,
        };
      }
    }
  }

  if (Object.keys(errors).length || !intent.success)
    return { success: false, errors };
  return {
    success: true,
    data: {
      contractVersion: 1,
      requestId: raw.requestId as string,
      intent: intent.data,
      ...(duplicateAcknowledgement ? { duplicateAcknowledgement } : {}),
    },
  };
}

function parseQuickCaptureIntent(
  value: unknown,
  now: Date,
):
  | { success: true; data: QuickCaptureAtomicIntent }
  | { success: false; errors: QuickCaptureAtomicErrors } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { success: false, errors: { form: "Sprawdź dane formularza." } };
  const raw = value as Record<string, unknown>;
  const errors: QuickCaptureAtomicErrors = {};
  if (
    Object.keys(raw).some(
      (key) => !["title", "description", "sourceUrl", "action"].includes(key),
    )
  )
    errors.form = "Formularz zawiera nieobsługiwane pola.";
  const parsedCase = parseCreateCaseInput({
    requestId: "00000000-0000-4000-8000-000000000001",
    title: raw.title,
    description: raw.description,
    sourceUrl: raw.sourceUrl,
    allowDuplicate: false,
  });
  if (!parsedCase.success) Object.assign(errors, parsedCase.errors);

  let action: QuickCaptureAction | null = null;
  if (
    !raw.action ||
    typeof raw.action !== "object" ||
    Array.isArray(raw.action)
  ) {
    errors.action = "Wybierz zapis sprawy lub potwierdzone działanie.";
  } else {
    const item = raw.action as Record<string, unknown>;
    if (item.kind === "save_only") {
      if (Object.keys(item).some((key) => key !== "kind"))
        errors.action = "Zapis sprawy nie może zawierać danych działania.";
      else action = { kind: "save_only" };
    } else if (
      item.kind === "application" ||
      item.kind === "contact_inbound" ||
      item.kind === "contact_outbound"
    ) {
      if (
        Object.keys(item).some(
          (key) => !["kind", "occurredOn", "factConfirmed"].includes(key),
        )
      )
        errors.action = "Działanie zawiera nieobsługiwane pola.";
      if (item.factConfirmed !== true)
        errors.factConfirmed = "Potwierdź, że działanie miało miejsce.";
      const occurredOn = item.occurredOn;
      if (
        occurredOn !== null &&
        (typeof occurredOn !== "string" ||
          !isCalendarDate(occurredOn) ||
          occurredOn > warsawToday(now))
      )
        errors.occurredOn =
          "Podaj prawidłowy dzień, nie późniejszy niż dzisiaj, albo pozostaw datę nieznaną.";
      if (
        occurredOn === null ||
        (typeof occurredOn === "string" &&
          isCalendarDate(occurredOn) &&
          occurredOn <= warsawToday(now))
      )
        action = {
          kind: item.kind,
          occurredOn: occurredOn as string | null,
          factConfirmed: true,
        };
    } else {
      errors.action = "Wybierz zapis sprawy lub potwierdzone działanie.";
    }
  }

  if (Object.keys(errors).length || !parsedCase.success || !action)
    return { success: false, errors };
  const title = parsedCase.data.title;
  const description = parsedCase.data.description;
  const sourceUrl = parsedCase.data.sourceUrl;
  if (
    !storableText(title) ||
    (description !== null && !storableText(description)) ||
    unicodeLength(title) > 160
  )
    return { success: false, errors: { form: "Sprawdź dane formularza." } };
  return {
    success: true,
    data: { title, description, sourceUrl, action },
  };
}
