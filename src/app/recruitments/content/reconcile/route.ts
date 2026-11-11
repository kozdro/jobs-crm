import { type NextRequest } from "next/server";
import {
  authenticated,
  errorStatus,
  response,
} from "@/modules/global-search/request";
import { parseReconcileRequest } from "@/modules/global-search/reconcile";

export const dynamic = "force-dynamic";

/** Serialize a user's explicit recovery decision with the original command. */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticated(request, true);
    if (!auth) return response({ kind: "unauthenticated" }, 401);
    const body: unknown = await request.json();
    const value = parseReconcileRequest(body, auth.userId);
    if (!value) return response({ kind: "invalid" }, 400, auth.headers);
    const { data, error } = await auth.client.rpc("case_content_reconcile", {
      p_case_id: value.caseId,
      p_request_id: value.requestId,
    });
    if (error)
      return response(
        { kind: "unavailable" },
        errorStatus(error.code),
        auth.headers,
      );
    if (
      !data ||
      typeof data !== "object" ||
      !["found", "cancelled"].includes(data.kind) ||
      (data.kind === "found" &&
        (!data.result || typeof data.result !== "object"))
    )
      return response({ kind: "unavailable" }, 503, auth.headers);
    return response(data, 200, auth.headers);
  } catch {
    return response({ kind: "unavailable" }, 503);
  }
}
