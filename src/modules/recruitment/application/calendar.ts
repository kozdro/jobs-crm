import type { SupabaseClient } from "@supabase/supabase-js";
import { CaseRepositoryError } from "./cases";
import { uuidPattern } from "../domain/recruitment-case";
import {
  parseCalendarCommand,
  type CalendarAudit,
  type CalendarCommandInput,
  type CalendarEvent,
} from "../domain/calendar";

const uuid = (v: unknown): v is string =>
  typeof v === "string" && uuidPattern.test(v);
const unavailable = (): never => {
  throw new CaseRepositoryError("unavailable");
};
const fail = (code?: string): never => {
  throw new CaseRepositoryError(
    code === "PT412"
      ? "stale"
      : code === "PT409"
        ? "conflict"
        : code === "22023" || code === "PT422"
          ? "invalid"
          : "unavailable",
  );
};
export function readCalendarEvent(value: unknown): CalendarEvent {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return unavailable();
  const r = value as Record<string, unknown>;
  if (
    !uuid(r.id) ||
    !(r.case_id === null || uuid(r.case_id)) ||
    !(r.case_title === null || typeof r.case_title === "string") ||
    (r.case_id === null) !== (r.case_title === null) ||
    !Number.isSafeInteger(r.revision) ||
    (r.revision as number) < 0 ||
    typeof r.created_at !== "string" ||
    !Number.isFinite(Date.parse(r.created_at)) ||
    typeof r.updated_at !== "string" ||
    !Number.isFinite(Date.parse(r.updated_at))
  )
    return unavailable();
  const parsed = parseCalendarCommand({
    requestId: r.id,
    operation: "edit",
    eventId: r.id,
    expectedRevision: r.revision,
    values: {
      title: r.title,
      description: r.description,
      caseId: r.case_id,
      status: r.status,
      schedule: r.schedule,
      timeZone: r.timeZone,
      actual: r.actual,
      participants: r.participants,
    },
  });
  if (!parsed.success) return unavailable();
  return {
    id: r.id.toLowerCase(),
    title: parsed.data.values.title,
    description: parsed.data.values.description,
    case_id: parsed.data.values.caseId,
    case_title: r.case_title as string | null,
    status: parsed.data.values.status,
    schedule: parsed.data.values.schedule,
    timeZone: parsed.data.values.timeZone,
    actual: parsed.data.values.actual,
    participants: parsed.data.values.participants,
    revision: r.revision as number,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
export async function listCalendarEvents(
  client: SupabaseClient,
  options: {
    caseId?: string;
    contactId?: string;
    filter?: "all" | "upcoming" | "attention";
    page?: number;
  } = {},
) {
  const page = options.page ?? 1;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > Math.floor(2147483647 / 25) ||
    (options.caseId !== undefined && !uuid(options.caseId)) ||
    (options.contactId !== undefined && !uuid(options.contactId)) ||
    (options.filter !== undefined &&
      !["all", "upcoming", "attention"].includes(options.filter))
  )
    throw new CaseRepositoryError("invalid");
  const { data, error } = await client.rpc("list_recruitment_calendar_events", {
    p_case_id: options.caseId ?? null,
    p_contact_id: options.contactId ?? null,
    p_filter: options.filter ?? "all",
    p_offset: (page - 1) * 25,
    p_limit: 26,
  });
  if (error || !Array.isArray(data)) return unavailable();
  const events = data.slice(0, 25).map(readCalendarEvent);
  if (
    options.caseId &&
    events.some((e) => e.case_id !== options.caseId!.toLowerCase())
  )
    return unavailable();
  if (
    options.contactId &&
    events.some(
      (e) =>
        e.status !== "occurred" ||
        !e.participants.some(
          (p) =>
            p.contactId === options.contactId!.toLowerCase() &&
            p.attendance === "attended",
        ),
    )
  )
    return unavailable();
  return { events, hasMore: data.length > 25, page };
}
export async function getCalendarEvent(client: SupabaseClient, id: string) {
  if (!uuid(id)) throw new CaseRepositoryError("invalid");
  const { data, error } = await client.rpc("get_recruitment_calendar_event", {
    p_event_id: id,
  });
  if (error) return unavailable();
  const event = data === null ? null : readCalendarEvent(data);
  if (event && event.id !== id.toLowerCase()) return unavailable();
  return event;
}
export async function executeCalendarCommand(
  client: SupabaseClient,
  input: CalendarCommandInput,
): Promise<{ kind: "created" | "replayed"; event: CalendarEvent }> {
  const parsed = parseCalendarCommand(input);
  if (!parsed.success) throw new CaseRepositoryError("invalid");
  const { requestId, ...payload } = parsed.data;
  const { data, error } = await client.rpc(
    "execute_recruitment_calendar_command",
    { p_request_id: requestId, p_payload: payload },
  );
  if (error) return fail(error.code);
  if (!data || !["created", "replayed"].includes(data.kind))
    return unavailable();
  const event = readCalendarEvent(data.event);
  if (
    parsed.data.operation !== "create" &&
    (event.id !== parsed.data.eventId ||
      event.revision !== parsed.data.expectedRevision! + 1)
  )
    return unavailable();
  return { kind: data.kind, event };
}
export async function getCalendarByRequestId(
  client: SupabaseClient,
  requestId: string,
) {
  if (!uuid(requestId)) throw new CaseRepositoryError("invalid");
  const { data, error } = await client
    .from("recruitment_calendar_command")
    .select("request_id,payload,after_values")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error || (data && data.request_id !== requestId.toLowerCase()))
    return unavailable();
  if (!data) return { event: null, intent: null };
  const intent = parseCalendarCommand({ requestId, ...data.payload });
  if (!intent.success) return unavailable();
  return { event: readCalendarEvent(data.after_values), intent: intent.data };
}
export async function listCalendarAudit(
  client: SupabaseClient,
  eventId: string,
): Promise<CalendarAudit[]> {
  if (!uuid(eventId)) throw new CaseRepositoryError("invalid");
  const entries: CalendarAudit[] = [];
  for (let start = 0; ; start += 100) {
    const { data, error } = await client
      .from("recruitment_calendar_command")
      .select(
        "id,request_id,event_id,operation,before_values,after_values,recorded_at,closure_id",
      )
      .eq("event_id", eventId)
      .order("recorded_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, start + 99);
    if (error || !Array.isArray(data)) return unavailable();
    for (const row of data) {
      if (
        !uuid(row.id) ||
        !uuid(row.request_id) ||
        row.event_id !== eventId.toLowerCase() ||
        typeof row.operation !== "string" ||
        typeof row.recorded_at !== "string" ||
        !Number.isFinite(Date.parse(row.recorded_at)) ||
        !(row.closure_id === null || uuid(row.closure_id))
      )
        return unavailable();
      const before =
        row.before_values === null
          ? null
          : readCalendarEvent(row.before_values);
      const after = readCalendarEvent(row.after_values);
      if (
        after.id !== eventId.toLowerCase() ||
        (before && before.id !== after.id)
      )
        return unavailable();
      entries.push({
        id: row.id,
        request_id: row.request_id,
        event_id: row.event_id,
        operation: row.operation,
        before,
        after,
        recorded_at: row.recorded_at,
        closure_id: row.closure_id,
      });
    }
    if (data.length < 100) return entries;
  }
}
