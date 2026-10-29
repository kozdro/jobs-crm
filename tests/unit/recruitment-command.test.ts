import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  getAuthConfig: vi.fn(),
  getRouteClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/shared/server/env", () => ({ getAuthConfig: mocks.getAuthConfig }));
vi.mock("@/modules/identity/infrastructure/server", () => ({
  getRouteClient: mocks.getRouteClient,
}));
import { POST } from "@/app/recruitments/commands/route";
import {
  CaseRepositoryError,
  getRecruitmentCase,
  listRecruitmentCases,
} from "@/modules/recruitment/application/cases";
import type { SupabaseClient } from "@supabase/supabase-js";
const ownerA = "00000000-0000-4000-8000-000000000001";
const ownerB = "00000000-0000-4000-8000-000000000002";
const requestId = "00000000-0000-4000-8000-000000000003";
const body = {
  expectedUserId: ownerA,
  requestId,
  title: "Kontakt z rekruterem",
};
const saved = {
  id: "00000000-0000-4000-8000-000000000004",
  title: body.title,
  description: null,
  source_url: null,
  status: "Zapisane",
  created_at: "2026-10-29T12:00:00Z",
};
function request(headers?: Record<string, string>, input: unknown = body) {
  return new NextRequest("http://127.0.0.1:3152/recruitments/commands", {
    method: "POST",
    headers: {
      host: "app.example.test",
      origin: "https://app.example.test",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(input),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthConfig.mockReturnValue({
    enabled: true,
    origin: "https://app.example.test",
  });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: ownerA } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({
    data: { kind: "created", case: saved },
    error: null,
  });
  mocks.getRouteClient.mockImplementation((_request, response) => {
    response.cookies.set("sdk-session", "synthetic");
    return { auth: { getUser: mocks.getUser }, rpc: mocks.rpc };
  });
});
describe("Recruitment create command trust boundary", () => {
  it("binds verified current identity before one invoker RPC and preserves SDK cookies/private headers", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "created", case: saved });
    expect(mocks.getRouteClient).toHaveBeenCalledOnce();
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("create_recruitment_case", {
      p_request_id: requestId,
      p_title: body.title,
      p_description: null,
      p_source_url: null,
      p_allow_duplicate: false,
    });
    expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder[0],
    );
    expect(response.cookies.get("sdk-session")?.value).toBe("synthetic");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("denies missing/foreign/null Origin, noncanonical Host and cross-site before Auth/RPC", async () => {
    const rejectedHeaders: Record<string, string>[] = [
      { origin: "https://evil.example" },
      { origin: "null" },
      { origin: "" },
      { host: "evil.example", "x-forwarded-host": "app.example.test" },
      { "sec-fetch-site": "same-site" },
      { "sec-fetch-site": "cross-site" },
    ];
    for (const headers of rejectedHeaders)
      expect((await POST(request(headers))).status).toBe(403);
    for (const header of ["origin", "host"]) {
      const req = request();
      req.headers.delete(header);
      expect((await POST(req)).status).toBe(403);
    }
    expect(
      (
        await POST(
          request({ "content-type": "application/x-www-form-urlencoded" }),
        )
      ).status,
    ).toBe(415);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("denies switched/unverified identities without issuing mutations", async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: ownerB } },
      error: null,
    });
    expect((await POST(request())).status).toBe(403);
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await POST(request())).status).toBe(401);
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: ownerA } },
      error: { message: "private" },
    });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("strictly validates runtime input and never forwards owner/status to DB", async () => {
    for (const input of [
      null,
      [],
      { ...body, title: " " },
      { ...body, status: "W rekrutacji" },
      { ...body, owner_id: ownerB },
      { ...body, expectedUserId: "bad" },
      { ...body, sourceUrl: "javascript:alert(1)" },
    ])
      expect((await POST(request(undefined, input))).status).toBe(400);
    const malformed = request();
    vi.spyOn(malformed, "json").mockRejectedValue(new Error("private"));
    expect((await POST(malformed)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("projects duplicates and replay without leaking internal owner/request or raw provider error", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        kind: "duplicates",
        matches: [{ ...saved, owner_id: ownerA, request_id: requestId }],
        hasMore: false,
      },
      error: null,
    });
    const duplicates = await POST(request());
    expect(await duplicates.json()).toEqual({
      kind: "duplicates",
      matches: [saved],
      hasMore: false,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: { kind: "replayed", case: saved },
      error: null,
    });
    expect(await (await POST(request())).json()).toEqual({
      kind: "replayed",
      case: saved,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PT409", message: "secret SQL" },
    });
    const conflict = await POST(request());
    expect(conflict.status).toBe(409);
    expect(await conflict.text()).not.toContain("secret SQL");
    expect(conflict.cookies.get("sdk-session")?.value).toBe("synthetic");
    mocks.rpc.mockRejectedValueOnce(new Error("secret token"));
    const unknown = await POST(request());
    expect(unknown.status).toBe(503);
    expect(await unknown.text()).not.toContain("secret token");
  });
  it("does not call provider when Auth is unconfigured", async () => {
    mocks.getAuthConfig.mockReturnValue({ enabled: false });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.getRouteClient).not.toHaveBeenCalled();
  });
});
describe("Bounded private case reads", () => {
  it("orders tied timestamps by ID and requests one extra row without count", async () => {
    const range = vi.fn().mockResolvedValue({
      data: Array.from({ length: 26 }, () => saved),
      error: null,
    });
    const order = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnValue({ order, range });
    order.mockReturnValue({ order, range });
    const from = vi.fn().mockReturnValue({ select });
    const result = await listRecruitmentCases(
      { from } as unknown as SupabaseClient,
      2,
    );
    expect(range).toHaveBeenCalledWith(25, 50);
    expect(order.mock.calls).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(result.cases).toHaveLength(25);
    expect(result.hasMore).toBe(true);
    expect(select).toHaveBeenCalledWith(
      "id,title,description,source_url,status,created_at",
    );
  });
  it("rejects invalid offsets before querying and malformed IDs without an oracle query", async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    for (const page of [0, -1, 1.5, Infinity, 2_147_483_647])
      await expect(listRecruitmentCases(client, page)).rejects.toBeInstanceOf(
        CaseRepositoryError,
      );
    expect(await getRecruitmentCase(client, "foreign-invalid")).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });
});
