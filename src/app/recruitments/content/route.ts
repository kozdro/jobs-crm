import { type NextRequest } from "next/server";
import {
  authenticated,
  response,
  errorStatus,
} from "@/modules/global-search/request";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticated(request, true);
    if (!auth) return response({ kind: "unauthenticated" }, 401);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return response({ kind: "invalid" }, 400, auth.headers);
    const v = body as Record<string, unknown>;
    if (
      v.expectedUserId !== auth.userId ||
      typeof v.requestId !== "string" ||
      !uuidPattern.test(v.requestId) ||
      !v.payload ||
      typeof v.payload !== "object" ||
      Array.isArray(v.payload) ||
      Object.keys(v).some(
        (k) => !["expectedUserId", "requestId", "payload"].includes(k),
      )
    )
      return response({ kind: "invalid" }, 400, auth.headers);
    const { data, error } = await auth.client.rpc(
      "execute_case_content_command",
      { p_request_id: v.requestId, p_payload: v.payload },
    );
    if (error?.code === "PT409") {
      const payload = v.payload as Record<string, unknown>;
      if (
        (payload.operation === "add-link" ||
          payload.operation === "correct-link") &&
        typeof payload.caseId === "string" &&
        uuidPattern.test(payload.caseId) &&
        typeof payload.url === "string"
      ) {
        // A conflicting replay is different from a duplicate link. Check the
        // persisted owner-scoped receipt first, without returning its payload.
        const receipt = await auth.client
          .from("case_content_command")
          .select("request_id")
          .eq("request_id", v.requestId)
          .maybeSingle();
        if (receipt.error)
          return response({ kind: "unavailable" }, 503, auth.headers);
        if (!receipt.data) {
          const duplicate = await auth.client.rpc("find_case_link_duplicate", {
            p_case_id: payload.caseId,
            p_url: payload.url,
            p_exclude_source:
              payload.operation === "correct-link" ? payload.source : null,
            p_exclude_id:
              payload.operation === "correct-link" ? payload.id : null,
          });
          if (duplicate.error)
            return response({ kind: "unavailable" }, 503, auth.headers);
          if (duplicate.data)
            return response(
              { kind: "duplicate", match: duplicate.data },
              409,
              auth.headers,
            );
        }
      }
    }
    if (error)
      return response(
        {
          kind:
            error.code === "PT409"
              ? "conflict"
              : error.code === "PT412"
                ? "stale"
                : "unavailable",
        },
        errorStatus(error.code),
        auth.headers,
      );
    return response(data, 200, auth.headers);
  } catch {
    return response({ kind: "unavailable" }, 503);
  }
}
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticated(request, false);
    if (!auth) return response({ kind: "unauthenticated" }, 401);
    const expectedUserId = request.nextUrl.searchParams.get("expectedUserId");
    if (expectedUserId !== null && expectedUserId !== auth.userId)
      return response({ kind: "forbidden" }, 403, auth.headers);
    const requestId = request.nextUrl.searchParams.get("requestId");
    if (requestId !== null) {
      if (!uuidPattern.test(requestId) || expectedUserId !== auth.userId)
        return response({ kind: "invalid" }, 400, auth.headers);
      const { data, error } = await auth.client
        .from("case_content_command")
        .select("result")
        .eq("request_id", requestId)
        .maybeSingle();
      if (error) return response({ kind: "unavailable" }, 503, auth.headers);
      return response(
        data?.result?.kind === "cancelled"
          ? { kind: "cancelled" }
          : data
            ? { kind: "found", result: data.result }
            : { kind: "not-found" },
        200,
        auth.headers,
      );
    }
    const caseId = request.nextUrl.searchParams.get("caseId");
    if (!caseId || !uuidPattern.test(caseId))
      return response({ kind: "invalid" }, 400, auth.headers);
    const { data: item, error: caseError } = await auth.client
      .from("recruitment_case")
      .select("id")
      .eq("id", caseId)
      .maybeSingle();
    if (caseError) return response({ kind: "unavailable" }, 503, auth.headers);
    if (!item) return response({ kind: "not-found" }, 404, auth.headers);
    const parsePage = (name: string) => {
      const raw = request.nextUrl.searchParams.get(name) ?? "1";
      const n = Number(raw);
      return /^[1-9][0-9]*$/.test(raw) &&
        Number.isSafeInteger(n) &&
        n <= Math.floor(Number.MAX_SAFE_INTEGER / 25)
        ? n
        : null;
    };
    const notesPage = parsePage("notesPage");
    const linksPage = parsePage("linksPage");
    const auditPage = parsePage("auditPage");
    const noteId = request.nextUrl.searchParams.get("noteId");
    const linkId = request.nextUrl.searchParams.get("linkId");
    const linkSource = request.nextUrl.searchParams.get("linkSource");
    const auditTarget = request.nextUrl.searchParams.get("auditTarget");
    if (
      notesPage === null ||
      linksPage === null ||
      auditPage === null ||
      [noteId, linkId, auditTarget].some(
        (id) => id !== null && !uuidPattern.test(id),
      ) ||
      (linkId !== null && !["legacy", "additional"].includes(linkSource ?? ""))
    )
      return response({ kind: "invalid" }, 400, auth.headers);
    const auditQuery = auth.client
      .from("case_content_command")
      .select("id,case_id,target_id,before_values,after_values,recorded_at")
      .eq("case_id", caseId)
      .neq("payload->>operation", "reconcile-fence");
    if (auditTarget)
      auditQuery.or(
        `target_id.eq.${auditTarget},before_values->reordered->>id.eq.${auditTarget}`,
      );
    const [notes, links, audit, targetNote, targetLink, timelinePage] =
      await Promise.all([
        auth.client
          .from("case_note")
          .select(
            "id,case_id,body,date_kind,occurred_on,voided,revision,created_at",
          )
          .eq("case_id", caseId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range((notesPage - 1) * 25, notesPage * 25),
        auth.client
          .from("case_link_current")
          .select(
            "id,case_id,source,url,role,position,voided,revision,created_at",
          )
          .eq("case_id", caseId)
          .order("position")
          .order("id")
          .range((linksPage - 1) * 25, linksPage * 25),
        auditQuery
          .order("recorded_at", { ascending: false })
          .order("id", { ascending: false })
          .range((auditPage - 1) * 25, auditPage * 25),
        noteId
          ? auth.client
              .from("case_note")
              .select(
                "id,case_id,body,date_kind,occurred_on,voided,revision,created_at",
              )
              .eq("case_id", caseId)
              .eq("id", noteId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        linkId
          ? auth.client
              .from("case_link_current")
              .select(
                "id,case_id,source,url,role,position,voided,revision,created_at",
              )
              .eq("case_id", caseId)
              .eq("id", linkId)
              .eq("source", linkSource)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        noteId
          ? auth.client.rpc("case_note_timeline_page", {
              p_case_id: caseId,
              p_note_id: noteId,
            })
          : Promise.resolve({ data: null, error: null }),
      ]);
    if (
      notes.error ||
      links.error ||
      audit.error ||
      targetNote.error ||
      targetLink.error ||
      timelinePage.error
    )
      return response({ kind: "unavailable" }, 503, auth.headers);
    return response(
      {
        notes: notes.data.slice(0, 25),
        links: links.data.slice(0, 25),
        audit: audit.data.slice(0, 25),
        hasMoreNotes: notes.data.length > 25,
        hasMoreLinks: links.data.length > 25,
        hasMoreAudit: audit.data.length > 25,
        targetNote: targetNote.data,
        targetLink: targetLink.data,
        timelinePage: timelinePage.data,
      },
      200,
      auth.headers,
    );
  } catch {
    return response({ kind: "unavailable" }, 503);
  }
}
