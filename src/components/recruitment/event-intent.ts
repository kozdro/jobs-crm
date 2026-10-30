import type {
  CaseEvent,
  RecordCaseEventInput,
} from "@/modules/recruitment/domain/case-events";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

export const eventIntentStorageKey = "jobs-crm.case-event.pending";
export type PendingEventIntent = {
  ownerId: string;
  caseId: string;
  requestId: string;
};
/** Persist identifiers only. Never restore another account's private action. */
export function parsePendingEventIntent(
  raw: string | null,
  ownerId: string,
  caseId: string,
): PendingEventIntent | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).length !== 3 ||
      row.ownerId !== ownerId ||
      row.caseId !== caseId ||
      typeof row.requestId !== "string" ||
      !uuidPattern.test(row.requestId)
    )
      return null;
    return { ownerId, caseId, requestId: row.requestId };
  } catch {
    return null;
  }
}

/** Recovery must match the full intent, including the observed stage revision. */
export function eventMatchesIntent(
  event: CaseEvent,
  intent: RecordCaseEventInput,
): boolean {
  return (
    event.case_id === intent.caseId &&
    event.kind === intent.kind &&
    event.direction === intent.direction &&
    event.occurred_on === intent.occurredOn &&
    (event.stage_name ?? null) === (intent.stageName ?? null) &&
    (event.expected_stage_version ?? null) ===
      (intent.expectedStageVersion ?? null)
  );
}
