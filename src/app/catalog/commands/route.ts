import { type NextRequest, NextResponse } from "next/server";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { getAuthConfig } from "@/shared/server/env";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { parseCatalogCommand } from "@/modules/companies-contacts/domain/catalog";
import {
  CatalogError,
  executeCatalogCommand,
  getCatalogCommand,
  getCatalogProfile,
  listCatalogProfiles,
  listCatalogRelations,
  listCatalogAudit,
} from "@/modules/companies-contacts/application/catalog";
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
          "Nie udało się potwierdzić operacji katalogu. Zachowaj dane i spróbuj ponownie.",
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
      const { expectedUserId, ...payload } = raw;
      if (expectedUserId !== data.user.id) return failure(403, "forbidden");
      const parsed = parseCatalogCommand(payload);
      if (!parsed) return failure(400, "invalid");
      return reply(await executeCatalogCommand(client, parsed));
    }
    const params = request.nextUrl.searchParams;
    const expected = params.get("expectedUserId");
    if (expected !== null && expected !== data.user.id)
      return failure(403, "forbidden");
    const pageRaw = params.get("page") ?? "1";
    if (!/^[1-9]\d*$/.test(pageRaw)) return failure(400, "invalid");
    const page = Number(pageRaw);
    const routes = ["id", "type", "contextId", "auditId", "requestId"].filter(
      (k) => params.has(k),
    );
    if (routes.length !== 1) return failure(400, "invalid");
    if (params.has("id"))
      return reply({
        profile: await getCatalogProfile(client, params.get("id")!),
      });
    if (params.has("type")) {
      const type = params.get("type");
      if (type !== "organization" && type !== "contact")
        return failure(400, "invalid");
      return reply(await listCatalogProfiles(client, type, page));
    }
    if (params.has("contextId")) {
      const type = params.get("contextType");
      if (type !== "case" && type !== "organization" && type !== "contact")
        return failure(400, "invalid");
      return reply(
        await listCatalogRelations(
          client,
          type,
          params.get("contextId")!,
          page,
        ),
      );
    }
    if (params.has("auditId"))
      return reply(
        await listCatalogAudit(client, params.get("auditId")!, page),
      );
    return reply(await getCatalogCommand(client, params.get("requestId")!));
  } catch (error) {
    if (error instanceof CatalogError)
      return failure(
        error.kind === "invalid"
          ? 400
          : error.kind === "stale" || error.kind === "conflict"
            ? 409
            : 503,
        error.kind,
      );
    return failure(503, "unavailable");
  }
}
export const POST = (request: NextRequest) => handle(request, true);
export const GET = (request: NextRequest) => handle(request, false);
