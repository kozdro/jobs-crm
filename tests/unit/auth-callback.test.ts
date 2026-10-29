import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAuthConfig: vi.fn(),
  getRouteClient: vi.fn(),
  exchange: vi.fn(),
}));
vi.mock("@/shared/server/env", () => ({ getAuthConfig: mocks.getAuthConfig }));
vi.mock("@/modules/identity/infrastructure/server", () => ({
  getRouteClient: mocks.getRouteClient,
}));

import { GET } from "@/app/auth/callback/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthConfig.mockReturnValue({
    enabled: true,
    origin: "https://app.example.test",
    localFixture: true,
  });
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.getRouteClient.mockReturnValue({
    auth: { exchangeCodeForSession: mocks.exchange },
  });
});

describe("AUTH-02/06 callback boundary", () => {
  it("uses only the configured origin and strips the exchanged code", async () => {
    const response = await GET(
      new NextRequest(
        "https://app.example.test/auth/callback?code=opaque&next=/account",
      ),
    );
    expect(mocks.exchange).toHaveBeenCalledWith("opaque");
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/account",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).not.toContain("opaque");
  });

  it("rejects unsafe/duplicate destinations, origins, provider errors and missing codes before exchange", async () => {
    const cases = [
      "?code=opaque&next=//evil.example",
      "?code=opaque&next=/account&next=/reset-password",
      "?code=one&code=two",
      "?error=access_denied&error_description=secret",
      "?next=/account",
    ];
    for (const suffix of cases) {
      const response = await GET(
        new NextRequest(`https://app.example.test/auth/callback${suffix}`),
      );
      expect(response.headers.get("location")).toBe(
        "https://app.example.test/login?error=callback",
      );
    }
    await GET(
      new NextRequest("https://spoofed.example/auth/callback?code=opaque"),
    );
    await GET(
      new NextRequest("https://app.example.test/auth/callback?code=opaque", {
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("keeps provider failures generic and preserves SDK cookies on successful redirect", async () => {
    mocks.exchange.mockRejectedValueOnce(new Error("secret-provider-payload"));
    const failure = await GET(
      new NextRequest("https://app.example.test/auth/callback?code=opaque"),
    );
    expect(failure.headers.get("location")).toBe(
      "https://app.example.test/login?error=callback",
    );
    expect(await failure.text()).not.toContain("secret-provider-payload");
    mocks.getRouteClient.mockImplementation((_request, response) => {
      response.cookies.set("sdk-cookie", "synthetic", { secure: true });
      return { auth: { exchangeCodeForSession: mocks.exchange } };
    });
    mocks.exchange.mockResolvedValue({ error: null });
    const success = await GET(
      new NextRequest(
        "https://app.example.test/auth/callback?code=opaque&next=/reset-password",
      ),
    );
    expect(success.cookies.get("sdk-cookie")?.value).toBe("synthetic");
    expect(success.headers.get("location")).toBe(
      "https://app.example.test/reset-password",
    );
  });

  it("does not enable recovery or auth when its configuration is disabled", async () => {
    mocks.getAuthConfig.mockReturnValue({
      enabled: true,
      origin: "https://app.example.test",
      localFixture: false,
    });
    const recovery = await GET(
      new NextRequest(
        "https://app.example.test/auth/callback?code=opaque&next=/reset-password",
      ),
    );
    expect(recovery.headers.get("location")).toBe(
      "https://app.example.test/login?error=callback",
    );
    expect(mocks.exchange).not.toHaveBeenCalled();
    mocks.getAuthConfig.mockReturnValue({ enabled: false });
    const disabled = await GET(
      new NextRequest("https://app.example.test/auth/callback?code=opaque"),
    );
    expect(disabled.status).toBe(503);
    expect(disabled.headers.get("location")).toBeNull();
  });
});
