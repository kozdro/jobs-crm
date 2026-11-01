import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  client: vi.fn(),
  user: vi.fn(),
  workspace: vi.fn(),
  preview: vi.fn(),
  profiles: vi.fn(),
}));
vi.mock("@/shared/server/env", () => ({ getAuthConfig: mocks.config }));
vi.mock("@/modules/identity/infrastructure/server", () => ({
  getRouteClient: mocks.client,
}));
vi.mock("@/modules/recruitment/application/workspace-read", () => ({
  loadWorkspace: mocks.workspace,
  loadWorkspacePreview: mocks.preview,
  listWorkspaceProfiles: mocks.profiles,
}));
import { GET } from "@/app/recruitments/workspace-data/route";
const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
function request(
  query = `expectedUserId=${a}`,
  headers: Record<string, string> = {},
) {
  return new NextRequest(
    `https://app.example.test/recruitments/workspace-data?${query}`,
    {
      headers: {
        host: "app.example.test",
        "sec-fetch-site": "same-origin",
        ...headers,
      },
    },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({
    enabled: true,
    origin: "https://app.example.test",
  });
  mocks.user.mockResolvedValue({ data: { user: { id: a } }, error: null });
  mocks.client.mockImplementation((_request, response) => {
    response.cookies.set("sdk-refresh", "synthetic");
    return { auth: { getUser: mocks.user } };
  });
  mocks.workspace.mockResolvedValue({ list: null, columns: {} });
  mocks.preview.mockResolvedValue(null);
  mocks.profiles.mockResolvedValue({ profiles: [], hasMore: false, page: 1 });
});
describe("read-only workspace authenticated DTO boundary", () => {
  it("verifies current identity before reading and retains refresh/cache headers", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.user.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.workspace.mock.invocationCallOrder[0],
    );
    expect(response.cookies.get("sdk-refresh")?.value).toBe("synthetic");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("does not return new-account data to stale old-account workspace", async () => {
    mocks.user.mockResolvedValue({ data: { user: { id: b } }, error: null });
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("does not query private tables for anonymous requests", async () => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it.each(["", "expectedUserId=x", `expectedUserId=${a}&expectedUserId=${b}`])(
    "rejects invalid identity binding %s",
    async (query) => {
      expect((await GET(request(query))).status).toBe(400);
      expect(mocks.workspace).not.toHaveBeenCalled();
    },
  );
  it.each(["same-site", "cross-site"])(
    "rejects %s fetches before reading",
    async (site) => {
      expect(
        (await GET(request(undefined, { "sec-fetch-site": site }))).status,
      ).toBe(403);
      expect(mocks.client).not.toHaveBeenCalled();
    },
  );
  it("rejects an untrusted host", async () => {
    expect(
      (await GET(request(undefined, { host: "other.example.test" }))).status,
    ).toBe(403);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("inaccessible preview has generic404 and private cache", async () => {
    const response = await GET(
      request(`expectedUserId=${a}&mode=preview&id=${b}`),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      kind: "not-found",
      error: "Nie udało się pobrać danych. Spróbuj ponownie.",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("sanitizes provider failure without leaking data or tokens", async () => {
    mocks.workspace.mockRejectedValue(new Error("secret provider payload"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("invalid queries do not become silent defaults", async () => {
    const response = await GET(request(`expectedUserId=${a}&sort=activity`));
    expect(response.status).toBe(400);
    expect((await response.json()).kind).toBe("invalid");
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("profile options can request exact selected ID without email", async () => {
    const response = await GET(
      request(`expectedUserId=${a}&mode=options&type=contact&id=${b}`),
    );
    expect(response.status).toBe(200);
    expect(mocks.profiles).toHaveBeenCalledWith(
      expect.anything(),
      "contact",
      1,
      b,
    );
  });
});
