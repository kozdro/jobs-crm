import type { SupabaseClient } from "@supabase/supabase-js";
import { CaseRepositoryError } from "./cases";
import { readEvent } from "./case-events";
import { uuidPattern } from "../domain/recruitment-case";
import { isCalendarDate, type CaseEvent } from "../domain/case-events";
import {
  closureOutcomes,
  isOfferOutcome,
  parseLifecycleInput,
  type LifecycleInput,
  type ConfirmLifecycleInput,
  type ClosureValues,
  type LifecyclePreview,
  type LifecycleEntry,
  type ClosureRevision,
  type LifecycleStatus,
} from "../domain/lifecycle";
export type TimelineItem =
  | { type: "fact"; fact: CaseEvent }
  | { type: "lifecycle"; entry: LifecycleEntry };
const statuses: LifecycleStatus[] = [
  "Zapisane",
  "Kontakt rozpoczęty",
  "W rekrutacji",
  "Zakończone",
];
const uuid = (v: unknown): v is string =>
  typeof v === "string" && uuidPattern.test(v);
const number = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v < 2147483647;
const date = (v: unknown): v is string | null =>
  v === null || (typeof v === "string" && isCalendarDate(v));
const instant = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const stage = (v: unknown) =>
  v === null || (typeof v === "string" && !!v.trim());
const status = (v: unknown) => statuses.includes(v as LifecycleStatus);
const unavailable = (): never => {
  throw new CaseRepositoryError("unavailable");
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return unavailable();
  return value as Record<string, unknown>;
}
export function readClosureValues(value: unknown): ClosureValues {
  const r = object(value);
  if (
    !closureOutcomes.includes(r.outcome as ClosureValues["outcome"]) ||
    !date(r.occurredOn) ||
    typeof r.offerConfirmed !== "boolean" ||
    r.offerConfirmed !== isOfferOutcome(r.outcome)
  )
    return unavailable();
  return {
    outcome: r.outcome as ClosureValues["outcome"],
    occurredOn: r.occurredOn,
    offerConfirmed: r.offerConfirmed,
  };
}
export function readLifecyclePreview(value: unknown): LifecyclePreview {
  const r = object(value);
  if (
    !number(r.caseRevision) ||
    !number(r.closureRevision) ||
    !number(r.cycle) ||
    !status(r.status) ||
    !stage(r.currentStage) ||
    (r.status === "W rekrutacji"
      ? r.currentStage === null
      : r.currentStage !== null)
  )
    return unavailable();
  return {
    caseRevision: r.caseRevision,
    closureRevision: r.closureRevision,
    cycle: r.cycle,
    status: r.status as LifecycleStatus,
    currentStage: r.currentStage as string | null,
    before: r.before === null ? null : readClosureValues(r.before),
    after: r.after === null ? null : readClosureValues(r.after),
  };
}
export function readLifecycleEntry(value: unknown): LifecycleEntry {
  const r = object(value);
  if (
    ![r.id, r.request_id, r.case_id].every(uuid) ||
    !number(r.expected_case_revision) ||
    !["close", "reopen"].includes(r.kind as string) ||
    !number(r.cycle) ||
    !number(r.revision) ||
    !date(r.occurred_on) ||
    !instant(r.recorded_at) ||
    !status(r.previous_status) ||
    !status(r.resulting_status) ||
    !stage(r.previous_stage) ||
    !stage(r.resulting_stage) ||
    typeof r.offer_confirmed !== "boolean"
  )
    return unavailable();
  if (
    r.kind === "close"
      ? r.previous_status === "Zakończone" ||
        r.resulting_status !== "Zakończone" ||
        r.resulting_stage !== null
      : r.previous_status !== "Zakończone" ||
        r.previous_stage !== null ||
        r.resulting_status === "Zakończone" ||
        r.outcome !== null ||
        r.offer_confirmed !== false ||
        r.original !== null ||
        r.revision !== 0
  )
    return unavailable();
  if (
    (r.resulting_status === "W rekrutacji") !== (r.resulting_stage !== null) ||
    (r.previous_status === "W rekrutacji") !== (r.previous_stage !== null)
  )
    return unavailable();
  const original = r.kind === "close" ? readClosureValues(r.original) : null;
  if (r.kind === "close")
    readClosureValues({
      outcome: r.outcome,
      occurredOn: r.occurred_on,
      offerConfirmed: r.offer_confirmed,
    });
  return {
    id: r.id as string,
    request_id: r.request_id as string,
    case_id: r.case_id as string,
    kind: r.kind as LifecycleEntry["kind"],
    cycle: r.cycle as number,
    occurred_on: r.occurred_on as string | null,
    recorded_at: r.recorded_at as string,
    outcome: r.outcome as LifecycleEntry["outcome"],
    offer_confirmed: r.offer_confirmed as boolean,
    previous_status: r.previous_status as LifecycleStatus,
    previous_stage: r.previous_stage as string | null,
    resulting_status: r.resulting_status as LifecycleStatus,
    resulting_stage: r.resulting_stage as string | null,
    revision: r.revision as number,
    expected_case_revision: r.expected_case_revision as number,
    original,
  };
}
export function readClosureRevision(value: unknown): ClosureRevision {
  const r = object(value);
  if (
    ![r.id, r.request_id, r.case_id, r.closure_id].every(uuid) ||
    !number(r.revision) ||
    !number(r.expected_case_revision) ||
    !number(r.expected_closure_revision) ||
    r.revision !== r.expected_closure_revision + 1 ||
    !instant(r.recorded_at)
  )
    return unavailable();
  return {
    id: r.id as string,
    request_id: r.request_id as string,
    case_id: r.case_id as string,
    closure_id: r.closure_id as string,
    revision: r.revision as number,
    recorded_at: r.recorded_at,
    expected_case_revision: r.expected_case_revision as number,
    expected_closure_revision: r.expected_closure_revision as number,
    before: readClosureValues(r.before),
    after: readClosureValues(r.after),
  };
}
function rpcInput(input: LifecycleInput) {
  return {
    p_case_id: input.caseId,
    p_operation: input.operation,
    p_closure_id: input.closureId,
    p_outcome: input.outcome,
    p_occurred_on: input.occurredOn,
    p_offer_confirmed: input.offerConfirmed,
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
export async function previewLifecycle(
  client: SupabaseClient,
  input: LifecycleInput,
): Promise<LifecyclePreview> {
  const parsed = parseLifecycleInput(input);
  if (!parsed.success) throw new CaseRepositoryError("invalid");
  const { data, error } = await client.rpc(
    "preview_recruitment_case_lifecycle",
    rpcInput(parsed.data),
  );
  if (error) rpcError(error.code);
  return readLifecyclePreview(data);
}
export async function confirmLifecycle(
  client: SupabaseClient,
  input: ConfirmLifecycleInput,
): Promise<{
  kind: "created" | "replayed";
  entry: LifecycleEntry | null;
  revision: ClosureRevision | null;
}> {
  const parsed = parseLifecycleInput(input, true);
  if (!parsed.success || !("requestId" in parsed.data))
    throw new CaseRepositoryError("invalid");
  const { data, error } = await client.rpc(
    "confirm_recruitment_case_lifecycle",
    {
      ...rpcInput(parsed.data),
      p_request_id: parsed.data.requestId,
      p_expected_case_revision: parsed.data.expectedCaseRevision,
      p_expected_closure_revision: parsed.data.expectedClosureRevision,
    },
  );
  if (error) rpcError(error.code);
  if (data?.kind !== "created" && data?.kind !== "replayed")
    return unavailable();
  const entry = data.entry === null ? null : readLifecycleEntry(data.entry);
  const revision =
    data.revision === null ? null : readClosureRevision(data.revision);
  if (input.operation === "correct-closure") {
    if (
      entry ||
      !revision ||
      revision.case_id !== input.caseId ||
      revision.closure_id !== input.closureId ||
      revision.request_id !== input.requestId ||
      revision.expected_case_revision !== input.expectedCaseRevision ||
      revision.expected_closure_revision !== input.expectedClosureRevision ||
      revision.after.outcome !== input.outcome ||
      revision.after.occurredOn !== input.occurredOn ||
      revision.after.offerConfirmed !== input.offerConfirmed
    )
      return unavailable();
  } else if (
    revision ||
    !entry ||
    entry.case_id !== input.caseId ||
    entry.kind !== input.operation ||
    entry.request_id !== input.requestId ||
    entry.expected_case_revision !== input.expectedCaseRevision ||
    entry.outcome !== input.outcome ||
    entry.occurred_on !== input.occurredOn ||
    entry.offer_confirmed !== input.offerConfirmed
  )
    return unavailable();
  return { kind: data.kind, entry, revision };
}
const entryColumns =
  "id,request_id,case_id,kind,cycle,occurred_on,recorded_at,outcome,offer_confirmed,previous_status,previous_stage,resulting_status,resulting_stage,revision,original,expected_case_revision";
const revisionColumns =
  "id,request_id,case_id,closure_id,revision,recorded_at,before:before_values,after:after_values,expected_case_revision,expected_closure_revision";
function pageRange(caseId: string, page: number) {
  if (
    !uuid(caseId) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > Math.floor(2147483647 / 25)
  )
    throw new CaseRepositoryError("invalid");
  return (page - 1) * 25;
}
export async function listLifecycleEntries(
  client: SupabaseClient,
  caseId: string,
  page = 1,
) {
  const offset = pageRange(caseId, page);
  const { data, error } = await client
    .from("recruitment_case_lifecycle_current")
    .select(entryColumns)
    .eq("case_id", caseId)
    .order("occurred_on", { ascending: false, nullsFirst: false })
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + 25);
  if (error || !Array.isArray(data)) return unavailable();
  const entries = data.slice(0, 25).map(readLifecycleEntry);
  if (entries.some((e) => e.case_id !== caseId)) return unavailable();
  return { entries, hasMore: data.length > 25, page };
}
export async function listRecruitmentTimeline(
  client: SupabaseClient,
  caseId: string,
  page = 1,
) {
  const offset = pageRange(caseId, page);
  const { data, error } = await client
    .from("recruitment_case_timeline")
    .select("type,payload")
    .eq("case_id", caseId)
    .order("occurred_on", { ascending: false, nullsFirst: false })
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + 25);
  if (error || !Array.isArray(data)) return unavailable();
  const entries: TimelineItem[] = data.slice(0, 25).map((row) => {
    if (row.type === "fact") {
      const fact = readEvent(row.payload);
      if (fact.case_id !== caseId) return unavailable();
      return { type: "fact", fact };
    }
    if (row.type === "lifecycle") {
      const entry = readLifecycleEntry(row.payload);
      if (entry.case_id !== caseId) return unavailable();
      return { type: "lifecycle", entry };
    }
    return unavailable();
  });
  return { entries, hasMore: data.length > 25, page };
}
export async function listClosureRevisions(
  client: SupabaseClient,
  caseId: string,
  closureId: string,
) {
  if (!uuid(caseId) || !uuid(closureId))
    throw new CaseRepositoryError("invalid");
  const revisions: ClosureRevision[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client
      .from("recruitment_closure_revision")
      .select(revisionColumns)
      .eq("case_id", caseId)
      .eq("closure_id", closureId)
      .order("revision", { ascending: true })
      .range(offset, offset + 99);
    if (error || !Array.isArray(data)) return unavailable();
    for (const raw of data) {
      const r = readClosureRevision(raw);
      if (r.case_id !== caseId || r.closure_id !== closureId)
        return unavailable();
      revisions.push(r);
    }
    if (data.length < 100) return revisions.reverse();
  }
}
export async function getLifecycleByRequestId(
  client: SupabaseClient,
  caseId: string,
  requestId: string,
) {
  if (!uuid(caseId) || !uuid(requestId))
    throw new CaseRepositoryError("invalid");
  const { data: l, error: le } = await client
    .from("recruitment_case_lifecycle")
    .select(
      "id,request_id,case_id,kind,cycle,occurred_on,recorded_at,outcome,offer_confirmed,previous_status,previous_stage,resulting_status,resulting_stage,expected_case_revision",
    )
    .eq("case_id", caseId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (le) return unavailable();
  const { data: r, error: re } = await client
    .from("recruitment_closure_revision")
    .select(revisionColumns)
    .eq("case_id", caseId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (re) return unavailable();
  if (l && r) return unavailable();
  const entry = l
    ? readLifecycleEntry({
        ...l,
        revision: 0,
        original:
          l.kind === "close"
            ? {
                outcome: l.outcome,
                occurredOn: l.occurred_on,
                offerConfirmed: l.offer_confirmed,
              }
            : null,
      })
    : null;
  const revision = r ? readClosureRevision(r) : null;
  if (
    (entry?.case_id &&
      (entry.case_id !== caseId || entry.request_id !== requestId)) ||
    (revision?.case_id &&
      (revision.case_id !== caseId || revision.request_id !== requestId))
  )
    return unavailable();
  return { entry, revision };
}
