import { type NextRequest, NextResponse } from "next/server";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { getAuthConfig } from "@/shared/server/env";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { parseCalendarCommand } from "@/modules/recruitment/domain/calendar";
import { CaseRepositoryError } from "@/modules/recruitment/application/cases";
import {
  executeCalendarCommand,
  getCalendarByRequestId,
  getCalendarEvent,
  listCalendarAudit,
  listCalendarEvents,
} from "@/modules/recruitment/application/calendar";
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
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return fail(401, "unauthenticated");
    if (write) {
      if (
        request.headers
          .get("content-type")
          ?.split(";", 1)[0]
          .trim()
          .toLowerCase() !== "application/json"
      )
        return fail(415, "invalid");
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return fail(400, "invalid");
      }
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return fail(400, "invalid");
      const { expectedUserId, ...payload } = raw as Record<string, unknown>;
      if (expectedUserId !== data.user.id) return fail(403, "forbidden");
      const parsed = parseCalendarCommand(payload);
      if (!parsed.success)
        return reply({ kind: "invalid", errors: parsed.errors }, 400);
      return reply(await executeCalendarCommand(client, parsed.data));
    }
    const params = request.nextUrl.searchParams;
    const allowed = [
      "expectedUserId",
      "eventId",
      "requestId",
      "caseId",
      "contactId",
      "filter",
      "page",
      "audit",
    ];
    if (
      [...params.keys()].some(
        (k) => !allowed.includes(k) || params.getAll(k).length !== 1,
      )
    )
      return fail(400, "invalid");
    const expected = params.get("expectedUserId");
    if (expected !== null && expected !== data.user.id)
      return fail(403, "forbidden");
    const eventId = params.get("eventId"),
      requestId = params.get("requestId"),
      caseId = params.get("caseId"),
      contactId = params.get("contactId"),
      page = params.get("page") ?? "1";
    const filter = params.get("filter");
    if (
      [eventId, requestId, caseId, contactId].some(
        (id) => id !== null && !uuidPattern.test(id),
      ) ||
      !/^[1-9]\d*$/.test(page) ||
      Number(page) > 1000000 ||
      (filter !== null && !["all", "upcoming", "attention"].includes(filter))
    )
      return fail(400, "invalid");
    if (requestId) {
      if (
        eventId ||
        caseId ||
        contactId ||
        filter ||
        params.has("page") ||
        params.has("audit")
      )
        return fail(400, "invalid");
      return reply(await getCalendarByRequestId(client, requestId));
    }
    if (eventId) {
      if (
        caseId ||
        contactId ||
        filter ||
        params.has("page") ||
        (params.has("audit") && params.get("audit") !== "true")
      )
        return fail(400, "invalid");
      return reply(
        params.has("audit")
          ? { entries: await listCalendarAudit(client, eventId) }
          : { event: await getCalendarEvent(client, eventId) },
      );
    }
    if (params.has("audit") || (caseId && contactId))
      return fail(400, "invalid");
    return reply(
      await listCalendarEvents(client, {
        ...(caseId ? { caseId } : {}),
        ...(contactId ? { contactId } : {}),
        ...(filter
          ? { filter: filter as "all" | "upcoming" | "attention" }
          : {}),
        page: Number(page),
      }),
    );
  } catch (error) {
    if (error instanceof CaseRepositoryError)
      return fail(
        error.kind === "stale" || error.kind === "conflict"
          ? 409
          : error.kind === "invalid"
            ? 400
            : 503,
        error.kind,
      );
    return fail(503, "unavailable");
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
