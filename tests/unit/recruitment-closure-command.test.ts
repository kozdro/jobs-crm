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
import { POST, GET } from "@/app/recruitments/lifecycle-commands/route";
const owner = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const input = {
  operation: "close",
  caseId,
  closureId: null,
  outcome: "Inny",
  occurredOn: null,
  offerConfirmed: false,
};
function request(
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return new NextRequest(
    "https://app.example.test/recruitments/lifecycle-commands",
    {
      method: "POST",
      headers: {
        host: "app.example.test",
        origin: "https://app.example.test",
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        action: "preview",
        expectedUserId: owner,
        ...input,
        ...extra,
      }),
    },
  );
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
      caseRevision: 3,
      closureRevision: 0,
      cycle: 0,
      status: "Zakończone",
      currentStage: null,
      before: null,
      after: { outcome: "Inny", occurredOn: null, offerConfirmed: false },
    },
    error: null,
  });
  mocks.getRouteClient.mockImplementation((_r, response) => {
    response.cookies.set("sdk-session", "synthetic");
    return { auth: { getUser: mocks.getUser }, rpc: mocks.rpc };
  });
});
describe("3C BFF authority boundary", () => {
  it("authenticates current account before INVOKER preview and propagates SDK cache/cookies", async () => {
    const r = await POST(request());
    expect(r.status).toBe(200);
    expect((await r.json()).kind).toBe("preview");
    expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder[0],
    );
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.cookies.get("sdk-session")?.value).toBe("synthetic");
  });
  it("denies cross-origin, cross-site and spoofed current account before RPC", async () => {
    expect(
      (await POST(request({}, { origin: "https://evil.test" }))).status,
    ).toBe(403);
    expect(
      (await POST(request({}, { "sec-fetch-site": "cross-site" }))).status,
    ).toBe(403);
    expect((await POST(request({ expectedUserId: caseId }))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("denies provider-rejected auth and malformed JSON without domain writes", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "denied" },
    });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects extra actor, lifecycle snapshots and direct state inputs", async () => {
    for (const injection of [
      { ownerId: owner },
      { cycle: 9 },
      { status: "Zakończone" },
      { previousStage: "HR" },
      { recordedAt: "2026-10-31" },
    ])
      expect((await POST(request(injection))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["PT412", 409, "stale"],
    ["PT409", 409, "conflict"],
    ["PT422", 400, "invalid"],
    ["42501", 503, "unavailable"],
  ])("redacts provider details %s", async (code, status, kind) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code, message: "sensitive history", details: owner },
    });
    const r = await POST(request());
    expect(r.status).toBe(status);
    const body = await r.json();
    expect(body.kind).toBe(kind);
    expect(JSON.stringify(body)).not.toContain("sensitive history");
    expect(JSON.stringify(body)).not.toContain(owner);
  });
  it("refuses malformed recovery identifier and changed expected account", async () => {
    for (const query of [
      `caseId=${caseId}&requestId=bad`,
      `caseId=${caseId}&expectedUserId=${caseId}`,
    ]) {
      const r = await GET(
        new NextRequest(
          `https://app.example.test/recruitments/lifecycle-commands?${query}`,
          { headers: { host: "app.example.test" } },
        ),
      );
      expect([400, 403]).toContain(r.status);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects confirmation without preview revisions", async () => {
    expect((await POST(request({ action: "confirm", requestId }))).status).toBe(
      400,
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
