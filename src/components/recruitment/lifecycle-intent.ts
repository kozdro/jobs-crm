import {
  closureOutcomes,
  isOfferOutcome,
  parseLifecycleInput,
  type ClosureValues,
  type ClosureRevision,
  type ConfirmLifecycleInput,
  type LifecycleEntry,
  type LifecyclePreview,
} from "@/modules/recruitment/domain/lifecycle";
import { isCalendarDate } from "@/modules/recruitment/domain/case-events";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

export const lifecycleIntentStorageKey = "jobs-crm.lifecycle.pending";
export type LifecycleIntent = {
  ownerId: string;
  caseId: string;
  requestId: string;
  command?: ConfirmLifecycleInput;
};
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const revision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const status = (value: unknown) =>
  ["Zapisane", "Kontakt rozpoczęty", "W rekrutacji", "Zakończone"].includes(
    value as string,
  );
const day = (value: unknown) =>
  value === null || (typeof value === "string" && isCalendarDate(value));
const id = (value: unknown) =>
  typeof value === "string" && uuidPattern.test(value);
export function isClosureValues(value: unknown): value is ClosureValues {
  return (
    record(value) &&
    closureOutcomes.includes(value.outcome as ClosureValues["outcome"]) &&
    day(value.occurredOn) &&
    typeof value.offerConfirmed === "boolean" &&
    value.offerConfirmed === isOfferOutcome(value.outcome)
  );
}
export function isLifecyclePreview(value: unknown): value is LifecyclePreview {
  return (
    record(value) &&
    revision(value.caseRevision) &&
    revision(value.closureRevision) &&
    status(value.status) &&
    (value.currentStage === null || typeof value.currentStage === "string") &&
    revision(value.cycle) &&
    (value.before === null || isClosureValues(value.before)) &&
    (value.after === null || isClosureValues(value.after))
  );
}
export function isLifecycleEntry(value: unknown): value is LifecycleEntry {
  return (
    record(value) &&
    id(value.id) &&
    id(value.case_id) &&
    id(value.request_id) &&
    revision(value.expected_case_revision) &&
    ["close", "reopen"].includes(value.kind as string) &&
    revision(value.cycle) &&
    day(value.occurred_on) &&
    typeof value.recorded_at === "string" &&
    Number.isFinite(Date.parse(value.recorded_at)) &&
    (value.outcome === null ||
      closureOutcomes.includes(value.outcome as ClosureValues["outcome"])) &&
    typeof value.offer_confirmed === "boolean" &&
    status(value.previous_status) &&
    status(value.resulting_status) &&
    (value.previous_stage === null ||
      typeof value.previous_stage === "string") &&
    (value.resulting_stage === null ||
      typeof value.resulting_stage === "string") &&
    revision(value.revision) &&
    (value.original === null || isClosureValues(value.original))
  );
}
export function isClosureRevision(value: unknown): value is ClosureRevision {
  return (
    record(value) &&
    ["id", "case_id", "closure_id", "request_id"].every((key) =>
      id(value[key]),
    ) &&
    revision(value.revision) &&
    value.revision > 0 &&
    revision(value.expected_case_revision) &&
    revision(value.expected_closure_revision) &&
    value.revision === value.expected_closure_revision + 1 &&
    typeof value.recorded_at === "string" &&
    Number.isFinite(Date.parse(value.recorded_at)) &&
    isClosureValues(value.before) &&
    isClosureValues(value.after)
  );
}
/** Owner/case identifiers survive malformed legacy payloads, but never permit altered retry. */
export function parseLifecycleIntent(
  raw: string | null,
  ownerId: string,
  caseId: string,
): LifecycleIntent | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !record(value) ||
      (Object.keys(value).length !== 3 && Object.keys(value).length !== 4) ||
      Object.keys(value).some(
        (key) => !["ownerId", "caseId", "requestId", "command"].includes(key),
      ) ||
      value.ownerId !== ownerId ||
      value.caseId !== caseId ||
      !id(value.requestId)
    )
      return null;
    const result: LifecycleIntent = {
      ownerId,
      caseId,
      requestId: value.requestId as string,
    };
    if (record(value.command)) {
      const parsed = parseLifecycleInput(value.command, true);
      if (
        parsed.success &&
        "requestId" in parsed.data &&
        Object.keys(value.command).length === 9 &&
        parsed.data.caseId === caseId &&
        parsed.data.requestId === result.requestId &&
        Object.entries(parsed.data).every(
          ([key, entry]) =>
            value.command &&
            (value.command as Record<string, unknown>)[key] === entry,
        )
      )
        result.command = parsed.data;
    }
    return result;
  } catch {
    return null;
  }
}
export function lifecycleResultMatches(
  result: { entry?: unknown; revision?: unknown },
  command: ConfirmLifecycleInput,
): boolean {
  if (command.operation === "correct-closure") {
    const value = result.revision;
    return (
      isClosureRevision(value) &&
      value.case_id === command.caseId &&
      value.closure_id === command.closureId &&
      value.request_id === command.requestId &&
      value.expected_case_revision === command.expectedCaseRevision &&
      value.expected_closure_revision === command.expectedClosureRevision &&
      value.after.outcome === command.outcome &&
      value.after.occurredOn === command.occurredOn &&
      value.after.offerConfirmed === command.offerConfirmed
    );
  }
  const value = result.entry;
  // Entries may have a newer correction; compare the immutable original close values.
  return (
    isLifecycleEntry(value) &&
    value.case_id === command.caseId &&
    value.request_id === command.requestId &&
    value.expected_case_revision === command.expectedCaseRevision &&
    value.kind === command.operation &&
    (command.operation === "reopen"
      ? value.occurred_on === command.occurredOn
      : value.original?.outcome === command.outcome &&
        value.original.occurredOn === command.occurredOn &&
        value.original.offerConfirmed === command.offerConfirmed)
  );
}
/** A delayed response must not consume a newer intention in the same tab. */
export function clearMatchingLifecycleIntent(
  storage: Pick<Storage, "getItem" | "removeItem">,
  key: string,
  expected: LifecycleIntent,
): boolean {
  const raw = storage.getItem(key);
  if (raw === null) return true;
  const current = parseLifecycleIntent(raw, expected.ownerId, expected.caseId);
  if (!current || current.requestId !== expected.requestId) return false;
  storage.removeItem(key);
  return true;
}

/** An uncertain write must survive form unmount/reload. Refuse the POST unless
 * the exact frozen intention is available in tab storage before sending it.
 * Never overwrite another pending request while trying to persist a retry.
 */
export function persistLifecycleIntent(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  expected: LifecycleIntent & { command: ConfirmLifecycleInput },
): "stored" | "conflict" | "unavailable" {
  const serialized = JSON.stringify(expected);
  try {
    const existing = storage.getItem(key);
    if (existing !== null && existing !== serialized) return "conflict";
    storage.setItem(key, serialized);
    return storage.getItem(key) === serialized ? "stored" : "unavailable";
  } catch {
    return "unavailable";
  }
}
