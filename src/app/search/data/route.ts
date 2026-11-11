import { type NextRequest } from "next/server";
import {
  authenticated,
  response,
  errorStatus,
} from "@/modules/global-search/request";
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
      typeof v.query !== "string" ||
      !v.query.isWellFormed() ||
      v.query.includes("\0") ||
      [...v.query.trim()].length < 1 ||
      [...v.query.trim()].length > 200 ||
      ![3, 20].includes(v.limit as number) ||
      !v.pages ||
      typeof v.pages !== "object" ||
      Array.isArray(v.pages) ||
      Object.keys(v).some(
        (key) => !["expectedUserId", "query", "pages", "limit"].includes(key),
      )
    )
      return response({ kind: "invalid" }, 400, auth.headers);
    const { data, error } = await auth.client.rpc("global_search", {
      p_query: v.query,
      p_pages: v.pages,
      p_limit: v.limit,
    });
    if (error)
      return response(
        { kind: "unavailable" },
        errorStatus(error.code),
        auth.headers,
      );
    return response(data, 200, auth.headers);
  } catch {
    return response({ kind: "unavailable" }, 503);
  }
}
