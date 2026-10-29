import { type NextRequest, NextResponse } from "next/server";

import {
  callbackCode,
  callbackDestination,
} from "@/modules/identity/application/validation";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { getAuthConfig } from "@/shared/server/env";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let origin: string;
  try {
    const config = getAuthConfig();
    if (!config.enabled) throw new Error("Authentication is unavailable.");
    origin = config.origin;
  } catch {
    return protectAuthResponse(
      NextResponse.json(
        { error: "Authentication is unavailable." },
        { status: 503 },
      ),
    );
  }
  const response = protectAuthResponse(
    NextResponse.redirect(new URL("/login?error=callback", origin), 303),
  );
  const params = request.nextUrl.searchParams;
  const code = callbackCode(params.get("code"));
  const destination = callbackDestination(params.get("next"));
  const suppliedOrigin = request.headers.get("origin");
  // Next.js can reconstruct nextUrl with its internal listener address behind a
  // reverse proxy. Host is a constraint, never redirect authority; the deployment
  // must preserve the canonical public Host. Forwarded headers are not trusted.
  const suppliedHost = request.headers.get("host");
  if (
    suppliedHost?.toLowerCase() !== new URL(origin).host ||
    (suppliedOrigin !== null && suppliedOrigin !== origin) ||
    params.getAll("code").length !== 1 ||
    params.getAll("next").length > 1 ||
    params.has("error") ||
    !code ||
    !destination ||
    (destination === "/reset-password" && !getAuthConfig().localFixture)
  )
    return response;

  try {
    const client = getRouteClient(request, response);
    // SDK checks the verifier belonging to this browser context. No token is put in Location.
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error)
      response.headers.set("Location", new URL(destination, origin).href);
  } catch {
    // Provider errors can contain credentials/URLs; only the fixed error state is returned.
  }
  return protectAuthResponse(response);
}
