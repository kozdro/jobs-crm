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
import { GET, POST } from "@/app/tasks/commands/route";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const payload = {
  operation: "create",
  title: "Zadanie",
  description: null,
  dueOn: null,
  caseId: null,
};
function request(
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return new NextRequest("https://app.example.test/tasks/commands", {
    method: "POST",
    headers: {
      host: "app.example.test",
      origin: "https://app.example.test",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      expectedUserId: owner,
      requestId,
      ...payload,
      ...extra,
    }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthConfig.mockReturnValue({
    enabled: true,
    origin: "https://app.example.test",
  });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: owner } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({
    data: {
      kind: "created",
      task: {
        id: other,
        title: "Zadanie",
        description: null,
        due_on: null,
        case_id: null,
        case_title: null,
        status: "Do zrobienia",
        revision: 0,
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
      },
    },
    error: null,
  });
  mocks.getRouteClient.mockImplementation((_r, response) => {
    response.cookies.set("sdk-session", "synthetic");
    return { auth: { getUser: mocks.getUser }, rpc: mocks.rpc };
  });
});
describe("Tasks BFF current-user authority", () => {
  it("authenticates before command, forwards SDK cookies and no-store", async () => {
    const r = await POST(request());
    expect(r.status).toBe(200);
    expect((await r.json()).kind).toBe("created");
    expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder[0],
    );
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.cookies.get("sdk-session")?.value).toBe("synthetic");
  });
  it.each([
    ["origin", "https://evil.example"],
    ["sec-fetch-site", "cross-site"],
    ["host", "evil.example"],
  ])("rejects cross-origin authority %j", async (key, value) => {
    expect((await POST(request({}, { [key]: value }))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not trust caller owner, status, audit or a stale expected account", async () => {
    for (const injection of [
      { ownerId: owner },
      { status: "Wykonane" },
      { recordedAt: "2026-11-01" },
      { expectedUserId: other },
    ])
      expect([400, 403]).toContain((await POST(request(injection))).status);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects provider-denied or absent auth before mutation", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "denied" },
    });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["PT412", "PT409", "42501", "22023"])(
    "redacts provider diagnostics %s",
    async (code) => {
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { code, message: "private task title", details: owner },
      });
      const r = await POST(request());
      expect(r.status).toBe(
        code === "PT412" || code === "PT409"
          ? 409
          : code === "22023"
            ? 400
            : 503,
      );
      expect(JSON.stringify(await r.json())).not.toContain(
        "private task title",
      );
    },
  );
  it("rejects content type and malformed JSON", async () => {
    expect(
      (await POST(request({}, { "content-type": "text/plain" }))).status,
    ).toBe(415);
    expect(
      (
        await POST(
          new NextRequest("https://app.example.test/tasks/commands", {
            method: "POST",
            headers: {
              host: "app.example.test",
              origin: "https://app.example.test",
              "content-type": "application/json",
            },
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    "caseId=",
    "taskId=",
    "requestId=",
    "page=0",
    "page=-1",
    `taskId=${other}&requestId=${requestId}`,
    `caseId=${other}&caseId=${owner}`,
    "openOnly=yes",
    `expectedUserId=${other}`,
    "ownerId=forged",
  ])("rejects ambiguous or invalid read query %s", async (query) => {
    const r = await GET(
      new NextRequest(`https://app.example.test/tasks/commands?${query}`, {
        headers: { host: "app.example.test" },
      }),
    );
    expect([400, 403]).toContain(r.status);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
