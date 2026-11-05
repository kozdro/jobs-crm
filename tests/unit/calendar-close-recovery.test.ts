import { describe, expect, it } from "vitest";
import {
  lifecycleIntentsEquivalent,
  lifecycleResultMatches,
  lifecycleRecoveryMatches,
  persistLifecycleIntent,
  isCurrentLifecycleIntent,
} from "@/components/recruitment/lifecycle-intent";
import type {
  ConfirmLifecycleInput,
  LifecycleEntry,
} from "@/modules/recruitment/domain/lifecycle";
const ownerId = "00000000-0000-4000-8000-000000000001",
  caseId = "00000000-0000-4000-8000-000000000002",
  requestId = "00000000-0000-4000-8000-000000000003",
  eventId = "00000000-0000-4000-8000-000000000004",
  closureId = "00000000-0000-4000-8000-000000000005";
const command: ConfirmLifecycleInput = {
  operation: "close",
  caseId,
  closureId: null,
  outcome: "Nie aplikowano",
  occurredOn: null,
  offerConfirmed: false,
  requestId,
  expectedCaseRevision: 3,
  expectedClosureRevision: 0,
  expectedEventSnapshot: [`${eventId}:2`],
  eventResolutions: [{ eventId, action: "detach" }],
};
const entry: LifecycleEntry = {
  id: closureId,
  request_id: requestId,
  expected_case_revision: 3,
  case_id: caseId,
  kind: "close",
  cycle: 0,
  occurred_on: null,
  recorded_at: "2026-10-31T12:00:00Z",
  outcome: "Nie aplikowano",
  offer_confirmed: false,
  previous_status: "Zapisane",
  previous_stage: null,
  resulting_status: "Zakończone",
  resulting_stage: null,
  revision: 0,
  original: {
    outcome: "Nie aplikowano",
    occurredOn: null,
    offerConfirmed: false,
  },
  expected_event_snapshot: [`${eventId}:2`],
  event_resolutions: [{ eventId, action: "detach" }],
};
describe("calendar mixed close recovery", () => {
  it("persists only owner, case and request identifiers for mixed calendar close", () => {
    let raw: string | null = null;
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    const intent = { ownerId, caseId, requestId, command };
    expect(persistLifecycleIntent(storage, "pending", intent)).toBe("stored");
    expect(JSON.parse(raw!)).toEqual({ ownerId, caseId, requestId });
    expect(raw).not.toContain(eventId);
    expect(isCurrentLifecycleIntent(storage, "pending", intent)).toBe(true);
  });
  it("binds confirmation and retry to all event decisions and exact snapshot", () => {
    const intent = { ownerId, caseId, requestId, command };
    expect(lifecycleResultMatches({ entry }, command)).toBe(true);
    expect(
      lifecycleResultMatches(
        {
          entry: { ...entry, event_resolutions: [{ eventId, action: "keep" }] },
        },
        command,
      ),
    ).toBe(false);
    expect(
      lifecycleIntentsEquivalent(intent, {
        ...intent,
        command: { ...command, expectedEventSnapshot: [`${eventId}:3`] },
      }),
    ).toBe(false);
    expect(
      lifecycleIntentsEquivalent(intent, {
        ...intent,
        command: {
          ...command,
          eventResolutions: [{ eventId, action: "cancel" }],
        },
      }),
    ).toBe(false);
    expect(
      lifecycleRecoveryMatches({ entry }, { ownerId, caseId, requestId }),
    ).toBe(false);
  });
});
