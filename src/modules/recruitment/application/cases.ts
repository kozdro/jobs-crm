import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseCreateCaseInput,
  uuidPattern,
  type CreateCaseInput,
  type CreateCaseResult,
  type RecruitmentCase,
} from "../domain/recruitment-case";

const columns =
  "id,title,description,source_url,status,created_at,current_stage,stage_version";
export const casePageSize = 25;

export class CaseRepositoryError extends Error {
  constructor(
    public readonly kind: "unavailable" | "conflict" | "invalid" | "stale",
  ) {
    super("Nie udało się potwierdzić operacji na sprawie.");
    this.name = "CaseRepositoryError";
  }
}

/** Always projects business read fields, never owner/intent identifiers. */
export function readRecruitmentCase(value: unknown): RecruitmentCase {
  if (!value || typeof value !== "object")
    throw new CaseRepositoryError("unavailable");
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !uuidPattern.test(row.id) ||
    typeof row.title !== "string" ||
    !(row.description === null || typeof row.description === "string") ||
    !(row.source_url === null || typeof row.source_url === "string") ||
    (row.status !== "Zapisane" &&
      row.status !== "Kontakt rozpoczęty" &&
      row.status !== "W rekrutacji" &&
      row.status !== "Zakończone") ||
    !Number.isSafeInteger(row.stage_version) ||
    (row.stage_version as number) < 0 ||
    (row.status === "W rekrutacji"
      ? typeof row.current_stage !== "string" ||
        !row.current_stage.trim() ||
        (row.stage_version as number) < 1
      : row.current_stage !== null) ||
    typeof row.created_at !== "string" ||
    !Number.isFinite(Date.parse(row.created_at))
  )
    throw new CaseRepositoryError("unavailable");
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    source_url: row.source_url,
    status: row.status,
    created_at: row.created_at,
    current_stage: row.current_stage as string | null,
    stage_version: row.stage_version as number,
  };
}

/** The create receipt owns the immutable legacy URL; business reads resolve its
 * current projection so an edited or voided link is never displayed as live. */
export async function resolveLegacyCaseLinks<T extends RecruitmentCase>(
  client: SupabaseClient,
  cases: T[],
): Promise<T[]> {
  const ids = cases
    .filter((item) => item.source_url !== null)
    .map((item) => item.id);
  if (!ids.length) return cases;
  const { data, error } = await client
    .from("case_link_current")
    .select("case_id,url")
    .eq("source", "legacy")
    .eq("voided", false)
    .in("case_id", ids);
  if (error || !Array.isArray(data))
    throw new CaseRepositoryError("unavailable");
  const values = new Map<string, string>();
  for (const row of data) {
    if (
      typeof row.case_id !== "string" ||
      !ids.includes(row.case_id) ||
      typeof row.url !== "string" ||
      values.has(row.case_id)
    )
      throw new CaseRepositoryError("unavailable");
    values.set(row.case_id, row.url);
  }
  return cases.map((item) =>
    item.source_url === null
      ? item
      : { ...item, source_url: values.get(item.id) ?? null },
  );
}

/** Client is request-scoped on the server or the official current-user browser SDK. */
export async function createRecruitmentCase(
  client: SupabaseClient,
  input: CreateCaseInput,
): Promise<CreateCaseResult> {
  const parsed = parseCreateCaseInput(input);
  if (!parsed.success) throw new CaseRepositoryError("invalid");
  const { data, error } = await client.rpc("create_recruitment_case", {
    p_request_id: parsed.data.requestId,
    p_title: parsed.data.title,
    p_description: parsed.data.description,
    p_source_url: parsed.data.sourceUrl,
    p_allow_duplicate: parsed.data.allowDuplicate,
  });
  if (error)
    throw new CaseRepositoryError(
      error.code === "PT409"
        ? "conflict"
        : error.code === "22023"
          ? "invalid"
          : "unavailable",
    );
  if (data?.kind === "created" || data?.kind === "replayed")
    return { kind: data.kind, case: readRecruitmentCase(data.case) };
  if (
    data?.kind === "duplicates" &&
    Array.isArray(data.matches) &&
    typeof data.hasMore === "boolean"
  )
    return {
      kind: "duplicates",
      matches: data.matches.map(readRecruitmentCase),
      hasMore: data.hasMore,
    };
  throw new CaseRepositoryError("unavailable");
}

export async function listRecruitmentCases(client: SupabaseClient, page = 1) {
  // PostgREST range is a signed 32-bit offset. Reject malformed/unbounded offsets.
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > Math.floor(2_147_483_647 / casePageSize)
  )
    throw new CaseRepositoryError("invalid");
  const offset = (page - 1) * casePageSize;
  const { data, error } = await client
    .from("recruitment_case")
    .select(columns)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + casePageSize);
  if (error || !Array.isArray(data))
    throw new CaseRepositoryError("unavailable");
  return {
    cases: await resolveLegacyCaseLinks(
      client,
      data.slice(0, casePageSize).map(readRecruitmentCase),
    ),
    hasMore: data.length > casePageSize,
    page,
  };
}

async function findCase(
  client: SupabaseClient,
  column: "id" | "request_id",
  value: string,
) {
  if (!uuidPattern.test(value)) return null;
  const { data, error } = await client
    .from("recruitment_case")
    .select(columns)
    .eq(column, value)
    .maybeSingle();
  if (error) throw new CaseRepositoryError("unavailable");
  if (!data) return null;
  const parsed = readRecruitmentCase(data);
  return column === "id"
    ? (await resolveLegacyCaseLinks(client, [parsed]))[0]
    : parsed;
}
export const getRecruitmentCase = (client: SupabaseClient, id: string) =>
  findCase(client, "id", id);
export const getRecruitmentCaseByRequestId = (
  client: SupabaseClient,
  requestId: string,
) => findCase(client, "request_id", requestId);
