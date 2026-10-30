import type { SupabaseClient } from "@supabase/supabase-js";
import { CaseRepositoryError } from "./cases";
import { uuidPattern } from "../domain/recruitment-case";
import {
  isCalendarDate,
  parseRecordCaseEventInput,
  type CaseEvent,
  type RecordCaseEventInput,
} from "../domain/case-events";

const eventColumns = "id,case_id,kind,direction,occurred_on,recorded_at";
export const caseEventPageSize = 25;

function readEvent(value: unknown): CaseEvent {
  if (!value || typeof value !== "object")
    throw new CaseRepositoryError("unavailable");
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !uuidPattern.test(row.id) ||
    typeof row.case_id !== "string" ||
    !uuidPattern.test(row.case_id) ||
    (row.kind !== "application" && row.kind !== "contact") ||
    (row.kind === "application"
      ? row.direction !== null
      : row.direction !== "inbound" && row.direction !== "outbound") ||
    (row.occurred_on !== null &&
      (typeof row.occurred_on !== "string" ||
        !isCalendarDate(row.occurred_on))) ||
    typeof row.recorded_at !== "string" ||
    !Number.isFinite(Date.parse(row.recorded_at))
  )
    throw new CaseRepositoryError("unavailable");
  return {
    id: row.id,
    case_id: row.case_id,
    kind: row.kind,
    direction: row.direction as CaseEvent["direction"],
    occurred_on: row.occurred_on as string | null,
    recorded_at: row.recorded_at,
  };
}
export async function recordRecruitmentCaseEvent(
  client: SupabaseClient,
  input: RecordCaseEventInput,
): Promise<{ kind: "created" | "replayed"; event: CaseEvent }> {
  const parsed = parseRecordCaseEventInput(input);
  if (!parsed.success) throw new CaseRepositoryError("invalid");
  const { data, error } = await client.rpc("record_recruitment_case_event", {
    p_request_id: parsed.data.requestId,
    p_case_id: parsed.data.caseId,
    p_kind: parsed.data.kind,
    p_direction: parsed.data.direction,
    p_occurred_on: parsed.data.occurredOn,
  });
  if (error)
    throw new CaseRepositoryError(
      error.code === "PT409"
        ? "conflict"
        : error.code === "22023"
          ? "invalid"
          : "unavailable",
    );
  if (data?.kind !== "created" && data?.kind !== "replayed")
    throw new CaseRepositoryError("unavailable");
  const event = readEvent(data.event);
  if (
    event.case_id !== parsed.data.caseId ||
    event.kind !== parsed.data.kind ||
    event.direction !== parsed.data.direction ||
    event.occurred_on !== parsed.data.occurredOn
  )
    throw new CaseRepositoryError("unavailable");
  return { kind: data.kind, event };
}
export async function listRecruitmentCaseEvents(
  client: SupabaseClient,
  caseId: string,
  page = 1,
) {
  if (
    !uuidPattern.test(caseId) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > Math.floor(2_147_483_647 / caseEventPageSize)
  )
    throw new CaseRepositoryError("invalid");
  const offset = (page - 1) * caseEventPageSize;
  const { data, error } = await client
    .from("recruitment_case_event")
    .select(eventColumns)
    .eq("case_id", caseId)
    .order("occurred_on", { ascending: false, nullsFirst: false })
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + caseEventPageSize);
  if (error || !Array.isArray(data))
    throw new CaseRepositoryError("unavailable");
  const events = data.slice(0, caseEventPageSize).map(readEvent);
  if (events.some((event) => event.case_id !== caseId))
    throw new CaseRepositoryError("unavailable");
  return { events, hasMore: data.length > caseEventPageSize, page };
}
export async function getRecruitmentCaseEventByRequestId(
  client: SupabaseClient,
  caseId: string,
  requestId: string,
): Promise<CaseEvent | null> {
  if (!uuidPattern.test(caseId) || !uuidPattern.test(requestId)) return null;
  const { data, error } = await client
    .from("recruitment_case_event")
    .select(eventColumns)
    .eq("case_id", caseId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw new CaseRepositoryError("unavailable");
  if (!data) return null;
  const event = readEvent(data);
  if (event.case_id !== caseId) throw new CaseRepositoryError("unavailable");
  return event;
}
