import { type NextRequest, NextResponse } from "next/server";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { getAuthConfig } from "@/shared/server/env";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { parseLifecycleInput } from "@/modules/recruitment/domain/lifecycle";
import { CaseRepositoryError } from "@/modules/recruitment/application/cases";
import {
  previewLifecycle,
  confirmLifecycle,
  listLifecycleEntries,
  listRecruitmentTimeline,
  listClosureRevisions,
  getLifecycleByRequestId,
} from "@/modules/recruitment/application/lifecycle";

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
        !uuidPattern.test(raw.expectedUserId)
      )
        return failure(400, "invalid");
    }
    const client = getRouteClient(request, cookieResponse);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return failure(401, "unauthenticated");
    if (write && raw) {
      const { expectedUserId, action, ...payload } = raw;
      if (expectedUserId !== data.user.id) return failure(403, "forbidden");
      if (action !== "preview" && action !== "confirm")
        return failure(400, "invalid");
      const parsed = parseLifecycleInput(payload, action === "confirm");
      if (!parsed.success)
        return reply({ kind: "invalid", errors: parsed.errors }, 400);
      if (action === "confirm" && "requestId" in parsed.data)
        return reply(await confirmLifecycle(client, parsed.data));
      return reply({
        kind: "preview",
        preview: await previewLifecycle(client, parsed.data),
      });
    }
    const params = request.nextUrl.searchParams;
    const expectedUserId = params.get("expectedUserId");
    if (
      expectedUserId !== null &&
      (!uuidPattern.test(expectedUserId) || expectedUserId !== data.user.id)
    )
      return failure(403, "forbidden");
    const caseId = params.get("caseId") ?? "";
    const closureId = params.get("closureId");
    const requestId = params.get("requestId");
    if (!uuidPattern.test(caseId) || (closureId && requestId))
      return failure(400, "invalid");
    if (closureId)
      return reply({
        revisions: await listClosureRevisions(client, caseId, closureId),
      });
    if (requestId)
      return reply(await getLifecycleByRequestId(client, caseId, requestId));
    const pageRaw = params.get("page") ?? "1";
    if (!/^[1-9]\d*$/.test(pageRaw)) return failure(400, "invalid");
    return reply(
      params.get("timeline") === "true"
        ? await listRecruitmentTimeline(client, caseId, Number(pageRaw))
        : await listLifecycleEntries(client, caseId, Number(pageRaw)),
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
export const POST = (request: NextRequest) => handle(request, true);
export const GET = (request: NextRequest) => handle(request, false);
