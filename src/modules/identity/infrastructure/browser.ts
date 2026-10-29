"use client";

import { createBrowserClient } from "@supabase/ssr";

import {
  logoutScopeSchema,
  type LogoutScope,
} from "@/modules/identity/application/validation";
import { getPublicAuthConfig } from "@/shared/public/auth-config";

/** The SDK owns browser storage, refresh and tab coordination. */
export function getBrowserClient() {
  const config = getPublicAuthConfig();
  if (!config.enabled) throw new Error("Authentication is unavailable.");
  return createBrowserClient(config.url, config.key, {
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
