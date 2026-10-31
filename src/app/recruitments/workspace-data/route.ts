import { type NextRequest, NextResponse } from "next/server";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { getAuthConfig } from "@/shared/server/env";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import {
  parseWorkspaceQuery,
  workspacePage,
} from "@/modules/recruitment/domain/workspace";
import { CaseRepositoryError } from "@/modules/recruitment/application/cases";
import {
  loadWorkspace,
  loadWorkspacePreview,
  listWorkspaceProfiles,
} from "@/modules/recruitment/application/workspace-read";

export const dynamic = "force-dynamic";

/** Authenticated read-only DTO boundary. No command, audit, or lifecycle writes. */
export async function GET(request: NextRequest) {
  const cookieResponse = protectAuthResponse(NextResponse.json({}));
  const reply = (body: unknown, status = 200) =>
    protectAuthResponse(
      NextResponse.json(body, { status, headers: cookieResponse.headers }),
    );
  const fail = (status: number, kind: string) =>
    reply(
      { kind, error: "Nie udało się pobrać danych. Spróbuj ponownie." },
      status,
    );
  try {
    const config = getAuthConfig();
    if (!config.enabled) return fail(503, "unavailable");
    const site = request.headers.get("sec-fetch-site");
    if (
      request.headers.get("host")?.toLowerCase() !==
        new URL(config.origin).host ||
      (site !== null && site !== "same-origin")
    )
      return fail(403, "forbidden");
    const params = request.nextUrl.searchParams;
    const expected = params.get("expectedUserId");
    if (
      !expected ||
      !uuidPattern.test(expected) ||
      params.getAll("expectedUserId").length !== 1
    )
      return fail(400, "invalid");
    const client = getRouteClient(request, cookieResponse);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return fail(401, "unauthenticated");
    if (data.user.id !== expected) return fail(403, "forbidden");
    const mode = params.get("mode") ?? "workspace";
    if (params.getAll("mode").length > 1) return fail(400, "invalid");
    if (mode === "preview") {
      const id = params.get("id");
      if (!id || !uuidPattern.test(id) || params.getAll("id").length !== 1)
        return fail(400, "invalid");
      const result = await loadWorkspacePreview(client, id);
      return result ? reply(result) : fail(404, "not-found");
    }
    if (mode === "options") {
      const type = params.get("type");
      if (
        (type !== "organization" && type !== "contact") ||
        params.getAll("type").length !== 1 ||
        params.getAll("page").length > 1 ||
        params.getAll("id").length > 1
      )
        return fail(400, "invalid");
      return reply(
        await listWorkspaceProfiles(
          client,
          type,
          workspacePage(params.get("page")),
          params.get("id"),
        ),
      );
    }
    if (mode !== "workspace") return fail(400, "invalid");
    return reply(await loadWorkspace(client, parseWorkspaceQuery(params)));
  } catch (error) {
    const invalid =
      (error instanceof CaseRepositoryError && error.kind === "invalid") ||
      (error instanceof Error && error.message === "Invalid workspace query");
    return fail(invalid ? 400 : 503, invalid ? "invalid" : "unavailable");
  }
}
