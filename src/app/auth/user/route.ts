import { type NextRequest, NextResponse } from "next/server";

import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const response = protectAuthResponse(
    NextResponse.json({ user: null }, { status: 401 }),
  );
  try {
    const client = getRouteClient(request, response);
    const { data, error } = await client.auth.getUser();
    if (!error && data.user) {
      // Preserve cookie/cache mutations collected on the same response.
      return protectAuthResponse(
        new NextResponse(
          JSON.stringify({
            user: {
              id: data.user.id,
              email: data.user.email ?? null,
            },
          }),
          { status: 200, headers: response.headers },
        ),
      );
    }
  } catch {
    // Fail closed for malformed session and Auth outages; no provider payload is rendered.
  }
  return response;
}
