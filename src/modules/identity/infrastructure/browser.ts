"use client";

import { createBrowserClient } from "@supabase/ssr";

import {
  logoutScopeSchema,
  type LogoutScope,
} from "@/modules/identity/application/validation";
import { getPublicAuthConfig } from "@/shared/public/auth-config";

/** The SDK owns browser storage, refresh and tab coordination. */
export function getBrowserClient() {
  // PKCE is exchanged only by the server callback. Never let an untrusted URL
  // fragment initialize a session on any browser surface, including /account.
  if (typeof window !== "undefined" && window.location.hash) {
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
  return getBrowserClient().auth.signOut({
    scope: logoutScopeSchema.parse(scope),
  });
}
