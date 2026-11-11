import { NextResponse, type NextRequest } from "next/server";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { getAuthConfig } from "@/shared/server/env";
import { validatePendingVersion } from "@/modules/documents/infrastructure/validator-client";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const cookieResponse = protectAuthResponse(NextResponse.json({}));
  function reply(body: unknown, status = 200) {
    return protectAuthResponse(
      NextResponse.json(body, { status, headers: cookieResponse.headers }),
    );
  }
  try {
    const config = getAuthConfig();
    if (!config.enabled) return reply({ kind: "unavailable" }, 503);
    const site = request.headers.get("sec-fetch-site");
    if (
      request.headers.get("host")?.toLowerCase() !==
        new URL(config.origin).host ||
      (site !== null && site !== "same-origin")
    )
      return reply({ kind: "forbidden" }, 403);
    const requestId = request.nextUrl.searchParams.get("requestId");
    if (!requestId || !uuidPattern.test(requestId))
      return reply({ kind: "invalid" }, 400);
    const client = getRouteClient(request, cookieResponse);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return reply({ kind: "unauthenticated" }, 401);
    if (request.headers.get("x-expected-user-id") !== data.user.id)
      return reply({ kind: "forbidden" }, 403);
    let result = await client.rpc("reconcile_document_upload", {
      p_request_id: requestId,
    });
    if (
      result.error ||
      !result.data ||
      !["found", "pending", "cancelled"].includes(result.data.kind)
    )
      return reply({ kind: "unavailable" }, 503);
    if (
      result.data.kind === "pending" &&
      typeof result.data.versionId === "string" &&
      uuidPattern.test(result.data.versionId)
    ) {
      try {
        await validatePendingVersion(result.data.versionId);
        result = await client.rpc("reconcile_document_upload", {
          p_request_id: requestId,
        });
      } catch {
        // An unavailable validator or absent object does not prove rollback.
        return reply({ kind: "pending" });
      }
      if (
        result.error ||
        !result.data ||
        !["found", "pending", "cancelled"].includes(result.data.kind)
      )
        return reply({ kind: "unavailable" }, 503);
    }
    return reply(result.data);
  } catch {
    return reply({ kind: "unavailable" }, 503);
  }
}
