import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { passwordSchema } from "@/modules/identity/application/validation";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { getAuthConfig } from "@/shared/server/env";

export const dynamic = "force-dynamic";

const inputSchema = passwordSchema
  .extend({ expectedUserId: z.uuid() })
  .strict();

/** Local fixture recovery only. Provider policy is still required at direct Auth API. */
export async function POST(request: NextRequest) {
  const response = protectAuthResponse(NextResponse.json({ ok: true }));
  function failure(status: number) {
    return protectAuthResponse(
      NextResponse.json(
        { error: "Password change was not completed." },
        { status, headers: response.headers },
      ),
    );
  }
  try {
    const config = getAuthConfig();
    if (!config.enabled || !config.localFixture) return failure(503);
    const site = request.headers.get("sec-fetch-site");
    if (
      request.headers.get("host")?.toLowerCase() !==
        new URL(config.origin).host ||
      request.headers.get("origin") !== config.origin ||
      (site !== null && site !== "same-origin")
    )
      return failure(403);
    if (
      request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return failure(415);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failure(400);
    }
    const input = inputSchema.safeParse(body);
    if (!input.success) return failure(400);

    // One client captures this request's cookie context. Browser tabs cannot replace
    // its verified subject between getUser and updateUser through shared SDK storage.
    const client = getRouteClient(request, response);
    const current = await client.auth.getUser();
    if (current.error || !current.data.user) return failure(401);
    if (current.data.user.id !== input.data.expectedUserId) return failure(403);
    const updated = await client.auth.updateUser({
      password: input.data.password,
    });
    if (updated.error || updated.data.user?.id !== current.data.user.id)
      return failure(503);
    return protectAuthResponse(response);
  } catch {
    // The upstream error/body can contain private data; never reflect or log it.
    return failure(503);
  }
}
