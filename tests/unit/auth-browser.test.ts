import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthRefreshDiscardedError } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
  getPublicAuthConfig: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: mocks.createBrowserClient,
}));
vi.mock("@/shared/public/auth-config", () => ({
  getPublicAuthConfig: mocks.getPublicAuthConfig,
}));

import {
  getBrowserClient,
  signOut,
} from "@/modules/identity/infrastructure/browser";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPublicAuthConfig.mockReturnValue({
    enabled: true,
    url: "https://db.example.test",
    key: "public",
    origin: "https://app.example.test",
  });
  mocks.createBrowserClient.mockReturnValue({
    auth: { signOut: mocks.signOut },
  });
});

describe("AUTH-14 local logout during a concurrent token refresh", () => {
  it("treats a discarded refresh result as a completed local sign-out", async () => {
    mocks.signOut.mockResolvedValue({
      data: null,
      error: new AuthRefreshDiscardedError(),
    });

    await expect(signOut("local")).resolves.toEqual({
      data: null,
      error: null,
    });
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it("preserves unrelated Auth errors and the requested scope", async () => {
    const error = new Error("logout failed");
    mocks.signOut.mockResolvedValue({ data: null, error });

    await expect(signOut("local")).resolves.toEqual({ data: null, error });
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it.each(["others", "global"] as const)(
    "preserves a discarded refresh error for the %s sign-out scope",
    async (scope) => {
      const error = new AuthRefreshDiscardedError();
      mocks.signOut.mockResolvedValue({ data: null, error });

      await expect(signOut(scope)).resolves.toEqual({ data: null, error });
      expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope });
    },
  );
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

  it.each([
    "#case-details",
    "#case-links",
    "#case-relations",
    "#case-tasks",
    "#case-calendar",
    "#case-lifecycle",
    "#case-actions",
    "#case-history",
  ])(
    "preserves the exact allowed detail section %s without enabling URL sessions",
    (hash) => {
      const replaceState = vi.fn();
      vi.stubGlobal("window", {
        location: {
          pathname: "/recruitments/00000000-0000-4000-8000-000000000001",
          search: "?historyPage=2",
          hash,
        },
        history: { state: { __NA: true }, replaceState },
      });
      getBrowserClient();
      expect(replaceState).not.toHaveBeenCalled();
      expect(mocks.createBrowserClient).toHaveBeenCalledOnce();
      expect(mocks.createBrowserClient.mock.calls[0][2].auth).toEqual({
        detectSessionInUrl: false,
      });
    },
  );

  it.each([
    ["/account", "#case-history"],
    ["/account", "#case-links"],
    ["/calendar", "#case-calendar"],
    ["/login", "#case-details"],
    ["/auth/callback", "#case-actions"],
    ["/recruitments/not-a-uuid", "#case-history"],
    ["/recruitments/00000000-0000-4000-8000-000000000001/", "#case-history"],
    [
      "/recruitments/00000000-0000-4000-8000-000000000001",
      "#access_token=untrusted&refresh_token=untrusted",
    ],
    [
      "/recruitments/00000000-0000-4000-8000-000000000001",
      "#case-history&access_token=untrusted",
    ],
    [
      "/recruitments/00000000-0000-4000-8000-000000000001",
      "#case-links&access_token=untrusted",
    ],
    [
      "/recruitments/00000000-0000-4000-8000-000000000001",
      "#case-calendar?refresh_token=untrusted",
    ],
    ["/recruitments/00000000-0000-4000-8000-000000000001", "#%63ase-history"],
    ["/recruitments/00000000-0000-4000-8000-000000000001", "#history"],
  ])(
    "scrubs untrusted or non-detail fragments before SDK initialization: %s %s",
    (pathname, hash) => {
      const state = { __NA: true };
      const replaceState = vi.fn();
      vi.stubGlobal("window", {
        location: { pathname, search: "?historyPage=2", hash },
        history: { state, replaceState },
      });
      getBrowserClient();
      expect(replaceState).toHaveBeenCalledExactlyOnceWith(
        state,
        "",
        `${pathname}?historyPage=2`,
      );
      expect(replaceState.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.createBrowserClient.mock.invocationCallOrder[0],
      );
      expect(
        mocks.createBrowserClient.mock.calls[0][2].auth.detectSessionInUrl,
      ).toBe(false);
    },
  );

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
