import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getAuthConfig: vi.fn(),
  cookies: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));
vi.mock("@/shared/server/env", () => ({ getAuthConfig: mocks.getAuthConfig }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import {
  getRouteClient,
  getServerClient,
  getTrustedUser,
} from "@/modules/identity/infrastructure/server";

const config = {
  enabled: true,
  url: "https://db.example.test",
  key: "public",
  origin: "https://app.example.test",
  localFixture: false,
  googleEnabled: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthConfig.mockReturnValue(config);
  mocks.cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() });
});

describe("AUTH-04/12 request-scoped trusted clients", () => {
  it("constructs separate clients with no privileged authorization override", async () => {
    mocks.createServerClient.mockImplementation(() => ({ auth: {} }));
    const a = await getServerClient();
    const b = await getServerClient();
    expect(a).not.toBe(b);
    expect(mocks.createServerClient).toHaveBeenCalledTimes(2);
    const options = mocks.createServerClient.mock.calls[0][2];
    expect(options.global.headers).toBeUndefined();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response());
    await options.global.fetch("https://db.example.test", {
      cache: "force-cache",
    });
    expect(fetchSpy).toHaveBeenCalledWith("https://db.example.test", {
      cache: "no-store",
    });
    fetchSpy.mockRestore();
  });

  it("requires Auth getUser and returns only identity fields", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "owner-a",
          email: "a@example.test",
          user_metadata: { owner_id: "owner-b" },
        },
      },
      error: null,
    });
    const getSession = vi.fn();
    mocks.createServerClient.mockReturnValue({ auth: { getUser, getSession } });
    expect(await getTrustedUser()).toEqual({
      id: "owner-a",
      email: "a@example.test",
    });
    expect(getUser).toHaveBeenCalledOnce();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("fails closed for rejected, missing, malformed and unavailable identities", async () => {
    for (const result of [
      { data: { user: { id: "owner-a" } }, error: { message: "rejected" } },
      { data: { user: null }, error: null },
    ]) {
      mocks.createServerClient.mockReturnValue({
        auth: { getUser: vi.fn().mockResolvedValue(result) },
      });
      expect(await getTrustedUser()).toBeNull();
    }
    mocks.createServerClient.mockReturnValue({
      auth: { getUser: vi.fn().mockRejectedValue(new Error("upstream")) },
    });
    expect(await getTrustedUser()).toBeNull();
    mocks.getAuthConfig.mockReturnValue({ ...config, enabled: false });
    await expect(getServerClient()).rejects.toThrow(
      "Authentication is unavailable.",
    );
  });

  it("propagates SDK cookies, request context and cache headers together", () => {
    const request = new NextRequest("https://app.example.test/account", {
      headers: { cookie: "session=before" },
    });
    const response = NextResponse.next();
    getRouteClient(request, response);
    const options = mocks.createServerClient.mock.calls[0][2];
    expect(options.cookies.getAll()).toEqual([
      { name: "session", value: "before" },
    ]);
    options.cookies.setAll(
      [
        {
          name: "session",
          value: "after",
          options: { path: "/", secure: true, sameSite: "lax" },
        },
      ],
      { "Cache-Control": "private, no-store", Expires: "0" },
    );
    expect(request.cookies.get("session")?.value).toBe("after");
    expect(response.cookies.get("session")?.value).toBe("after");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Expires")).toBe("0");
    expect(options.cookieOptions).toMatchObject({
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    expect(options.cookieOptions.httpOnly).toBeUndefined();
  });
});
