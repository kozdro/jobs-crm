import { type NextRequest, NextResponse } from "next/server";
import {
  createRecruitmentCase,
  CaseRepositoryError,
} from "@/modules/recruitment/application/cases";
import {
  parseCreateCaseInput,
  uuidPattern,
} from "@/modules/recruitment/domain/recruitment-case";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { getAuthConfig } from "@/shared/server/env";

import { parseRecordCaseEventInput } from "@/modules/recruitment/domain/case-events";
import { recordRecruitmentCaseEvent } from "@/modules/recruitment/application/case-events";

export const dynamic = "force-dynamic";

/** Domain command: validation, browser identity binding and cookie/CSRF boundary. */
export async function POST(request: NextRequest) {
  const cookieResponse = protectAuthResponse(NextResponse.json({}));
  function reply(body: unknown, status = 200) {
    return protectAuthResponse(
      NextResponse.json(body, { status, headers: cookieResponse.headers }),
    );
  }
  function failure(status: number, kind: string) {
    return reply(
      {
        error: "Nie udało się potwierdzić zapisu. Zachowaj dane i ponów próbę.",
        kind,
      },
      status,
    );
  }
  try {
    const config = getAuthConfig();
    if (!config.enabled) return failure(503, "unavailable");
    const site = request.headers.get("sec-fetch-site");
    if (
      request.headers.get("host")?.toLowerCase() !==
        new URL(config.origin).host ||
      request.headers.get("origin") !== config.origin ||
      (site !== null && site !== "same-origin")
    )
      return failure(403, "forbidden");
    if (
      request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return failure(415, "invalid");
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return failure(400, "invalid");
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return failure(400, "invalid");
    const { expectedUserId, ...payload } = raw as Record<string, unknown>;
    if (typeof expectedUserId !== "string" || !uuidPattern.test(expectedUserId))
      return failure(400, "invalid");
    const eventAction = payload.action === "record-event";
    const eventPayload = { ...payload };
    if (eventAction) delete eventPayload.action;
    const parsed = eventAction
      ? parseRecordCaseEventInput(eventPayload)
      : parseCreateCaseInput(payload);
    if (!parsed.success)
      return reply({ kind: "invalid", errors: parsed.errors }, 400);
    const client = getRouteClient(request, cookieResponse);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return failure(401, "unauthenticated");
    if (data.user.id !== expectedUserId) return failure(403, "forbidden");
    const result =
      "caseId" in parsed.data
        ? await recordRecruitmentCaseEvent(client, parsed.data)
        : await createRecruitmentCase(client, parsed.data);
    return reply(result);
  } catch (error) {
    if (error instanceof CaseRepositoryError)
      return failure(
        error.kind === "conflict" || error.kind === "stale"
          ? 409
          : error.kind === "invalid"
            ? 400
            : 503,
        error.kind,
      );
    // Never log/return private SQL/provider payloads or tokens.
    return failure(503, "unavailable");
  }
}
