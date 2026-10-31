import {
  parseHistoryCorrectionInput,
  type ConfirmHistoryCorrectionInput,
} from "@/modules/recruitment/domain/history-corrections";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

export const historyIntentStorageKey = "jobs-crm.history-correction.pending";
export type HistoryIntentIds = {
  ownerId: string;
  caseId: string;
  eventId: string;
  requestId: string;
  command?: ConfirmHistoryCorrectionInput;
};
/** Preserve a frozen confirmed command in this tab, bound to its owner and case.
 * Legacy identifiers and corrupt commands remain read-only recovery, never retry.
 */
export function parseHistoryIntent(
  raw: string | null,
  ownerId: string,
  caseId: string,
): HistoryIntentIds | null {
  if (!raw) return null;
  try {
    const row: unknown = JSON.parse(raw);
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const value = row as Record<string, unknown>;
    if (
      (Object.keys(value).length !== 4 && Object.keys(value).length !== 5) ||
      Object.keys(value).some(
        (key) =>
          !["ownerId", "caseId", "eventId", "requestId", "command"].includes(
            key,
          ),
      ) ||
      value.ownerId !== ownerId ||
      value.caseId !== caseId ||
      typeof value.eventId !== "string" ||
      !uuidPattern.test(value.eventId) ||
      typeof value.requestId !== "string" ||
      !uuidPattern.test(value.requestId)
    )
      return null;
    const identifiers: HistoryIntentIds = {
      ownerId,
      caseId,
      eventId: value.eventId,
      requestId: value.requestId,
    };
    if (
      value.command &&
      typeof value.command === "object" &&
      !Array.isArray(value.command)
    ) {
      const command = value.command as Record<string, unknown>;
      const parsed = parseHistoryCorrectionInput(command, true);
      if (
        Object.keys(command).length === 9 &&
        parsed.success &&
        "requestId" in parsed.data &&
        parsed.data.caseId === caseId &&
        parsed.data.eventId === value.eventId &&
        parsed.data.requestId === value.requestId &&
        Object.entries(parsed.data).every(
          ([key, entry]) => command[key] === entry,
        )
      ) {
        identifiers.command = parsed.data;
      }
    }
    return identifiers;
  } catch {
    return null;
  }
}

import type {
  HistoryValues,
  HistoryPreview,
  HistoryRevision,
} from "@/modules/recruitment/domain/history-corrections";
export type { HistoryValues, HistoryPreview, HistoryRevision };

function validValues(value: unknown): value is HistoryValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    (row.occurredOn === null || typeof row.occurredOn === "string") &&
    [null, "inbound", "outbound"].includes(row.direction as null) &&
    (row.stageName === null || typeof row.stageName === "string") &&
    typeof row.voided === "boolean"
  );
}
export function isHistoryPreview(value: unknown): value is HistoryPreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(row.caseRevision) &&
    (row.caseRevision as number) >= 0 &&
    Number.isSafeInteger(row.eventRevision) &&
    (row.eventRevision as number) >= 0 &&
    validValues(row.before) &&
    validValues(row.after) &&
    ["Zapisane", "Kontakt rozpoczęty", "W rekrutacji", "Zakończone"].includes(
      row.status as string,
    ) &&
    (row.currentStage === null || typeof row.currentStage === "string") &&
    Array.isArray(row.blockedBy) &&
    row.blockedBy.every((id) => typeof id === "string" && uuidPattern.test(id))
  );
}
export function isHistoryRevision(value: unknown): value is HistoryRevision {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    ["id", "event_id", "case_id"].every(
      (key) =>
        typeof row[key] === "string" && uuidPattern.test(row[key] as string),
    ) &&
    ["correct", "void"].includes(row.operation as string) &&
    Number.isSafeInteger(row.expected_case_revision) &&
    (row.expected_case_revision as number) >= 0 &&
    Number.isSafeInteger(row.expected_event_revision) &&
    (row.expected_event_revision as number) >= 0 &&
    Number.isSafeInteger(row.revision) &&
    (row.revision as number) >= 1 &&
    typeof row.recorded_at === "string" &&
    Number.isFinite(Date.parse(row.recorded_at)) &&
    validValues(row.before) &&
    validValues(row.after) &&
    ["Zapisane", "Kontakt rozpoczęty", "W rekrutacji", "Zakończone"].includes(
      row.status as string,
    ) &&
    (row.current_stage === null || typeof row.current_stage === "string")
  );
}

/** A response/recovery belongs to this exact frozen intent, not just the entry. */
export function revisionMatchesIntent(
  revision: HistoryRevision,
  intent: ConfirmHistoryCorrectionInput,
): boolean {
  return (
    revision.case_id === intent.caseId &&
    revision.event_id === intent.eventId &&
    revision.operation === intent.operation &&
    revision.expected_case_revision === intent.expectedCaseRevision &&
    revision.expected_event_revision === intent.expectedEventRevision &&
    (intent.operation === "void"
      ? revision.after.voided
      : !revision.after.voided &&
        revision.after.occurredOn === intent.occurredOn &&
        revision.after.direction === intent.direction &&
        revision.after.stageName === intent.stageName)
  );
}

/** Compare before removing: an older response must never consume a newer intention. */
export function clearMatchingHistoryIntent(
  storage: Pick<Storage, "getItem" | "removeItem">,
  key: string,
  expected: HistoryIntentIds,
): boolean {
  const raw = storage.getItem(key);
  if (raw === null) return true;
  const current = parseHistoryIntent(raw, expected.ownerId, expected.caseId);
  if (
    !current ||
    current.eventId !== expected.eventId ||
    current.requestId !== expected.requestId
  )
    return false;
  storage.removeItem(key);
  return true;
}
