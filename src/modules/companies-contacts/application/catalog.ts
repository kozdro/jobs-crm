import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import {
  catalogPageSize,
  parseCatalogCommand,
  type CatalogCommand,
  type CatalogProfile,
  type CatalogRelation,
  type CatalogResult,
  type CatalogAudit,
  type ProfileType,
} from "../domain/catalog";

export class CatalogError extends Error {
  constructor(
    public readonly kind: "invalid" | "stale" | "conflict" | "unavailable",
  ) {
    super("Nie udało się potwierdzić operacji katalogu.");
  }
}
const profileColumns = "id,type,name,email,revision,created_at";
function unavailable(): never {
  throw new CatalogError("unavailable");
}
function id(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}
export function readCatalogProfile(value: unknown): CatalogProfile {
  if (!value || typeof value !== "object") return unavailable();
  const r = value as CatalogProfile;
  if (
    !id(r.id) ||
    !["organization", "contact"].includes(r.type) ||
    typeof r.name !== "string" ||
    !r.name.trim() ||
    Array.from(r.name).length > 160 ||
    !(r.email === null || typeof r.email === "string") ||
    (r.type === "organization" && r.email !== null) ||
    !Number.isSafeInteger(r.revision) ||
    r.revision < 0 ||
    typeof r.created_at !== "string" ||
    !Number.isFinite(Date.parse(r.created_at))
  )
    return unavailable();
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    email: r.email,
    revision: r.revision,
    created_at: r.created_at,
  };
}
export function readCatalogRelation(value: unknown): CatalogRelation {
  if (!value || typeof value !== "object") return unavailable();
  const r = value as CatalogRelation;
  if (
    ![r.id, r.left_id, r.right_id].every(id) ||
    !["case-organization", "case-contact", "organization-contact"].includes(
      r.type,
    ) ||
    typeof r.leftLabel !== "string" ||
    typeof r.rightLabel !== "string" ||
    !["case", "organization"].includes(r.leftType) ||
    !["organization", "contact"].includes(r.rightType) ||
    ![null, "employer", "agency"].includes(r.role) ||
    typeof r.active !== "boolean" ||
    !Number.isSafeInteger(r.revision) ||
    r.revision < 0
  )
    return unavailable();
  return {
    id: r.id,
    type: r.type,
    left_id: r.left_id,
    right_id: r.right_id,
    leftLabel: r.leftLabel,
    rightLabel: r.rightLabel,
    leftType: r.leftType,
    rightType: r.rightType,
    role: r.role,
    active: r.active,
    revision: r.revision,
  };
}
function readResult(value: unknown): CatalogResult {
  if (!value || typeof value !== "object") return unavailable();
  const r = value as Record<string, unknown>;
  if (r.kind === "saved" || r.kind === "replayed") {
    if (r.profile && !r.relation)
      return { kind: r.kind, profile: readCatalogProfile(r.profile) };
    if (r.relation && !r.profile)
      return { kind: r.kind, relation: readCatalogRelation(r.relation) };
  }
  if (
    r.kind === "duplicates" &&
    Array.isArray(r.matches) &&
    Array.isArray(r.matchToken) &&
    r.matchToken.every((x) => typeof x === "string")
  )
    return {
      kind: "duplicates",
      matches: r.matches.map(readCatalogProfile),
      matchToken: r.matchToken,
    };
  return unavailable();
}
export async function executeCatalogCommand(
  client: SupabaseClient,
  input: CatalogCommand,
): Promise<CatalogResult> {
  const parsed = parseCatalogCommand(input);
  if (!parsed) throw new CatalogError("invalid");
  const { requestId, ...payload } = parsed;
  const { data, error } = await client.rpc("execute_catalog_command", {
    p_request_id: requestId,
    p_payload: payload,
  });
  if (error)
    throw new CatalogError(
      error.code === "PT409" || error.code === "23505"
        ? "conflict"
        : error.code === "PT412"
          ? "stale"
          : error.code === "22023"
            ? "invalid"
            : "unavailable",
    );
  return readResult(data);
}
function pageRange(page: number) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > Math.floor(2147483647 / catalogPageSize)
  )
    throw new CatalogError("invalid");
  const start = (page - 1) * catalogPageSize;
  return [start, start + catalogPageSize] as const;
}
export async function listCatalogProfiles(
  client: SupabaseClient,
  type: ProfileType,
  page = 1,
) {
  if (type !== "organization" && type !== "contact")
    throw new CatalogError("invalid");
  const [start, end] = pageRange(page);
  const { data, error } = await client
    .from("catalog_profile")
    .select(profileColumns)
    .eq("type", type)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, end);
  if (error || !Array.isArray(data)) return unavailable();
  return {
    profiles: data.slice(0, catalogPageSize).map(readCatalogProfile),
    page,
    hasMore: data.length > catalogPageSize,
  };
}
export async function getCatalogProfile(
  client: SupabaseClient,
  profileId: string,
) {
  if (!id(profileId)) throw new CatalogError("invalid");
  const { data, error } = await client
    .from("catalog_profile")
    .select(profileColumns)
    .eq("id", profileId)
    .maybeSingle();
  if (error) return unavailable();
  return data ? readCatalogProfile(data) : null;
}
export async function listCatalogRelations(
  client: SupabaseClient,
  contextType: "case" | ProfileType,
  contextId: string,
  page = 1,
) {
  if (
    !id(contextId) ||
    !["case", "organization", "contact"].includes(contextType)
  )
    throw new CatalogError("invalid");
  const [start, end] = pageRange(page);
  const column =
    contextType === "case"
      ? "case_id"
      : contextType === "organization"
        ? "organization_id"
        : "contact_id";
  const { data, error } = await client
    .from("catalog_relation")
    .select("id,type,case_id,organization_id,contact_id,role,active,revision")
    .eq(column, contextId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, end);
  if (error || !Array.isArray(data)) return unavailable();
  const rows = data.slice(0, catalogPageSize);
  const profileIds = [
    ...new Set(
      rows
        .flatMap((r) => [r.organization_id, r.contact_id])
        .filter((x): x is string => typeof x === "string"),
    ),
  ];
  const caseIds = [
    ...new Set(
      rows
        .map((r) => r.case_id)
        .filter((x): x is string => typeof x === "string"),
    ),
  ];
  const profiles = profileIds.length
    ? await client
        .from("catalog_profile")
        .select("id,name,type")
        .in("id", profileIds)
    : { data: [], error: null };
  const cases = caseIds.length
    ? await client.from("recruitment_case").select("id,title").in("id", caseIds)
    : { data: [], error: null };
  if (profiles.error || cases.error || !profiles.data || !cases.data)
    return unavailable();
  const pmap = new Map(profiles.data.map((p) => [p.id, p.name]));
  const cmap = new Map(cases.data.map((c) => [c.id, c.title]));
  const relations = rows.map((r) =>
    readCatalogRelation({
      id: r.id,
      type: r.type,
      left_id: r.case_id ?? r.organization_id,
      right_id:
        r.type === "case-organization" ? r.organization_id : r.contact_id,
      leftLabel: r.case_id ? cmap.get(r.case_id) : pmap.get(r.organization_id),
      rightLabel: pmap.get(
        r.type === "case-organization" ? r.organization_id : r.contact_id,
      ),
      leftType: r.case_id ? "case" : "organization",
      rightType: r.type === "case-organization" ? "organization" : "contact",
      role: r.role,
      active: r.active,
      revision: r.revision,
    }),
  );
  return { relations, page, hasMore: data.length > catalogPageSize };
}
export async function listCatalogAudit(
  client: SupabaseClient,
  targetId: string,
  page = 1,
) {
  if (!id(targetId)) throw new CatalogError("invalid");
  const [start, end] = pageRange(page);
  const { data, error } = await client
    .from("catalog_command")
    .select(
      "id,request_id,operation,target_id,recorded_at,before_values,after_values",
    )
    // UUID validated above: this filter contains no user-controlled PostgREST syntax.
    // Direct endpoints only; a case-contact link never infers event participation.
    .or(
      [
        `target_id.eq.${targetId}`,
        `before_values->>left_id.eq.${targetId}`,
        `before_values->>right_id.eq.${targetId}`,
        `after_values->>left_id.eq.${targetId}`,
        `after_values->>right_id.eq.${targetId}`,
      ].join(","),
    )
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, end);
  if (error || !Array.isArray(data)) return unavailable();
  return {
    audit: data.slice(0, catalogPageSize) as CatalogAudit[],
    page,
    hasMore: data.length > catalogPageSize,
  };
}
export async function getCatalogCommand(
  client: SupabaseClient,
  requestId: string,
) {
  if (!id(requestId)) throw new CatalogError("invalid");
  const { data, error } = await client
    .from("catalog_command")
    .select("result")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) return unavailable();
  return { result: data ? readResult(data.result) : null };
}
