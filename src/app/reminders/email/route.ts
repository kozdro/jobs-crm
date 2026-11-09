import { type NextRequest, NextResponse } from "next/server";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { getAuthConfig } from "@/shared/server/env";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

export const dynamic = "force-dynamic";
const isUuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);

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
    let expectedUserId: unknown, taskId: unknown, configurationId: unknown;
    let requestId: unknown, operation: unknown, consentVersion: unknown;
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
      const body = input as Record<string, unknown>;
      const keys = [
        "expectedUserId",
        "requestId",
        "taskId",
        "configurationId",
        "operation",
      ];
      if (body.operation === "enable") keys.push("consentVersion");
      if (
        Object.keys(body).length !== keys.length ||
        !keys.every((key) => Object.hasOwn(body, key))
      )
        return fail(400, "invalid");
      ({
        expectedUserId,
        requestId,
        taskId,
        configurationId,
        operation,
        consentVersion,
      } = body);
      if (
        !isUuid(requestId) ||
        (operation !== "enable" && operation !== "disable") ||
        (operation === "enable" && !isUuid(consentVersion))
      )
        return fail(400, "invalid");
    } else {
      const params = request.nextUrl.searchParams;
      const keys = ["expectedUserId", "taskId", "configurationId"];
      if (
        [...params.keys()].some((key) => !keys.includes(key)) ||
        keys.some((key) => params.getAll(key).length !== 1)
      )
        return fail(400, "invalid");
      expectedUserId = params.get("expectedUserId");
      taskId = params.get("taskId");
      configurationId = params.get("configurationId");
    }
    if (!isUuid(expectedUserId) || !isUuid(taskId) || !isUuid(configurationId))
      return fail(400, "invalid");
    if (expectedUserId !== auth.user.id) return fail(403, "forbidden");
    const result = write
      ? await client.rpc("execute_email_reminder", {
          p_request_id: requestId,
          p_task_id: taskId,
          p_configuration_id: configurationId,
          p_enabled: operation === "enable",
          p_consent_version: operation === "enable" ? consentVersion : null,
        })
      : await client.rpc("read_email_reminder", {
          p_task_id: taskId,
          p_configuration_id: configurationId,
        });
    if (result.error) {
      const code = result.error.code;
      return fail(
        code === "PT409" || code === "PT412" ? 409 : 503,
        code === "PT412"
          ? "stale"
          : code === "PT409"
            ? "conflict"
            : "unavailable",
      );
    }
    if (!result.data || typeof result.data !== "object")
      return fail(503, "unavailable");
    if (
      write &&
      result.data.kind !== "created" &&
      result.data.kind !== "replayed"
    )
      return fail(503, "unavailable");
    if (
      !write &&
      (typeof result.data.enabled !== "boolean" ||
        typeof result.data.verified !== "boolean" ||
        !isUuid(result.data.consentVersion) ||
        ![
          "off",
          "pending",
          "queued",
          "dispatching",
          "accepted",
          "unknown",
          "cancelled",
          "expired",
          "failed",
        ].includes(result.data.state) ||
        !(result.data.email === null || typeof result.data.email === "string"))
    )
      return fail(503, "unavailable");
    return reply(result.data);
  } catch {
    return fail(503, "unavailable");
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
