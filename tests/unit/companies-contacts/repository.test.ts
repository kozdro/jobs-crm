import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CatalogError,
  executeCatalogCommand,
  getCatalogCommand,
  getCatalogProfile,
  listCatalogProfiles,
  listCatalogAudit,
  readCatalogRelation,
} from "@/modules/companies-contacts/application/catalog";
const requestId = "11111111-1111-4111-8111-111111111111";
const profile = {
  id: requestId,
  type: "contact" as const,
  name: "Osoba A",
  email: null,
  revision: 0,
  created_at: "2026-10-31T12:00:00Z",
};
const command = {
  requestId,
  operation: "create-profile" as const,
  profileType: "contact" as const,
  name: "  Osoba A ",
};
function fake(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  for (const method of [query.select, query.eq, query.or, query.order])
    method.mockReturnValue(query);
  return {
    client: {
      rpc: vi.fn().mockResolvedValue(result),
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient,
    query,
  };
}
describe("catalog user-scoped repository contract", () => {
  it("sends canonical trimmed intent only to invoker RPC", async () => {
    const { client } = fake({ data: { kind: "saved", profile }, error: null });
    expect(await executeCatalogCommand(client, command)).toEqual({
      kind: "saved",
      profile,
    });
    expect(client.rpc).toHaveBeenCalledWith("execute_catalog_command", {
      p_request_id: requestId,
      p_payload: {
        operation: "create-profile",
        profileType: "contact",
        name: "Osoba A",
        email: null,
      },
    });
  });
  it("keeps replay result distinct and does not retry a mutation itself", async () => {
    const { client } = fake({
      data: { kind: "replayed", profile },
      error: null,
    });
    expect((await executeCatalogCommand(client, command)).kind).toBe(
      "replayed",
    );
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["PT409", "conflict"],
    ["PT412", "stale"],
    ["22023", "invalid"],
    ["42501", "unavailable"],
    ["anything", "unavailable"],
  ])("maps %s without exposing raw errors", async (code, kind) => {
    const { client } = fake({
      data: null,
      error: { code, message: "private data must not escape" },
    });
    await expect(executeCatalogCommand(client, command)).rejects.toMatchObject({
      kind,
      message: "Nie udało się potwierdzić operacji katalogu.",
    });
  });
  it("returns candidate profile versions instead of automatically resolving identity", async () => {
    const result = {
      kind: "duplicates",
      matches: [profile],
      matchToken: [`${requestId}:0`],
    };
    const { client } = fake({ data: result, error: null });
    expect(await executeCatalogCommand(client, command)).toEqual(result);
  });
  it("rejects malformed data and caller authority before a mutation", async () => {
    const { client } = fake({ data: null, error: null });
    await expect(
      executeCatalogCommand(client, { ...command, name: "" }),
    ).rejects.toBeInstanceOf(CatalogError);
    expect(client.rpc).not.toHaveBeenCalled();
    const { client: bad } = fake({
      data: { kind: "saved", profile: { ...profile, revision: -1 } },
      error: null,
    });
    await expect(executeCatalogCommand(bad, command)).rejects.toMatchObject({
      kind: "unavailable",
    });
  });
  it("pages profiles deterministically using an extra row and never silently truncates access", async () => {
    const rows = Array.from({ length: 26 }, () => profile);
    const { client, query } = fake({ data: rows, error: null });
    const result = await listCatalogProfiles(client, "contact", 2);
    expect(result.profiles).toHaveLength(25);
    expect(result.hasMore).toBe(true);
    expect(result.page).toBe(2);
    expect(query.range).toHaveBeenCalledWith(25, 50);
    expect(query.select).toHaveBeenCalledWith(
      "id,type,name,email,revision,created_at",
    );
    await expect(
      listCatalogProfiles(client, "contact", Number.MAX_SAFE_INTEGER),
    ).rejects.toMatchObject({ kind: "invalid" });
  });
  it("treats unavailable and missing profiles differently without leaking another owner", async () => {
    const { client } = fake({ data: null, error: null });
    expect(await getCatalogProfile(client, requestId)).toBeNull();
    await expect(getCatalogProfile(client, "invalid")).rejects.toMatchObject({
      kind: "invalid",
    });
    const { client: bad } = fake({ data: null, error: { code: "42501" } });
    await expect(getCatalogProfile(bad, requestId)).rejects.toMatchObject({
      kind: "unavailable",
    });
  });
  it("recovery only reads existing result and never reapplies an old command", async () => {
    const { client, query } = fake({
      data: { result: { kind: "saved", profile } },
      error: null,
    });
    expect(await getCatalogCommand(client, requestId)).toEqual({
      result: { kind: "saved", profile },
    });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(query.select).toHaveBeenCalledWith("result");
  });
  it("audit reads project history without owner or command payload", async () => {
    const { client, query } = fake({ data: [], error: null });
    expect(await listCatalogAudit(client, requestId)).toEqual({
      audit: [],
      page: 1,
      hasMore: false,
    });
    expect(query.select).toHaveBeenCalledWith(
      "id,request_id,operation,target_id,recorded_at,before_values,after_values",
    );
    expect(query.or).toHaveBeenCalledWith(
      [
        `target_id.eq.${requestId}`,
        `before_values->>left_id.eq.${requestId}`,
        `before_values->>right_id.eq.${requestId}`,
        `after_values->>left_id.eq.${requestId}`,
        `after_values->>right_id.eq.${requestId}`,
      ].join(","),
    );
    // This entry point remains available on either endpoint after detachment.
    expect(query.eq).not.toHaveBeenCalledWith("active", true);
  });
  it("refuses dangling read-side relation labels", () => {
    expect(() =>
      readCatalogRelation({
        id: requestId,
        type: "case-contact",
        left_id: requestId,
        right_id: requestId,
        leftLabel: undefined,
        rightLabel: "A",
        leftType: "case",
        rightType: "contact",
        role: null,
        revision: 0,
        active: true,
      }),
    ).toThrow(CatalogError);
  });
});
