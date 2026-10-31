import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  closureOutcomes,
  parseLifecycleInput,
  type ConfirmLifecycleInput,
  type LifecycleEntry,
} from "../../src/modules/recruitment/domain/lifecycle";
import {
  confirmLifecycle,
  readLifecycleEntry,
  readLifecyclePreview,
  readClosureRevision,
} from "../../src/modules/recruitment/application/lifecycle";
const caseId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const input: ConfirmLifecycleInput = {
  operation: "close",
  caseId,
  closureId: null,
  outcome: "Inny",
  occurredOn: null,
  offerConfirmed: false,
  requestId,
  expectedCaseRevision: 3,
  expectedClosureRevision: 0,
};
const entry: LifecycleEntry = {
  id,
  request_id: requestId,
  expected_case_revision: 3,
  case_id: caseId,
  kind: "close",
  cycle: 0,
  occurred_on: null,
  recorded_at: "2026-10-31T10:00:00Z",
  outcome: "Inny",
  offer_confirmed: false,
  previous_status: "Kontakt rozpoczęty",
  previous_stage: null,
  resulting_status: "Zakończone",
  resulting_stage: null,
  revision: 0,
  original: { outcome: "Inny", occurredOn: null, offerConfirmed: false },
};
describe("DEC057 lifecycle domain", () => {
  it("requires a deliberate approved outcome without owner/cycle injection", () => {
    expect(closureOutcomes).toHaveLength(8);
    for (const bad of [
      { ...input, outcome: null },
      { ...input, outcome: "accepted" },
      { ...input, ownerId: caseId },
      { ...input, cycle: 9 },
    ])
      expect(parseLifecycleInput(bad, true).success).toBe(false);
  });
  it("requires explicit real-offer confirmation only for offer outcomes", () => {
    for (const outcome of closureOutcomes) {
      const wantsOffer = outcome.startsWith("Oferta");
      expect(
        parseLifecycleInput(
          { ...input, outcome, offerConfirmed: wantsOffer },
          true,
        ).success,
      ).toBe(true);
      expect(
        parseLifecycleInput(
          { ...input, outcome, offerConfirmed: !wantsOffer },
          true,
        ).success,
      ).toBe(false);
    }
  });
  it("does not allow reopening to fabricate an outcome or closure reference", () => {
    const reopen = { ...input, operation: "reopen", outcome: null };
    expect(parseLifecycleInput(reopen, true).success).toBe(true);
    expect(
      parseLifecycleInput({ ...reopen, outcome: "Inny" }, true).success,
    ).toBe(false);
    expect(
      parseLifecycleInput({ ...reopen, closureId: id }, true).success,
    ).toBe(false);
  });
  it("preserves unknown day and rejects invalid/future dates", () => {
    expect(parseLifecycleInput(input, true).success).toBe(true);
    for (const occurredOn of [
      "2026-02-29",
      "2026-13-01",
      "0000-01-01",
      "2099-01-01",
    ])
      expect(parseLifecycleInput({ ...input, occurredOn }, true).success).toBe(
        false,
      );
  });
  it("requires monotonic bounded concurrency tokens and closure version", () => {
    for (const expectedCaseRevision of [-1, 1.5, 2147483647, NaN])
      expect(
        parseLifecycleInput({ ...input, expectedCaseRevision }, true).success,
      ).toBe(false);
    expect(
      parseLifecycleInput({ ...input, expectedClosureRevision: 2 }, true)
        .success,
    ).toBe(false);
    expect(
      parseLifecycleInput(
        {
          ...input,
          operation: "correct-closure",
          closureId: id,
          expectedClosureRevision: 2,
        },
        true,
      ).success,
    ).toBe(true);
  });
});
describe("untrusted lifecycle acknowledgements", () => {
  it("validates original snapshot and status-stage combinations", () => {
    expect(readLifecycleEntry(entry)).toEqual(entry);
    for (const bad of [
      { ...entry, original: null },
      { ...entry, resulting_stage: "HR" },
      { ...entry, previous_status: "W rekrutacji" },
      { ...entry, offer_confirmed: true },
    ])
      expect(() => readLifecycleEntry(bad)).toThrow();
  });
  it("does not parse active-stage reopening without an invitation-derived stage", () => {
    const preview = {
      caseRevision: 4,
      closureRevision: 0,
      cycle: 1,
      status: "W rekrutacji",
      currentStage: null,
      before: null,
      after: null,
    };
    expect(() => readLifecyclePreview(preview)).toThrow();
    expect(
      readLifecyclePreview({ ...preview, currentStage: "HR" }).currentStage,
    ).toBe("HR");
  });
  it("rejects corrupt revision chains", () => {
    const values = entry.original;
    const revision = {
      id,
      request_id: requestId,
      case_id: caseId,
      closure_id: id,
      revision: 1,
      expected_case_revision: 4,
      expected_closure_revision: 0,
      recorded_at: entry.recorded_at,
      before: values,
      after: { ...values, outcome: "Rezygnacja użytkownika" },
    };
    expect(readClosureRevision(revision).revision).toBe(1);
    expect(() => readClosureRevision({ ...revision, revision: 3 })).toThrow();
  });
  it("accepts historical replay without applying state and binds exact intention", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { kind: "replayed", entry, revision: null },
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient;
    expect((await confirmLifecycle(client, input)).kind).toBe("replayed");
    expect(rpc).toHaveBeenCalledOnce();
    for (const wrong of [
      { ...entry, request_id: id },
      { ...entry, case_id: id },
      { ...entry, expected_case_revision: 2 },
      { ...entry, outcome: "Rezygnacja użytkownika" },
    ]) {
      rpc.mockResolvedValue({
        data: { kind: "created", entry: wrong, revision: null },
        error: null,
      });
      await expect(confirmLifecycle(client, input)).rejects.toThrow();
    }
  });
  it("maps stale, payload conflict and invalid DB contracts distinctly", async () => {
    for (const [code, kind] of [
      ["PT412", "stale"],
      ["PT409", "conflict"],
      ["22023", "invalid"],
      ["PT422", "invalid"],
      ["42501", "unavailable"],
    ]) {
      const client = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { code } }),
      } as unknown as SupabaseClient;
      await expect(confirmLifecycle(client, input)).rejects.toHaveProperty(
        "kind",
        kind,
      );
    }
  });
});
