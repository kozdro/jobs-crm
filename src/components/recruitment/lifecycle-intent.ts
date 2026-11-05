import {
  parseCalendarCommand,
  type CalendarEvent,
} from "@/modules/recruitment/domain/calendar";
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
import { isTask } from "@/components/tasks/client";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

export const lifecycleIntentStorageKey = "jobs-crm.lifecycle.pending";
export type LifecycleIntent = {
  ownerId: string;
  caseId: string;
  requestId: string;
  command?: ConfirmLifecycleInput;
  invalidCommand?: true;
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
function isTaskSnapshot(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (typeof item !== "string") return false;
      const parts = item.split(":");
      return (
        parts.length === 2 &&
        id(parts[0]) &&
        /^(0|[1-9][0-9]*)$/.test(parts[1]) &&
        revision(Number(parts[1])) &&
        Number(parts[1]) < 2147483647
      );
    }) &&
    new Set(value.map((item) => item.split(":")[0].toLowerCase())).size ===
      value.length
  );
}
function isTaskResolutions(
  value: unknown,
): value is NonNullable<ConfirmLifecycleInput["taskResolutions"]> {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        record(item) &&
        Object.keys(item).length === 2 &&
        id(item.taskId) &&
        ["cancel", "keep", "detach"].includes(item.action as string),
    ) &&
    new Set(value.map((item) => item.taskId.toLowerCase())).size ===
      value.length
  );
}
function isEventResolutions(
  value: unknown,
): value is NonNullable<ConfirmLifecycleInput["eventResolutions"]> {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        record(item) &&
        Object.keys(item).length === 2 &&
        id(item.eventId) &&
        ["cancel", "keep", "detach"].includes(item.action as string),
    ) &&
    new Set(value.map((item) => item.eventId.toLowerCase())).size ===
      value.length
  );
}
function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (
    !record(value) ||
    !id(value.id) ||
    !revision(value.revision) ||
    !["string"].includes(typeof value.created_at) ||
    !["string"].includes(typeof value.updated_at)
  )
    return false;
  return parseCalendarCommand({
    requestId: value.id,
    operation: "create",
    values: {
      title: value.title,
      description: value.description,
      caseId: value.case_id,
      status: value.status,
      schedule: value.schedule,
      timeZone: value.timeZone,
      actual: value.actual,
      participants: value.participants,
    },
  }).success;
}
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
    (value.after === null || isClosureValues(value.after)) &&
    (value.openTasks === undefined ||
      (Array.isArray(value.openTasks) && value.openTasks.every(isTask))) &&
    (value.openEvents === undefined ||
      (Array.isArray(value.openEvents) &&
        value.openEvents.every(isCalendarEvent))) &&
    (value.eventSnapshot === undefined ||
      isTaskSnapshot(value.eventSnapshot)) &&
    (value.openEvents === undefined ||
      (Array.isArray(value.eventSnapshot) &&
        value.openEvents.length === value.eventSnapshot.length &&
        value.openEvents.every(
          (item: CalendarEvent) =>
            value.eventSnapshot instanceof Array &&
            value.eventSnapshot.includes(`${item.id}:${item.revision}`),
        ))) &&
    (value.taskSnapshot === undefined ||
      (Array.isArray(value.taskSnapshot) &&
        value.taskSnapshot.every(
          (item) =>
            typeof item === "string" && /^[0-9a-f-]{36}:[0-9]+$/i.test(item),
        )))
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
    (value.original === null || isClosureValues(value.original)) &&
    (value.expected_task_snapshot === undefined ||
      isTaskSnapshot(value.expected_task_snapshot)) &&
    (value.task_resolutions === undefined ||
      isTaskResolutions(value.task_resolutions)) &&
    (value.expected_event_snapshot === undefined ||
      isTaskSnapshot(value.expected_event_snapshot)) &&
    (value.event_resolutions === undefined ||
      isEventResolutions(value.event_resolutions))
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
    if (Object.prototype.hasOwnProperty.call(value, "command"))
      result.invalidCommand = true;
    if (record(value.command)) {
      const parsed = parseLifecycleInput(value.command, true);
      if (
        parsed.success &&
        "requestId" in parsed.data &&
        (value.command.expectedTaskSnapshot === undefined ||
          isTaskSnapshot(value.command.expectedTaskSnapshot)) &&
        (value.command.taskResolutions === undefined ||
          isTaskResolutions(value.command.taskResolutions)) &&
        (value.command.expectedEventSnapshot === undefined ||
          isTaskSnapshot(value.command.expectedEventSnapshot)) &&
        (value.command.eventResolutions === undefined ||
          isEventResolutions(value.command.eventResolutions)) &&
        parsed.data.caseId === caseId &&
        parsed.data.requestId === result.requestId &&
        Object.entries(parsed.data).every(
          ([key, entry]) =>
            value.command &&
            JSON.stringify((value.command as Record<string, unknown>)[key]) ===
              JSON.stringify(entry),
        )
      ) {
        result.command = parsed.data;
        delete result.invalidCommand;
      }
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
  if (!isLifecycleEntry(value)) return false;
  const sortResolutions = (
    items: NonNullable<ConfirmLifecycleInput["taskResolutions"]>,
  ) =>
    items
      .map((item) => [item.taskId.toLowerCase(), item.action] as const)
      .sort(([a], [b]) => a.localeCompare(b));
  const sortEventResolutions = (
    items: NonNullable<ConfirmLifecycleInput["eventResolutions"]>,
  ) =>
    items
      .map((item) => [item.eventId.toLowerCase(), item.action] as const)
      .sort(([a], [b]) => a.localeCompare(b));
  if (
    JSON.stringify(value.expected_event_snapshot ?? []) !==
      JSON.stringify(command.expectedEventSnapshot ?? []) ||
    JSON.stringify(sortEventResolutions(value.event_resolutions ?? [])) !==
      JSON.stringify(sortEventResolutions(command.eventResolutions ?? []))
  )
    return false;
  // Omitted fields mean the legacy empty task intent, never a wildcard. A
  // stored command with removed task fields must not consume a taskful receipt.
  if (
    JSON.stringify(value.expected_task_snapshot ?? []) !==
      JSON.stringify(command.expectedTaskSnapshot ?? []) ||
    JSON.stringify(sortResolutions(value.task_resolutions ?? [])) !==
      JSON.stringify(sortResolutions(command.taskResolutions ?? []))
  )
    return false;
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
/** Invalid present commands are quarantined, never downgraded to legacy
 * identifier-only recovery. Genuine old envelopes can confirm only taskless
 * receipts because they predate the Task closure contract. */
export function lifecycleRecoveryMatches(
  result: { entry?: unknown; revision?: unknown },
  intent: LifecycleIntent,
): boolean {
  if (intent.invalidCommand) return false;
  if (intent.command) return lifecycleResultMatches(result, intent.command);
  if (result.entry !== undefined && result.entry !== null) {
    const value = result.entry;
    return (
      isLifecycleEntry(value) &&
      value.case_id === intent.caseId &&
      value.request_id === intent.requestId &&
      (value.expected_task_snapshot ?? []).length === 0 &&
      (value.task_resolutions ?? []).length === 0 &&
      (value.expected_event_snapshot ?? []).length === 0 &&
      (value.event_resolutions ?? []).length === 0
    );
  }
  const value = result.revision;
  return (
    isClosureRevision(value) &&
    value.case_id === intent.caseId &&
    value.request_id === intent.requestId
  );
}
/** Compare the complete frozen intention, including the distinction between a
 * genuine legacy envelope and a present command. Invalid commands never match. */
export function lifecycleIntentsEquivalent(
  current: LifecycleIntent,
  expected: LifecycleIntent,
): boolean {
  if (
    current.invalidCommand ||
    expected.invalidCommand ||
    current.ownerId !== expected.ownerId ||
    current.caseId !== expected.caseId ||
    current.requestId !== expected.requestId
  )
    return false;
  if (!current.command || !expected.command)
    return current.command === undefined && expected.command === undefined;
  const canonical = (command: ConfirmLifecycleInput) => [
    command.operation,
    command.caseId,
    command.closureId,
    command.outcome,
    command.occurredOn,
    command.offerConfirmed,
    command.requestId,
    command.expectedCaseRevision,
    command.expectedClosureRevision,
    [...(command.expectedEventSnapshot ?? [])],
    (command.eventResolutions ?? [])
      .map((item) => [item.eventId.toLowerCase(), item.action] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
    [...(command.expectedTaskSnapshot ?? [])],
    (command.taskResolutions ?? [])
      .map((item) => [item.taskId.toLowerCase(), item.action] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  ];
  return (
    JSON.stringify(canonical(current.command)) ===
    JSON.stringify(canonical(expected.command))
  );
}
/** Re-read storage at the dispatch/acknowledgement boundary; component state is
 * not authority once another operation or corrupted payload replaced it. */
export function isCurrentLifecycleIntent(
  storage: Pick<Storage, "getItem">,
  key: string,
  expected: LifecycleIntent,
): boolean {
  try {
    const current = parseLifecycleIntent(
      storage.getItem(key),
      expected.ownerId,
      expected.caseId,
    );
    // Calendar choices remain only in memory. The UUID binds this tab's
    // frozen command to its owner-scoped receipt without persisting payload.
    if (
      current &&
      !current.invalidCommand &&
      !current.command &&
      expected.command &&
      ((expected.command.expectedEventSnapshot?.length ?? 0) > 0 ||
        (expected.command.eventResolutions?.length ?? 0) > 0)
    )
      return (
        current.ownerId === expected.ownerId &&
        current.caseId === expected.caseId &&
        current.requestId === expected.requestId
      );
    return current !== null && lifecycleIntentsEquivalent(current, expected);
  } catch {
    return false;
  }
}
/** A delayed response must not consume a replaced intent with the same IDs. */
export function clearMatchingLifecycleIntent(
  storage: Pick<Storage, "getItem" | "removeItem">,
  key: string,
  expected: LifecycleIntent,
): boolean {
  if (!isCurrentLifecycleIntent(storage, key, expected)) return false;
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
  const serialized = JSON.stringify(
    (expected.command.expectedEventSnapshot?.length ?? 0) > 0 ||
      (expected.command.eventResolutions?.length ?? 0) > 0
      ? {
          ownerId: expected.ownerId,
          caseId: expected.caseId,
          requestId: expected.requestId,
        }
      : (() => {
          // Preserve the pre-Calendar task-only format; empty Calendar fields
          // add no intent and should not expand the persisted payload.
          const command = { ...expected.command };
          delete command.expectedEventSnapshot;
          delete command.eventResolutions;
          return { ...expected, command };
        })(),
  );
  try {
    const existing = storage.getItem(key);
    if (existing !== null)
      return isCurrentLifecycleIntent(storage, key, expected)
        ? "stored"
        : "conflict";
    storage.setItem(key, serialized);
    return isCurrentLifecycleIntent(storage, key, expected)
      ? "stored"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** A refused, never-sent candidate must not become an immutable retry. Freeze
 * only after persistence succeeds; an existing uncertain command stays intact.
 */
export function persistAndFreezeLifecycleIntent(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  expected: LifecycleIntent & { command: ConfirmLifecycleInput },
  frozen: { current: ConfirmLifecycleInput | null },
): ReturnType<typeof persistLifecycleIntent> {
  if (frozen.current !== null && frozen.current !== expected.command)
    return "conflict";
  const result = persistLifecycleIntent(storage, key, expected);
  if (result === "stored") frozen.current = expected.command;
  return result;
}
