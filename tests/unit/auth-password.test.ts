import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthConfig: vi.fn(),
  getRouteClient: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock("@/shared/server/env", () => ({ getAuthConfig: mocks.getAuthConfig }));
vi.mock("@/modules/identity/infrastructure/server", () => ({
  getRouteClient: mocks.getRouteClient,
}));
import { POST } from "@/app/auth/password/route";

const ownerA = "00000000-0000-4000-8000-000000000001";
const ownerB = "00000000-0000-4000-8000-000000000002";
const body = { password: "synthetic-password", expectedUserId: ownerA };
function request(headers?: Record<string, string>, value: unknown = body) {
  return new NextRequest("http://127.0.0.1:3133/auth/password", {
    method: "POST",
    headers: {
      host: "app.example.test",
      origin: "https://app.example.test",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(value),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthConfig.mockReturnValue({
    enabled: true,
    localFixture: true,
    origin: "https://app.example.test",
  });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: ownerA } },
    error: null,
  });
  mocks.updateUser.mockResolvedValue({
    data: { user: { id: ownerA } },
    error: null,
  });
  mocks.getRouteClient.mockReturnValue({
    auth: { getUser: mocks.getUser, updateUser: mocks.updateUser },
  });
});

describe("AUTH-10/06 local password command", () => {
  it("uses one request-bound client and verifies the intended identity before update", async () => {
    mocks.getRouteClient.mockImplementation((_req, response) => {
      response.cookies.set("sdk-session", "synthetic", { secure: true });
      return { auth: { getUser: mocks.getUser, updateUser: mocks.updateUser } };
    });
    const result = await POST(request({ "sec-fetch-site": "same-origin" }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    expect(mocks.getRouteClient).toHaveBeenCalledOnce();
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: body.password });
    expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateUser.mock.invocationCallOrder[0],
    );
    expect(result.cookies.get("sdk-session")?.value).toBe("synthetic");
    expect(result.headers.get("cache-control")).toContain("no-store");
  });

  it("rejects foreign, null, missing origins/Host and cross-site form transport before identity or update", async () => {
    const rejectedHeaders: Record<string, string>[] = [
      { origin: "https://evil.example" },
      { origin: "null" },
      { origin: "" },
      { host: "evil.example", "x-forwarded-host": "app.example.test" },
      { "sec-fetch-site": "same-site" },
      { "sec-fetch-site": "cross-site" },
    ];
    for (const headers of rejectedHeaders) {
      const result = await POST(request(headers));
      expect(result.status).toBe(403);
    }
    const missingOrigin = request();
    missingOrigin.headers.delete("origin");
    expect((await POST(missingOrigin)).status).toBe(403);
    const missingHost = request();
    missingHost.headers.delete("host");
    expect((await POST(missingHost)).status).toBe(403);
    expect(
      (
        await POST(
          request({ "content-type": "application/x-www-form-urlencoded" }),
        )
      ).status,
    ).toBe(415);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects a switched browser identity and unverified session without update", async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: ownerB } },
      error: null,
    });
    expect((await POST(request())).status).toBe(403);
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await POST(request())).status).toBe(401);
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: ownerA } },
      error: { message: "upstream rejected" },
    });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("does not authorize the command without the explicit local fixture", async () => {
    for (const config of [
      { enabled: false, localFixture: false },
      { enabled: true, localFixture: false },
    ]) {
      mocks.getAuthConfig.mockReturnValue(config);
      expect((await POST(request())).status).toBe(503);
    }
    expect(mocks.getRouteClient).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects malformed input and reports fixed upstream errors while retaining SDK cookies", async () => {
    for (const value of [
      { password: "", expectedUserId: ownerA },
      { password: "x", expectedUserId: "not-a-uuid" },
      { ...body, owner_id: ownerB },
    ]) {
      expect((await POST(request(undefined, value))).status).toBe(400);
    }
    const malformed = request();
    vi.spyOn(malformed, "json").mockRejectedValue(new Error("malformed"));
    expect((await POST(malformed)).status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
    mocks.getRouteClient.mockImplementation((_req, response) => {
      response.cookies.set("sdk-session", "refreshed");
      return { auth: { getUser: mocks.getUser, updateUser: mocks.updateUser } };
    });
    mocks.updateUser.mockRejectedValueOnce(
      new Error("secret upstream failure"),
    );
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({
      error: "Password change was not completed.",
    });
    expect(result.cookies.get("sdk-session")?.value).toBe("refreshed");
    expect(result.headers.get("cache-control")).toContain("no-store");
  });
});
