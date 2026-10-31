import { type NextRequest, NextResponse } from "next/server";

import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";

export async function proxy(request: NextRequest) {
  const response = protectAuthResponse(NextResponse.next({ request }));
  try {
    const client = getRouteClient(request, response);
    await client.auth.getUser();
  } catch {
    // The destination checks trusted identity itself. Auth failure cannot grant access.
  }
  // Forward the refreshed request Cookie header as well as response Set-Cookie. A new
  // NextResponse here would otherwise discard SDK writes and associated cache headers.
  const forwarded = NextResponse.next({ request });
  for (const [name, value] of forwarded.headers) {
    if (
      name.startsWith("x-middleware-request-") ||
      name === "x-middleware-override-headers"
    )
      response.headers.set(name, value);
  }
  return protectAuthResponse(response);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/recruitments/:path*",
    "/companies/:path*",
    "/contacts/:path*",
    "/catalog/:path*",
    "/account/:path*",
    "/auth/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ],
};
