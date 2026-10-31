import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseHistoryCorrectionInput } from "@/modules/recruitment/domain/history-corrections";
import {
  confirmHistoryCorrection,
  previewHistoryCorrection,
  readHistoryRevision,
  readHistoryPreview,
} from "@/modules/recruitment/application/history-corrections";
const id = "00000000-0000-4000-8000-000000000001";
const caseId = "00000000-0000-4000-8000-000000000002";
const requestId = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-10-31T12:00:00Z");
const input = {
  caseId,
  eventId: id,
  operation: "correct" as const,
  occurredOn: "2026-10-01",
  direction: null,
  stageName: "Screening",
};
const values = {
  occurredOn: null,
  direction: null,
  stageName: "HR",
  voided: false,
};
const preview = {
  caseRevision: 12,
  eventRevision: 3,
  before: values,
  after: { ...values, occurredOn: "2026-10-01", stageName: "Screening" },
  status: "W rekrutacji",
  currentStage: "Screening",
  blockedBy: [],
};
const revision = {
  id: requestId,
  event_id: id,
  case_id: caseId,
  operation: "correct",
  revision: 4,
  recorded_at: "2026-10-31T12:00:00Z",
  before: values,
  after: preview.after,
  status: "W rekrutacji",
  current_stage: "Screening",
  expected_case_revision: 12,
  expected_event_revision: 3,
};
const confirm = {
  ...input,
  requestId,
  expectedCaseRevision: 12,
  expectedEventRevision: 3,
};
describe("DEC-056 correction intent boundaries", () => {
  it("preserves unknown dates, trims Unicode labels, and has no fabricated reason or kind", () => {
    expect(
      parseHistoryCorrectionInput(
        { ...input, occurredOn: null, stageName: "  HR 😀  " },
        false,
        now,
      ),
    ).toEqual({
      success: true,
      data: { ...input, occurredOn: null, stageName: "HR 😀" },
    });
  });
  it.each([
    { kind: "invitation" },
    { ownerId: id },
    { recordedAt: "2026-10-31" },
    { reason: "private" },
    { stageName: "" },
    { stageName: "x".repeat(161) },
    { stageName: "bad\0" },
    { stageName: "\ud800" },
    { occurredOn: "2027-01-01" },
    { occurredOn: "2026-02-29" },
    { direction: "sideways" },
  ])("rejects spoofed or invalid input %j", (extra) => {
    expect(
      parseHistoryCorrectionInput({ ...input, ...extra }, false, now).success,
    ).toBe(false);
  });
  it("requires null edit fields for void and monotonic revision snapshots for confirm", () => {
    expect(
      parseHistoryCorrectionInput({ ...input, operation: "void" }, false, now)
        .success,
    ).toBe(false);
    expect(
      parseHistoryCorrectionInput(
        { ...input, operation: "void", occurredOn: null, stageName: null },
        false,
        now,
      ).success,
    ).toBe(true);
    for (const expectedCaseRevision of [-1, NaN, 1.1, 2147483647, "12"])
      expect(
        parseHistoryCorrectionInput(
          { ...confirm, expectedCaseRevision },
          true,
          now,
        ).success,
      ).toBe(false);
    expect(parseHistoryCorrectionInput(confirm, true, now).success).toBe(true);
  });
  it("validates audit snapshots and rejects impossible revision or blocked IDs", () => {
    expect(readHistoryRevision(revision)).toEqual(revision);
    expect(() => readHistoryRevision({ ...revision, revision: 9 })).toThrow();
    expect(() =>
      readHistoryPreview({ ...preview, blockedBy: ["other"] }),
    ).toThrow();
    expect(() =>
      readHistoryRevision({
        ...revision,
        after: { ...values, occurredOn: "2026-02-29" },
      }),
    ).toThrow();
  });
  it("sends only controlled preview and confirmation input and maps stale conflicts", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: preview, error: null })
      .mockResolvedValueOnce({
        data: { kind: "replayed", revision },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { code: "PT412" } });
    const client = { rpc } as unknown as SupabaseClient;
    expect(await previewHistoryCorrection(client, input)).toEqual(preview);
    expect(rpc.mock.calls[0]).toEqual([
      "preview_recruitment_case_correction",
      {
        p_case_id: caseId,
        p_event_id: id,
        p_operation: "correct",
        p_occurred_on: "2026-10-01",
        p_direction: null,
        p_stage_name: "Screening",
      },
    ]);
    expect(await confirmHistoryCorrection(client, confirm)).toEqual({
      kind: "replayed",
      revision,
    });
    await expect(
      confirmHistoryCorrection(client, confirm),
    ).rejects.toMatchObject({ kind: "stale" });
  });
  it("does not accept another entry's replay as the current intent", async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          kind: "replayed",
          revision: { ...revision, event_id: caseId },
        },
        error: null,
      }),
    } as unknown as SupabaseClient;
    await expect(
      confirmHistoryCorrection(client, confirm),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
});
