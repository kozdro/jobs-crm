import type { SupabaseClient } from "@supabase/supabase-js";
import { CaseRepositoryError } from "./cases";
import { listRecruitmentTimeline } from "./lifecycle";
import {
  recruitmentStatuses,
  uuidPattern,
  type RecruitmentCase,
} from "../domain/recruitment-case";
import {
  parseWorkspaceQuery,
  workspacePage,
  workspacePageSize,
  workspaceSearchParams,
  type WorkspaceCase,
  type WorkspaceData,
  type WorkspaceOrganization,
  type WorkspacePage,
  type WorkspacePreview,
  type WorkspaceProfilePage,
  type WorkspaceQuery,
  type WorkspaceStatus,
} from "../domain/workspace";

const caseColumns =
  "id,title,description,source_url,status,created_at,current_stage,stage_version";
// Explicit FK hints avoid ambiguity between contact and organization references.
const organizationEmbed =
  "organizations:catalog_relation!catalog_relation_owned_case_fk(id,role,organization_id,profile:catalog_profile!catalog_relation_owned_org_fk(id,name))";
function unavailable(): never {
  throw new CaseRepositoryError("unavailable");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return unavailable();
  return value as Record<string, unknown>;
}
function id(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}
function profile(value: unknown): { id: string; name: string } {
  const r = object(value);
  if (!id(r.id) || typeof r.name !== "string" || !r.name.trim())
    return unavailable();
  return { id: r.id, name: r.name };
}
function readCase(value: unknown): WorkspaceCase {
  const r = object(value);
  if (
    !id(r.id) ||
    typeof r.title !== "string" ||
    !r.title.trim() ||
    !(r.description === null || typeof r.description === "string") ||
    !(r.source_url === null || typeof r.source_url === "string") ||
    !recruitmentStatuses.includes(r.status as WorkspaceStatus) ||
    typeof r.created_at !== "string" ||
    !Number.isFinite(Date.parse(r.created_at)) ||
    !Number.isSafeInteger(r.stage_version) ||
    (r.stage_version as number) < 0 ||
    (r.status === "W rekrutacji"
      ? typeof r.current_stage !== "string" || !r.current_stage.trim()
      : r.current_stage !== null) ||
    !Array.isArray(r.organizations)
  )
    return unavailable();
  const organizations = r.organizations.slice(0, 5).map((value) => {
    const relation = object(value);
    const p = profile(relation.profile);
    if (
      relation.organization_id !== p.id ||
      (relation.role !== "employer" && relation.role !== "agency")
    )
      return unavailable();
    return { ...p, role: relation.role } as WorkspaceOrganization;
  });
  return {
    id: r.id,
    title: r.title,
    description: r.description as string | null,
    source_url: r.source_url as string | null,
    status: r.status as RecruitmentCase["status"],
    created_at: r.created_at,
    current_stage: r.current_stage as string | null,
    stage_version: r.stage_version as number,
    organizations,
    organizationsHasMore: r.organizations.length > 5,
  };
}
/** User-scoped parent query: !inner applies filters BEFORE parent pagination.
 * Separate aliases permit organization AND contact without duplicating cases.
 * Display relations use a separate left embedding so filters don't hide labels.
 */
async function readPage(
  client: SupabaseClient,
  query: WorkspaceQuery,
  statuses: WorkspaceStatus[],
  page: number,
): Promise<WorkspacePage> {
  if (!statuses.length) return { cases: [], hasMore: false, page };
  let selection = `${caseColumns},${organizationEmbed}`;
  if (query.organizationId)
    selection +=
      ",orgFilter:catalog_relation!catalog_relation_owned_case_fk!inner(id)";
  if (query.contactId)
    selection +=
      ",contactFilter:catalog_relation!catalog_relation_owned_case_fk!inner(id)";
  let request = client
    .from("recruitment_case")
    .select(selection)
    .in("status", statuses)
    .eq("organizations.type", "case-organization")
    .eq("organizations.active", true);
  if (query.organizationId)
    request = request
      .eq("orgFilter.type", "case-organization")
      .eq("orgFilter.active", true)
      .eq("orgFilter.organization_id", query.organizationId)
      .limit(1, { referencedTable: "orgFilter" });
  if (query.contactId)
    request = request
      .eq("contactFilter.type", "case-contact")
      .eq("contactFilter.active", true)
      .eq("contactFilter.contact_id", query.contactId)
      .limit(1, { referencedTable: "contactFilter" });
  const offset = (page - 1) * workspacePageSize;
  const ascending = query.sort === "oldest";
  const { data, error } = await request
    .order("created_at", { ascending })
    .order("id", { ascending })
    .order("id", { ascending: true, referencedTable: "organizations" })
    .limit(6, { referencedTable: "organizations" })
    .range(offset, offset + workspacePageSize);
  if (error || !Array.isArray(data)) return unavailable();
  const cases = data.slice(0, workspacePageSize).map(readCase);
  if (cases.some((c) => !statuses.includes(c.status))) return unavailable();
  return { cases, hasMore: data.length > workspacePageSize, page };
}
export async function loadWorkspace(
  client: SupabaseClient,
  input: WorkspaceQuery,
): Promise<WorkspaceData> {
  let query: WorkspaceQuery;
  try {
    query = parseWorkspaceQuery(workspaceSearchParams(input));
  } catch {
    throw new CaseRepositoryError("invalid");
  }
  if (query.view === "list")
    return {
      query,
      list: await readPage(client, query, query.statuses, query.page),
      columns: {},
    };
  const columns: WorkspaceData["columns"] = {};
  await Promise.all(
    recruitmentStatuses.map(async (status) => {
      if (!query.statuses.includes(status)) return;
      columns[status] = await readPage(
        client,
        query,
        [status],
        query.columnPages[status],
      );
    }),
  );
  return { query, list: null, columns };
}
/** Bounded preview; full detail remains the path to all related rows/history. */
export async function loadWorkspacePreview(
  client: SupabaseClient,
  caseId: string,
): Promise<WorkspacePreview | null> {
  if (!id(caseId)) throw new CaseRepositoryError("invalid");
  const { data, error } = await client
    .from("recruitment_case")
    .select(`${caseColumns},${organizationEmbed}`)
    .eq("id", caseId)
    .eq("organizations.type", "case-organization")
    .eq("organizations.active", true)
    .order("id", { ascending: true, referencedTable: "organizations" })
    .limit(6, { referencedTable: "organizations" })
    .maybeSingle();
  if (error) return unavailable();
  if (!data) return null;
  const item = readCase(data);
  const [contactResult, timeline] = await Promise.all([
    client
      .from("catalog_relation")
      .select(
        "contact_id,profile:catalog_profile!catalog_relation_owned_contact_fk(id,name)",
      )
      .eq("case_id", caseId)
      .eq("type", "case-contact")
      .eq("active", true)
      .order("id", { ascending: true })
      .range(0, workspacePageSize),
    listRecruitmentTimeline(client, caseId),
  ]);
  if (contactResult.error || !Array.isArray(contactResult.data))
    return unavailable();
  const contacts = contactResult.data.slice(0, workspacePageSize).map((raw) => {
    const relation = object(raw);
    const p = profile(relation.profile);
    if (relation.contact_id !== p.id) return unavailable();
    return p;
  });
  return {
    case: item,
    contacts,
    history: timeline.entries.slice(0, 5),
    hasMoreHistory: timeline.hasMore || timeline.entries.length > 5,
    organizationsHasMore: item.organizationsHasMore,
    contactsHasMore: contactResult.data.length > workspacePageSize,
  };
}
export async function listWorkspaceProfiles(
  client: SupabaseClient,
  type: "organization" | "contact",
  page = 1,
  profileId: string | null = null,
): Promise<WorkspaceProfilePage> {
  try {
    workspacePage(String(page));
  } catch {
    throw new CaseRepositoryError("invalid");
  }
  if (
    !["organization", "contact"].includes(type) ||
    (profileId !== null && !id(profileId))
  )
    throw new CaseRepositoryError("invalid");
  let query = client.from("catalog_profile").select("id,name").eq("type", type);
  if (profileId) query = query.eq("id", profileId);
  const offset = (page - 1) * workspacePageSize;
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + workspacePageSize);
  if (error || !Array.isArray(data)) return unavailable();
  return {
    profiles: data.slice(0, workspacePageSize).map(profile),
    hasMore: data.length > workspacePageSize,
    page,
  };
}
