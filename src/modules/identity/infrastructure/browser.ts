"use client";

import { createBrowserClient } from "@supabase/ssr";
import { isAuthRefreshDiscardedError } from "@supabase/supabase-js";

import {
  logoutScopeSchema,
  type LogoutScope,
} from "@/modules/identity/application/validation";
import { getPublicAuthConfig } from "@/shared/public/auth-config";
import { isCaseSectionFragment } from "@/shared/validation/case-section-fragment";

/** The SDK owns browser storage, refresh and tab coordination. */
export function getBrowserClient() {
  // PKCE is exchanged only by the server callback. Never let an untrusted URL
  // fragment initialize a session on any browser surface, including /account.
  // Only exact, non-auth section anchors on a UUID case detail URL may remain.
  if (
    typeof window !== "undefined" &&
    window.location.hash &&
    !isCaseSectionFragment(window.location.pathname, window.location.hash)
  ) {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
  }
  const config = getPublicAuthConfig();
  if (!config.enabled) throw new Error("Authentication is unavailable.");
  return createBrowserClient(config.url, config.key, {
    auth: { detectSessionInUrl: false },
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: config.origin.startsWith("https:"),
    },
  });
}

export async function signOut(scope: LogoutScope) {
  const result = await getBrowserClient().auth.signOut({
    scope: logoutScopeSchema.parse(scope),
  });
  // A concurrent refresh can lose its commit after signOut cleared local
  // storage. The SDK reports this specific discarded refresh as an error even
  // though the local session is already gone; treat that race as a local
  // sign-out success while preserving every other SDK error.
  if (scope === "local" && isAuthRefreshDiscardedError(result.error)) {
    return { ...result, error: null };
  }
  return result;
}
