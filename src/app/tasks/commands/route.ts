import { type NextRequest, NextResponse } from "next/server";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { getAuthConfig } from "@/shared/server/env";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { parseTaskInput } from "@/modules/recruitment/domain/tasks";
import {
  CaseRepositoryError,
  listRecruitmentCases,
} from "@/modules/recruitment/application/cases";
import {
  executeTaskCommand,
  getTask,
  getTaskByRequestId,
  listTaskAudit,
  listTasks,
} from "@/modules/recruitment/application/tasks";
export const dynamic = "force-dynamic";
async function handle(request: NextRequest, write: boolean) {
  const cookieResponse = protectAuthResponse(NextResponse.json({}));
  const reply = (body: unknown, status = 200) =>
    protectAuthResponse(
      NextResponse.json(body, { status, headers: cookieResponse.headers }),
    );
  const failure = (status: number, kind: string) =>
    reply(
      {
        kind,
        error:
          "Nie udało się potwierdzić operacji. Zachowaj dane i spróbuj ponownie.",
      },
      status,
    );
  try {
    const config = getAuthConfig();
    if (!config.enabled) return failure(503, "unavailable");
    const site = request.headers.get("sec-fetch-site");
    if (
      request.headers.get("host")?.toLowerCase() !==
        new URL(config.origin).host ||
      (site !== null && site !== "same-origin") ||
      (write && request.headers.get("origin") !== config.origin)
    )
      return failure(403, "forbidden");
    let raw: Record<string, unknown> | undefined;
    if (write) {
      if (
        request.headers
          .get("content-type")
          ?.split(";", 1)[0]
          .trim()
          .toLowerCase() !== "application/json"
      )
        return failure(415, "invalid");
      try {
        const input: unknown = await request.json();
        if (!input || typeof input !== "object" || Array.isArray(input))
          return failure(400, "invalid");
        raw = input as Record<string, unknown>;
      } catch {
        return failure(400, "invalid");
      }
      if (
        typeof raw.expectedUserId !== "string" ||
        !uuidPattern.test(raw.expectedUserId) ||
        typeof raw.requestId !== "string" ||
        !uuidPattern.test(raw.requestId)
      )
        return failure(400, "invalid");
    }
    const client = getRouteClient(request, cookieResponse);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return failure(401, "unauthenticated");
    if (write && raw) {
      const { expectedUserId, requestId, ...payload } = raw;
      if (expectedUserId !== data.user.id) return failure(403, "forbidden");
      const parsed = parseTaskInput(payload);
      if (!parsed.success)
        return reply({ kind: "invalid", errors: parsed.errors }, 400);
      return reply(
        await executeTaskCommand(client, {
          ...parsed.data,
          requestId: requestId as string,
        }),
      );
    }
    const params = request.nextUrl.searchParams;
    const expectedUserId = params.get("expectedUserId");
    if (
      expectedUserId !== null &&
      (!uuidPattern.test(expectedUserId) || expectedUserId !== data.user.id)
    )
      return failure(403, "forbidden");
    const allowed = [
      "expectedUserId",
      "caseOptions",
      "caseId",
      "page",
      "openOnly",
      "taskId",
      "audit",
      "requestId",
    ];
    if (
      [...params.keys()].some(
        (k) => !allowed.includes(k) || params.getAll(k).length !== 1,
      )
    )
      return failure(400, "invalid");
    const taskId = params.get("taskId");
    const requestId = params.get("requestId");
    const caseId = params.get("caseId");
    const pageRaw = params.get("page") ?? "1";
    if (
      (params.has("taskId") && !taskId) ||
      (params.has("requestId") && !requestId) ||
      (params.has("caseId") && !caseId)
    )
      return failure(400, "invalid");
    if (
      !/^[1-9]\d*$/.test(pageRaw) ||
      (taskId && !uuidPattern.test(taskId)) ||
      (requestId && !uuidPattern.test(requestId)) ||
      (caseId && !uuidPattern.test(caseId)) ||
      ["caseOptions", "openOnly", "audit"].some(
        (k) => params.has(k) && !["true", "false"].includes(params.get(k)!),
      )
    )
      return failure(400, "invalid");
    if (requestId) {
      if (
        taskId ||
        caseId ||
        params.has("caseOptions") ||
        params.has("audit") ||
        params.has("openOnly") ||
        params.has("page")
      )
        return failure(400, "invalid");
      return reply(await getTaskByRequestId(client, requestId));
    }
    if (taskId) {
      if (
        caseId ||
        params.has("caseOptions") ||
        params.has("openOnly") ||
        params.has("page")
      )
        return failure(400, "invalid");
      return reply(
        params.get("audit") === "true"
          ? { entries: await listTaskAudit(client, taskId) }
          : { task: await getTask(client, taskId) },
      );
    }
    if (params.has("audit")) return failure(400, "invalid");
    if (params.get("caseOptions") === "true") {
      if (caseId || params.has("openOnly")) return failure(400, "invalid");
      const result = await listRecruitmentCases(client, Number(pageRaw));
      return reply({
        ...result,
        cases: result.cases.map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
        })),
      });
    }
    return reply(
      await listTasks(client, {
        ...(caseId ? { caseId } : {}),
        openOnly: params.get("openOnly") === "true",
        page: Number(pageRaw),
      }),
    );
  } catch (error) {
    if (error instanceof CaseRepositoryError)
      return failure(
        error.kind === "stale" || error.kind === "conflict"
          ? 409
          : error.kind === "invalid"
            ? 400
            : 503,
        error.kind,
      );
    return failure(503, "unavailable");
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
