import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
  getPublicAuthConfig: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mocks.createBrowserClient,
}));
vi.mock("@/shared/public/auth-config", () => ({
  getPublicAuthConfig: mocks.getPublicAuthConfig,
}));

import { getBrowserClient } from "@/modules/identity/infrastructure/browser";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPublicAuthConfig.mockReturnValue({
    enabled: true,
    url: "https://db.example.test",
    key: "public",
    origin: "https://app.example.test",
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("AUTH-02/06 browser adapter URL boundary", () => {
  it("discards an unexpected fragment before SDK initialization on a private surface, preserving history state and query", () => {
    const state = { __NA: true, tree: ["account"] };
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        pathname: "/account",
        search: "?view=session",
        hash: "#access_token=untrusted",
      },
      history: { state, replaceState },
    });
    getBrowserClient();
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(
      state,
      "",
      "/account?view=session",
    );
    expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createBrowserClient.mock.invocationCallOrder[0],
    );
    expect(mocks.createBrowserClient).toHaveBeenCalledWith(
      "https://db.example.test",
      "public",
      {
        auth: { detectSessionInUrl: false },
        cookieOptions: { path: "/", sameSite: "lax", secure: true },
      },
    );
  });

  it("does not rewrite a clean URL and never enables automatic session detection", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { hash: "" },
      history: { replaceState },
    });
    getBrowserClient();
    expect(replaceState).not.toHaveBeenCalled();
    expect(
      mocks.createBrowserClient.mock.calls[0][2].auth.detectSessionInUrl,
    ).toBe(false);
    expect(
      mocks.createBrowserClient.mock.calls[0][2].auth.storage,
    ).toBeUndefined();
  });

  it("guards non-browser execution and does not create a client when Auth is disabled", () => {
    vi.stubGlobal("window", undefined);
    getBrowserClient();
    expect(mocks.createBrowserClient).toHaveBeenCalledOnce();
    mocks.createBrowserClient.mockClear();
    mocks.getPublicAuthConfig.mockReturnValue({ enabled: false });
    expect(() => getBrowserClient()).toThrow("Authentication is unavailable.");
    expect(mocks.createBrowserClient).not.toHaveBeenCalled();
  });
});
