import { NextResponse, type NextRequest } from "next/server";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { getAuthConfig } from "@/shared/server/env";

export function response(body: unknown, status = 200, headers?: Headers) {
  return protectAuthResponse(NextResponse.json(body, { status, headers }));
}
export async function authenticated(request: NextRequest, mutation: boolean) {
  const cookies = protectAuthResponse(NextResponse.json({}));
  const config = getAuthConfig();
  if (!config.enabled) return null;
  const site = request.headers.get("sec-fetch-site");
  if (
    request.headers.get("host")?.toLowerCase() !==
      new URL(config.origin).host ||
    (site !== null && site !== "same-origin") ||
    (mutation && request.headers.get("origin") !== config.origin) ||
    (mutation &&
      request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase() !== "application/json")
  )
    return null;
  const client = getRouteClient(request, cookies);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { client, userId: data.user.id, headers: cookies.headers };
}
export function errorStatus(code: string | undefined) {
  return code === "22023" || code === "22P02"
    ? 400
    : code === "PT409" || code === "PT412"
      ? 409
      : code === "42501"
        ? 404
        : 503;
}
