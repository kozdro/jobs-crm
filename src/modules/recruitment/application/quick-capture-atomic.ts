import type { SupabaseClient } from "@supabase/supabase-js";
import { CaseRepositoryError, readRecruitmentCase } from "./cases";
import { readEvent } from "./case-events";
import {
  parseQuickCaptureAtomicInput,
  type QuickCaptureAtomicInput,
  type QuickCaptureAtomicReceipt,
  type QuickCaptureAtomicResult,
} from "../domain/quick-capture-atomic";
import { uuidPattern } from "../domain/recruitment-case";

function readReceipt(value: unknown): QuickCaptureAtomicReceipt {
  if (!value || typeof value !== "object")
    throw new CaseRepositoryError("unavailable");
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.requestId !== "string" ||
    !uuidPattern.test(raw.requestId) ||
    raw.contractVersion !== 1 ||
    !raw.intent ||
    typeof raw.intent !== "object" ||
    typeof raw.intentFingerprint !== "string" ||
    !/^[0-9a-f]{32}$/.test(raw.intentFingerprint) ||
    !raw.case ||
    typeof raw.case !== "object" ||
    !(raw.event === null || (raw.event && typeof raw.event === "object")) ||
    typeof raw.recordedAt !== "string" ||
    !Number.isFinite(Date.parse(raw.recordedAt))
  )
    throw new CaseRepositoryError("unavailable");
  const parsedIntent = parseQuickCaptureAtomicInput({
    contractVersion: 1,
    requestId: raw.requestId,
    intent: raw.intent,
  });
  if (!parsedIntent.success) throw new CaseRepositoryError("unavailable");
  const item: QuickCaptureAtomicReceipt = {
    requestId: raw.requestId,
    contractVersion: 1,
    intent: parsedIntent.data.intent,
    intentFingerprint: raw.intentFingerprint,
    case: readRecruitmentCase(raw.case),
    event: raw.event === null ? null : readEvent(raw.event),
    recordedAt: raw.recordedAt,
  };
  if (
    item.case.title !== item.intent.title ||
    item.case.description !== item.intent.description ||
    item.case.source_url !== item.intent.sourceUrl ||
    (item.intent.action.kind === "save_only" &&
      (item.event !== null || item.case.status !== "Zapisane")) ||
    (item.intent.action.kind !== "save_only" &&
      (!item.event || item.case.status !== "Kontakt rozpoczęty")) ||
    (item.event && item.event.case_id !== item.case.id) ||
    (item.event &&
      (item.intent.action.kind === "save_only" ||
        item.event.kind !==
          (item.intent.action.kind === "application"
            ? "application"
            : "contact") ||
        item.event.direction !==
          (item.intent.action.kind === "contact_inbound"
            ? "inbound"
            : item.intent.action.kind === "contact_outbound"
              ? "outbound"
              : null) ||
        item.event.occurred_on !== item.intent.action.occurredOn))
  )
    throw new CaseRepositoryError("unavailable");
  return item;
}

function mapError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "PT409") throw new CaseRepositoryError("conflict");
  if (error.code === "22023") throw new CaseRepositoryError("invalid");
  if (error.code === "PT412") throw new CaseRepositoryError("stale");
  throw new CaseRepositoryError("unavailable");
}

export async function createQuickCaptureAtomic(
  client: SupabaseClient,
  input: QuickCaptureAtomicInput,
): Promise<QuickCaptureAtomicResult> {
  const parsed = parseQuickCaptureAtomicInput(input);
  if (!parsed.success) throw new CaseRepositoryError("invalid");
  const { data, error } = await client.rpc("create_recruitment_case_atomic", {
    p_request_id: parsed.data.requestId,
    p_intent: parsed.data.intent,
    ...(parsed.data.duplicateAcknowledgement
      ? {
          p_duplicate_acknowledgement: parsed.data.duplicateAcknowledgement,
        }
      : {}),
  });
  mapError(error);
  if (data?.kind === "created" || data?.kind === "replayed") {
    const receipt = readReceipt(data.receipt);
    if (receipt.requestId !== parsed.data.requestId)
      throw new CaseRepositoryError("unavailable");
    return { kind: data.kind, receipt };
  }
  if (
    data?.kind === "duplicates" &&
    Array.isArray(data.matches) &&
    typeof data.hasMore === "boolean" &&
    typeof data.intentFingerprint === "string" &&
    /^[0-9a-f]{32}$/.test(data.intentFingerprint) &&
    typeof data.matchSetFingerprint === "string" &&
    /^[0-9a-f]{32}$/.test(data.matchSetFingerprint)
  )
    return {
      kind: "duplicates",
      matches: data.matches.map(readRecruitmentCase),
      hasMore: data.hasMore,
      intentFingerprint: data.intentFingerprint,
      matchSetFingerprint: data.matchSetFingerprint,
    };
  throw new CaseRepositoryError("unavailable");
}

export async function getQuickCaptureAtomicReceipt(
  client: SupabaseClient,
  requestId: string,
): Promise<QuickCaptureAtomicReceipt | null> {
  if (!uuidPattern.test(requestId)) throw new CaseRepositoryError("invalid");
  const { data, error } = await client.rpc(
    "get_recruitment_case_capture_receipt",
    { p_request_id: requestId },
  );
  mapError(error);
  if (data?.kind === "not-found") return null;
  if (data?.kind !== "receipt") throw new CaseRepositoryError("unavailable");
  const receipt = readReceipt(data.receipt);
  if (receipt.requestId !== requestId)
    throw new CaseRepositoryError("unavailable");
  return receipt;
}
