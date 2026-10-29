import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function callbackRequest(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  const headers = new Headers(init?.headers);
  if (!headers.has("host")) headers.set("host", new URL(url).host);
  return new NextRequest(url, { ...init, headers });
}

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
  it("accepts canonical public Host behind an internal reverse-proxy URL", async () => {
    const response = await GET(
      callbackRequest(
        "http://127.0.0.1:3133/auth/callback?code=opaque&next=/account",
        {
          headers: {
            host: "app.example.test",
            "x-forwarded-host": "attacker.example",
          },
        },
      ),
    );
    expect(mocks.exchange).toHaveBeenCalledWith("opaque");
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/account",
    );
  });
  it("uses only the configured origin and strips the exchanged code", async () => {
    const response = await GET(
      callbackRequest(
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
        callbackRequest(`https://app.example.test/auth/callback${suffix}`),
      );
      expect(response.headers.get("location")).toBe(
        "https://app.example.test/login?error=callback",
      );
    }
    await GET(
      callbackRequest("https://spoofed.example/auth/callback?code=opaque"),
    );
    await GET(
      callbackRequest("https://app.example.test/auth/callback?code=opaque", {
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("rejects hostile, missing or malformed Host even when forwarded headers claim the canonical origin", async () => {
    for (const host of [
      "evil.example",
      "app.example.test:444",
      "app.example.test@evil.example",
      "app.example.test,evil.example",
    ]) {
      const response = await GET(
        callbackRequest("http://127.0.0.1:3133/auth/callback?code=opaque", {
          headers: {
            host,
            "x-forwarded-host": "app.example.test",
            "x-forwarded-proto": "https",
          },
        }),
      );
      expect(response.headers.get("location")).toBe(
        "https://app.example.test/login?error=callback",
      );
    }
    await GET(
      new NextRequest("https://app.example.test/auth/callback?code=opaque"),
    );
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("keeps provider failures generic and preserves SDK cookies on successful redirect", async () => {
    mocks.exchange.mockRejectedValueOnce(new Error("secret-provider-payload"));
    const failure = await GET(
      callbackRequest("https://app.example.test/auth/callback?code=opaque"),
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
      callbackRequest(
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
      callbackRequest(
        "https://app.example.test/auth/callback?code=opaque&next=/reset-password",
      ),
    );
    expect(recovery.headers.get("location")).toBe(
      "https://app.example.test/login?error=callback",
    );
    expect(mocks.exchange).not.toHaveBeenCalled();
    mocks.getAuthConfig.mockReturnValue({ enabled: false });
    const disabled = await GET(
      callbackRequest("https://app.example.test/auth/callback?code=opaque"),
    );
    expect(disabled.status).toBe(503);
    expect(disabled.headers.get("location")).toBeNull();
  });
});
