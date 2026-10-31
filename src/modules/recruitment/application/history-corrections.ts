import type { SupabaseClient } from "@supabase/supabase-js";
import { CaseRepositoryError } from "./cases";
import { uuidPattern } from "../domain/recruitment-case";
import { isCalendarDate } from "../domain/case-events";
import {
  parseHistoryCorrectionInput,
  type HistoryValues,
  type HistoryPreview,
  type HistoryRevision,
  type HistoryCorrectionInput,
  type ConfirmHistoryCorrectionInput,
} from "../domain/history-corrections";

export function readHistoryValues(value: unknown): HistoryValues {
  if (!value || typeof value !== "object")
    throw new CaseRepositoryError("unavailable");
  const r = value as HistoryValues;
  if (
    !(
      r.occurredOn === null ||
      (typeof r.occurredOn === "string" && isCalendarDate(r.occurredOn))
    ) ||
    ![null, "inbound", "outbound"].includes(r.direction) ||
    !(r.stageName === null || typeof r.stageName === "string") ||
    typeof r.voided !== "boolean"
  )
    throw new CaseRepositoryError("unavailable");
  return {
    occurredOn: r.occurredOn,
    direction: r.direction,
    stageName: r.stageName,
    voided: r.voided,
  };
}
function validStatus(value: unknown) {
  return ["Zapisane", "Kontakt rozpoczęty", "W rekrutacji"].includes(
    value as string,
  );
}
function validRevision(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
export function readHistoryPreview(value: unknown): HistoryPreview {
  if (!value || typeof value !== "object")
    throw new CaseRepositoryError("unavailable");
  const r = value as HistoryPreview;
  if (
    !validRevision(r.caseRevision) ||
    !validRevision(r.eventRevision) ||
    !validStatus(r.status) ||
    !(r.currentStage === null || typeof r.currentStage === "string") ||
    !Array.isArray(r.blockedBy) ||
    r.blockedBy.some((id) => typeof id !== "string" || !uuidPattern.test(id))
  )
    throw new CaseRepositoryError("unavailable");
  return {
    caseRevision: r.caseRevision,
    eventRevision: r.eventRevision,
    before: readHistoryValues(r.before),
    after: readHistoryValues(r.after),
    status: r.status,
    currentStage: r.currentStage,
    blockedBy: r.blockedBy,
  };
}
export function readHistoryRevision(value: unknown): HistoryRevision {
  if (!value || typeof value !== "object")
    throw new CaseRepositoryError("unavailable");
  const r = value as HistoryRevision;
  if (
    [r.id, r.event_id, r.case_id].some(
      (id) => typeof id !== "string" || !uuidPattern.test(id),
    ) ||
    !["correct", "void"].includes(r.operation) ||
    !validRevision(r.revision) ||
    r.revision < 1 ||
    !validRevision(r.expected_case_revision) ||
    !validRevision(r.expected_event_revision) ||
    r.revision !== r.expected_event_revision + 1 ||
    typeof r.recorded_at !== "string" ||
    !Number.isFinite(Date.parse(r.recorded_at)) ||
    !validStatus(r.status) ||
    !(r.current_stage === null || typeof r.current_stage === "string")
  )
    throw new CaseRepositoryError("unavailable");
  return {
    id: r.id,
    event_id: r.event_id,
    case_id: r.case_id,
    operation: r.operation,
    revision: r.revision,
    recorded_at: r.recorded_at,
    before: readHistoryValues(r.before),
    after: readHistoryValues(r.after),
    status: r.status,
    current_stage: r.current_stage,
    expected_case_revision: r.expected_case_revision,
    expected_event_revision: r.expected_event_revision,
  };
}
function rpcInput(input: HistoryCorrectionInput) {
  return {
    p_case_id: input.caseId,
    p_event_id: input.eventId,
    p_operation: input.operation,
    p_occurred_on: input.occurredOn,
    p_direction: input.direction,
    p_stage_name: input.stageName,
  };
}
function rpcError(code?: string): never {
  throw new CaseRepositoryError(
    code === "PT412"
      ? "stale"
      : code === "PT409"
        ? "conflict"
        : code === "22023" || code === "PT422"
          ? "invalid"
          : "unavailable",
  );
}
export async function previewHistoryCorrection(
  client: SupabaseClient,
  input: HistoryCorrectionInput,
): Promise<HistoryPreview> {
  const parsed = parseHistoryCorrectionInput(input);
  if (!parsed.success) throw new CaseRepositoryError("invalid");
  const { data, error } = await client.rpc(
    "preview_recruitment_case_correction",
    rpcInput(parsed.data),
  );
  if (error) rpcError(error.code);
  return readHistoryPreview(data);
}
export async function confirmHistoryCorrection(
  client: SupabaseClient,
  input: ConfirmHistoryCorrectionInput,
): Promise<{ kind: "created" | "replayed"; revision: HistoryRevision }> {
  const parsed = parseHistoryCorrectionInput(input, true);
  if (!parsed.success || !("requestId" in parsed.data))
    throw new CaseRepositoryError("invalid");
  const { data, error } = await client.rpc("correct_recruitment_case_event", {
    ...rpcInput(parsed.data),
    p_request_id: parsed.data.requestId,
    p_expected_case_revision: parsed.data.expectedCaseRevision,
    p_expected_event_revision: parsed.data.expectedEventRevision,
  });
  if (error) rpcError(error.code);
  if (data?.kind !== "created" && data?.kind !== "replayed")
    throw new CaseRepositoryError("unavailable");
  const revision = readHistoryRevision(data.revision);
  if (
    revision.case_id !== input.caseId ||
    revision.event_id !== input.eventId ||
    revision.operation !== input.operation ||
    revision.expected_case_revision !== input.expectedCaseRevision ||
    revision.expected_event_revision !== input.expectedEventRevision
  )
    throw new CaseRepositoryError("unavailable");
  if (
    revision.before.voided ||
    revision.after.voided !== (input.operation === "void") ||
    (input.operation === "correct" &&
      (revision.after.occurredOn !== parsed.data.occurredOn ||
        revision.after.direction !== parsed.data.direction ||
        revision.after.stageName !== parsed.data.stageName))
  )
    throw new CaseRepositoryError("unavailable");
  return { kind: data.kind, revision };
}
const auditColumns =
  "id,event_id,case_id,operation,revision,recorded_at,before:before_values,after:after_values,status:resulting_status,current_stage:resulting_stage,expected_case_revision,expected_event_revision";
export async function listHistoryRevisions(
  client: SupabaseClient,
  caseId: string,
  eventId: string,
) {
  if (!uuidPattern.test(caseId) || !uuidPattern.test(eventId))
    throw new CaseRepositoryError("invalid");
  const revisions: HistoryRevision[] = [];
  // PostgREST's response limit must not silently truncate an entry's audit.
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("recruitment_case_event_revision")
      .select(auditColumns)
      .eq("case_id", caseId)
      .eq("event_id", eventId)
      .order("revision", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error || !Array.isArray(data))
      throw new CaseRepositoryError("unavailable");
    for (const value of data) {
      const revision = readHistoryRevision(value);
      if (revision.case_id !== caseId || revision.event_id !== eventId)
        throw new CaseRepositoryError("unavailable");
      revisions.push(revision);
    }
    if (data.length < pageSize) return revisions.reverse();
  }
}
export async function getHistoryRevisionByRequestId(
  client: SupabaseClient,
  caseId: string,
  requestId: string,
) {
  if (!uuidPattern.test(caseId) || !uuidPattern.test(requestId))
    throw new CaseRepositoryError("invalid");
  const { data, error } = await client
    .from("recruitment_case_event_revision")
    .select(auditColumns)
    .eq("case_id", caseId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw new CaseRepositoryError("unavailable");
  if (!data) return null;
  const revision = readHistoryRevision(data);
  if (revision.case_id !== caseId) throw new CaseRepositoryError("unavailable");
  return revision;
}
