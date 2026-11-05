import { describe, expect, it, vi } from "vitest";
import {
  parseQuickCaptureAtomicInput,
  type QuickCaptureAtomicReceipt,
} from "@/modules/recruitment/domain/quick-capture-atomic";
import {
  createQuickCaptureAtomic,
  getQuickCaptureAtomicReceipt,
} from "@/modules/recruitment/application/quick-capture-atomic";
import { CaseRepositoryError } from "@/modules/recruitment/application/cases";
import type { SupabaseClient } from "@supabase/supabase-js";

const requestId = "00000000-0000-4000-8000-000000000001";
const caseId = "00000000-0000-4000-8000-000000000002";
const validInput = {
  contractVersion: 1,
  requestId,
  intent: {
    title: "  Zapisana oferta  ",
    description: "  Szczegóły  ",
    sourceUrl: null,
    action: { kind: "save_only" },
  },
} as const;
const savedCase = {
  id: caseId,
  title: "Zapisana oferta",
  description: "Szczegóły",
  source_url: null,
  status: "Zapisane" as const,
  current_stage: null,
  stage_version: 0,
  created_at: "2026-11-01T11:00:00.000Z",
};
const receipt: QuickCaptureAtomicReceipt = {
  requestId,
  contractVersion: 1,
  intent: {
    title: savedCase.title,
    description: savedCase.description,
    sourceUrl: null,
    action: { kind: "save_only" },
  },
  intentFingerprint: "a".repeat(32),
  case: savedCase,
  event: null,
  recordedAt: "2026-11-01T11:00:00.001Z",
};

function clientWithRpc(result: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("Quick Capture Atomic Action domain", () => {
  it("normalizes the case fields while preserving explicit save-only intent", () => {
    const parsed = parseQuickCaptureAtomicInput(validInput);
    expect(parsed).toEqual({
      success: true,
      data: {
        contractVersion: 1,
        requestId,
        intent: {
          title: "Zapisana oferta",
          description: "Szczegóły",
          sourceUrl: null,
          action: { kind: "save_only" },
        },
      },
    });
  });

  it.each([
    [
      "Sytuacja cannot be supplied to the backend",
      { situation: "application" },
    ],
    ["client status cannot be supplied", { status: "Kontakt rozpoczęty" }],
    [
      "unknown action keys are rejected",
      {
        intent: {
          ...validInput.intent,
          action: { kind: "save_only", occurredOn: null },
        },
      },
    ],
    [
      "unconfirmed facts are rejected",
      {
        intent: {
          ...validInput.intent,
          action: {
            kind: "application",
            occurredOn: null,
            factConfirmed: false,
          },
        },
      },
    ],
    [
      "future factual day is rejected",
      {
        intent: {
          ...validInput.intent,
          action: {
            kind: "application",
            occurredOn: "2026-01-02",
            factConfirmed: true,
          },
        },
      },
    ],
    [
      "malformed factual day is rejected",
      {
        intent: {
          ...validInput.intent,
          action: {
            kind: "application",
            occurredOn: "2026-02-30",
            factConfirmed: true,
          },
        },
      },
    ],
    [
      "compound action cannot be inferred from a title",
      {
        intent: {
          ...validInput.intent,
          action: { kind: "application", occurredOn: null },
        },
      },
    ],
    [
      "malformed duplicate acknowledgement is rejected",
      { duplicateAcknowledgement: { createSeparateCase: true } },
    ],
  ])("rejects %s", (_name, patch) => {
    const parsed = parseQuickCaptureAtomicInput(
      { ...validInput, ...patch },
      new Date("2026-01-01T12:00:00.000Z"),
    );
    expect(parsed.success).toBe(false);
  });

  it("accepts an explicitly confirmed application with an unknown occurrence day", () => {
    const parsed = parseQuickCaptureAtomicInput({
      ...validInput,
      intent: {
        ...validInput.intent,
        action: {
          kind: "application",
          occurredOn: null,
          factConfirmed: true,
        },
      },
    });
    expect(parsed).toMatchObject({
      success: true,
      data: {
        intent: {
          action: {
            kind: "application",
            occurredOn: null,
            factConfirmed: true,
          },
        },
      },
    });
  });

  it("requires duplicate acknowledgement to bind a complete intent and match set", () => {
    const ack = {
      intentFingerprint: "b".repeat(32),
      matchSetFingerprint: "c".repeat(32),
      createSeparateCase: true,
    };
    expect(
      parseQuickCaptureAtomicInput({
        ...validInput,
        duplicateAcknowledgement: ack,
      }),
    ).toMatchObject({ success: true });
    expect(
      parseQuickCaptureAtomicInput({
        ...validInput,
        duplicateAcknowledgement: { ...ack, createSeparateCase: false },
      }).success,
    ).toBe(false);
  });
});

describe("Quick Capture Atomic Action repository", () => {
  it("sends the validated full intent to one atomic RPC and validates its immutable receipt", async () => {
    const { client, rpc } = clientWithRpc({ kind: "created", receipt });
    const result = await createQuickCaptureAtomic(client, validInput);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("create_recruitment_case_atomic", {
      p_request_id: requestId,
      p_intent: receipt.intent,
    });
    expect(result).toEqual({ kind: "created", receipt });
  });

  it("returns refreshed duplicate fingerprints without creating a success receipt", async () => {
    const duplicates = {
      kind: "duplicates",
      matches: [savedCase],
      hasMore: true,
      intentFingerprint: "a".repeat(32),
      matchSetFingerprint: "b".repeat(32),
    };
    const { client } = clientWithRpc(duplicates);
    await expect(createQuickCaptureAtomic(client, validInput)).resolves.toEqual(
      duplicates,
    );
  });

  it("preserves conflict semantics for the owner/request key", async () => {
    const { client } = clientWithRpc(null, { code: "PT409" });
    await expect(
      createQuickCaptureAtomic(client, validInput),
    ).rejects.toMatchObject({
      kind: "conflict",
    } satisfies Partial<CaseRepositoryError>);
  });

  it("reads the owner-scoped receipt and treats missing receipts as unresolved", async () => {
    const found = clientWithRpc({ kind: "receipt", receipt });
    await expect(
      getQuickCaptureAtomicReceipt(found.client, requestId),
    ).resolves.toEqual(receipt);
    expect(found.rpc).toHaveBeenCalledWith(
      "get_recruitment_case_capture_receipt",
      { p_request_id: requestId },
    );

    const missing = clientWithRpc({ kind: "not-found" });
    await expect(
      getQuickCaptureAtomicReceipt(missing.client, requestId),
    ).resolves.toBeNull();
  });
});
