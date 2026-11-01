import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultWorkspaceQuery,
  parseWorkspaceQuery,
  workspacePage,
  workspaceSearchParams,
} from "@/modules/recruitment/domain/workspace";
import {
  loadWorkspace,
  loadWorkspacePreview,
  listWorkspaceProfiles,
} from "@/modules/recruitment/application/workspace-read";
const id = "11111111-1111-4111-8111-111111111111";
const orgId = "22222222-2222-4222-8222-222222222222";
const contactId = "33333333-3333-4333-8333-333333333333";
const row = {
  id,
  title: "Sprawa",
  description: null,
  source_url: null,
  status: "Zapisane",
  created_at: "2026-10-31T12:00:00Z",
  current_stage: null,
  stage_version: 0,
  organizations: [],
};
function fake(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    in: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    range: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  for (const method of [
    query.select,
    query.in,
    query.eq,
    query.order,
    query.limit,
  ])
    method.mockReturnValue(query);
  return {
    query,
    client: {
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient,
  };
}
describe("workspace read query", () => {
  it("defaults to all statuses, board, newest, first pages, closed collapsed", () => {
    const q = parseWorkspaceQuery(new URLSearchParams());
    expect(q).toEqual(defaultWorkspaceQuery());
    expect(q.statuses).toHaveLength(4);
  });
  it("roundtrips all return-context state without content or invented defaults", () => {
    const q = defaultWorkspaceQuery();
    q.view = "list";
    q.sort = "oldest";
    q.statuses = ["Zapisane", "W rekrutacji"];
    q.organizationId = orgId;
    q.contactId = contactId;
    q.page = 7;
    q.columnPages["Kontakt rozpoczęty"] = 4;
    q.closedOpen = true;
    expect(parseWorkspaceQuery(workspaceSearchParams(q))).toEqual(q);
  });
  it("represents no selected statuses without silently restoring all", () => {
    const q = defaultWorkspaceQuery();
    q.statuses = [];
    expect(parseWorkspaceQuery(workspaceSearchParams(q)).statuses).toEqual([]);
  });
  it.each([
    "view=bogus",
    "sort=activity",
    "organization=not-an-id",
    "contact=x",
    "status=Wstrzymane",
    "status=Zapisane&status=Zapisane",
    "status=none&status=Zapisane",
    "sort=newest&sort=oldest",
    "page=0",
    "page=-1",
    "page=1.5",
    "page=01",
    "page=999999999999",
    "savedPage=NaN",
    "contactPage=0",
    "closedOpen=yes",
  ])("rejects malformed query %s", (value) => {
    expect(() => parseWorkspaceQuery(new URLSearchParams(value))).toThrow();
  });
  it("bounds PostgREST offsets", () => {
    expect(workspacePage("85899345")).toBe(85899345);
    expect(() => workspacePage("85899346")).toThrow();
  });
});
describe("workspace user-scoped repository", () => {
  it("filters parent rows by both direct active relations before page range", async () => {
    const { client, query } = fake([row]);
    const input = {
      ...defaultWorkspaceQuery(),
      view: "list" as const,
      organizationId: orgId,
      contactId,
      page: 3,
    };
    const result = await loadWorkspace(client, input);
    expect(result.list?.cases.map((x) => x.id)).toEqual([id]);
    expect(query.select.mock.calls[0][0]).toContain(
      "orgFilter:catalog_relation!catalog_relation_owned_case_fk!inner(id)",
    );
    expect(query.select.mock.calls[0][0]).toContain(
      "contactFilter:catalog_relation!catalog_relation_owned_case_fk!inner(id)",
    );
    expect(query.eq).toHaveBeenCalledWith("orgFilter.organization_id", orgId);
    expect(query.eq).toHaveBeenCalledWith(
      "contactFilter.contact_id",
      contactId,
    );
    expect(query.eq).toHaveBeenCalledWith("orgFilter.active", true);
    expect(query.eq).toHaveBeenCalledWith("contactFilter.active", true);
    expect(query.range).toHaveBeenCalledWith(50, 75);
    expect(query.eq.mock.invocationCallOrder.at(-1)).toBeLessThan(
      query.range.mock.invocationCallOrder[0],
    );
  });
  it("keeps page sentinel out of the UI and does not claim completeness", async () => {
    const { client } = fake(Array.from({ length: 26 }, () => row));
    const result = await loadWorkspace(client, {
      ...defaultWorkspaceQuery(),
      view: "list",
    });
    expect(result.list?.cases).toHaveLength(25);
    expect(result.list?.hasMore).toBe(true);
  });
  it("keeps both organization roles without choosing a primary identity", async () => {
    const organizations = ["employer", "agency"].map((role) => ({
      organization_id: orgId,
      role,
      profile: { id: orgId, name: "Organizacja" },
    }));
    const { client } = fake([{ ...row, organizations }]);
    const result = await loadWorkspace(client, {
      ...defaultWorkspaceQuery(),
      view: "list",
    });
    expect(result.list?.cases[0].organizations).toEqual([
      { id: orgId, name: "Organizacja", role: "employer" },
      { id: orgId, name: "Organizacja", role: "agency" },
    ]);
  });
  it("marks bounded organization labels as a fragment", async () => {
    const organizations = Array.from({ length: 6 }, () => ({
      organization_id: orgId,
      role: "agency",
      profile: { id: orgId, name: "Organizacja" },
    }));
    const { client } = fake([{ ...row, organizations }]);
    const result = await loadWorkspace(client, {
      ...defaultWorkspaceQuery(),
      view: "list",
    });
    expect(result.list?.cases[0].organizations).toHaveLength(5);
    expect(result.list?.cases[0].organizationsHasMore).toBe(true);
  });
  it("uses stable technical date/id ordering in both directions", async () => {
    const { client, query } = fake([row]);
    await loadWorkspace(client, {
      ...defaultWorkspaceQuery(),
      view: "list",
      sort: "oldest",
    });
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
  });
  it("paginates selected board columns independently", async () => {
    const { client, query } = fake([row]);
    const q = defaultWorkspaceQuery();
    q.statuses = ["Zapisane"];
    q.columnPages.Zapisane = 2;
    const result = await loadWorkspace(client, q);
    expect(result.list).toBeNull();
    expect(Object.keys(result.columns)).toEqual(["Zapisane"]);
    expect(query.range).toHaveBeenCalledExactlyOnceWith(25, 50);
  });
  it("empty status selection does not read the database", async () => {
    const { client } = fake([]);
    const result = await loadWorkspace(client, {
      ...defaultWorkspaceQuery(),
      view: "list",
      statuses: [],
    });
    expect(result.list?.cases).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });
  it("rejects provider errors instead of rendering an empty success", async () => {
    const { client } = fake(null, { message: "private provider data" });
    await expect(
      loadWorkspace(client, defaultWorkspaceQuery()),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
  it("rejects inconsistent relation profiles", async () => {
    const { client } = fake([
      {
        ...row,
        organizations: [
          { organization_id: orgId, role: "employer", profile: null },
        ],
      },
    ]);
    await expect(
      loadWorkspace(client, defaultWorkspaceQuery()),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
  it("inaccessible preview is null and does not query secondary private data", async () => {
    const { client } = fake(null);
    expect(await loadWorkspacePreview(client, id)).toBeNull();
    expect(client.from).toHaveBeenCalledExactlyOnceWith("recruitment_case");
  });
  it("invalid preview never queries the database", async () => {
    const { client } = fake(null);
    await expect(loadWorkspacePreview(client, "x")).rejects.toMatchObject({
      kind: "invalid",
    });
    expect(client.from).not.toHaveBeenCalled();
  });
  it("profiles beyond first page remain reachable without returning email or owner", async () => {
    const { client, query } = fake([{ id: orgId, name: "Organizacja" }]);
    const result = await listWorkspaceProfiles(client, "organization", 2);
    expect(result.profiles).toEqual([{ id: orgId, name: "Organizacja" }]);
    expect(query.select).toHaveBeenCalledWith("id,name");
    expect(query.range).toHaveBeenCalledWith(25, 50);
  });
  it("exact selected profile lookup is still owner scoped by RLS and type", async () => {
    const { client, query } = fake([]);
    expect(
      (await listWorkspaceProfiles(client, "contact", 1, contactId)).profiles,
    ).toEqual([]);
    expect(query.eq).toHaveBeenCalledWith("id", contactId);
    expect(query.eq).toHaveBeenCalledWith("type", "contact");
  });
});
