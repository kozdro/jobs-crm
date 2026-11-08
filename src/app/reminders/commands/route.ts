import { type NextRequest, NextResponse } from "next/server";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { getAuthConfig } from "@/shared/server/env";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { parseReminderCommand } from "@/modules/recruitment/domain/reminders";

export const dynamic = "force-dynamic";

async function handle(request: NextRequest, write: boolean) {
  const cookieResponse = protectAuthResponse(NextResponse.json({}));
  const reply = (body: unknown, status = 200) =>
    protectAuthResponse(
      NextResponse.json(body, { status, headers: cookieResponse.headers }),
    );
  const fail = (status: number, kind: string) =>
    reply({ kind, error: "Nie udało się potwierdzić operacji." }, status);
  try {
    const config = getAuthConfig();
    if (!config.enabled) return fail(503, "unavailable");
    const site = request.headers.get("sec-fetch-site");
    if (
      request.headers.get("host")?.toLowerCase() !==
        new URL(config.origin).host ||
      (site !== null && site !== "same-origin") ||
      (write && request.headers.get("origin") !== config.origin)
    )
      return fail(403, "forbidden");
    const client = getRouteClient(request, cookieResponse);
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return fail(401, "unauthenticated");
    if (write) {
      if (
        request.headers
          .get("content-type")
          ?.split(";", 1)[0]
          .trim()
          .toLowerCase() !== "application/json"
      )
        return fail(415, "invalid");
      let input: unknown;
      try {
        input = await request.json();
      } catch {
        return fail(400, "invalid");
      }
      if (!input || typeof input !== "object" || Array.isArray(input))
        return fail(400, "invalid");
      const { expectedUserId, ...payload } = input as Record<string, unknown>;
      if (expectedUserId !== auth.user.id) return fail(403, "forbidden");
      const command = parseReminderCommand(payload);
      if (!command) return fail(400, "invalid");
      const { requestId, ...intent } = command;
      const { data, error } = await client.rpc(
        "execute_recruitment_reminder_command",
        { p_request_id: requestId, p_payload: intent },
      );
      if (error)
        return fail(
          error.code === "PT409" || error.code === "PT412"
            ? 409
            : error.code === "22023"
              ? 400
              : 503,
          error.code === "PT412"
            ? "stale"
            : error.code === "PT409"
              ? "conflict"
              : error.code === "22023"
                ? "invalid"
                : "unavailable",
        );
      if (!data || (data.kind !== "created" && data.kind !== "replayed"))
        return fail(503, "unavailable");
      return reply(data);
    }
    const params = request.nextUrl.searchParams;
    if (
      [...params.keys()].some(
        (key) => key !== "expectedUserId" || params.getAll(key).length !== 1,
      )
    )
      return fail(400, "invalid");
    const expectedUserId = params.get("expectedUserId");
    if (
      expectedUserId !== null &&
      (!uuidPattern.test(expectedUserId) || expectedUserId !== auth.user.id)
    )
      return fail(403, "forbidden");
    const { data, error } = await client.rpc("read_recruitment_reminders");
    if (
      error ||
      !data ||
      !Array.isArray(data.reminders) ||
      !Array.isArray(data.suggestions) ||
      !(data.rule === null || typeof data.rule === "object")
    )
      return fail(503, "unavailable");
    return reply(data);
  } catch {
    return fail(503, "unavailable");
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
