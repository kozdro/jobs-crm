import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type NextRequest, type NextResponse } from "next/server";

import { getAuthConfig } from "@/shared/server/env";

const uncachedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

/** Fresh client for each render/request. Proxy persists any session refresh before SSR. */
export async function getServerClient() {
  const config = getAuthConfig();
  if (!config.enabled) throw new Error("Authentication is unavailable.");
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    global: { fetch: uncachedFetch },
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: config.origin.startsWith("https:"),
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        // Server Components cannot mutate response cookies. The proxy refreshes first;
        // Route Handlers use getRouteClient below and persist every write/header.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          // Read-only render; no session data is copied into its payload.
        }
      },
    },
  });
}

/** Route/proxy client preserves SDK cookies AND its associated cache headers. */
export function getRouteClient(request: NextRequest, response: NextResponse) {
  const config = getAuthConfig();
  if (!config.enabled) throw new Error("Authentication is unavailable.");
  return createServerClient(config.url, config.key, {
    global: { fetch: uncachedFetch },
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: config.origin.startsWith("https:"),
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });
}

export type TrustedUser = { id: string; email: string | null };

/** getSession() and client/user-editable metadata are never identity proof. */
export async function getTrustedUser(): Promise<TrustedUser | null> {
  try {
    const client = await getServerClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}
