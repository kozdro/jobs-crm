import { NextResponse, type NextRequest } from "next/server";
import { authenticated, response } from "@/modules/global-search/request";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { attachmentDisposition } from "@/modules/documents/domain/download";
import { documentFileLimitBytes } from "@/modules/documents/domain/limits";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

export const dynamic = "force-dynamic";
const supported = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/jpeg",
  "image/png",
]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ versionId: string }> },
) {
  try {
    const auth = await authenticated(request, false);
    if (!auth) return response({ kind: "unauthenticated" }, 401);
    const { versionId } = await context.params;
    if (!uuidPattern.test(versionId))
      return response({ kind: "not-found" }, 404, auth.headers);
    const { data, error } = await auth.client.rpc("document_download_target", {
      p_version_id: versionId,
    });
    if (error) return response({ kind: "unavailable" }, 503, auth.headers);
    if (!data) return response({ kind: "not-found" }, 404, auth.headers);
    if (
      typeof data.objectKey !== "string" ||
      !data.objectKey ||
      typeof data.filename !== "string" ||
      !data.filename ||
      typeof data.mime !== "string" ||
      !supported.has(data.mime) ||
      !Number.isSafeInteger(data.bytes) ||
      data.bytes < 1 ||
      data.bytes > documentFileLimitBytes
    )
      return response({ kind: "unavailable" }, 503, auth.headers);
    // This request carries the user's JWT; Storage performs its own owner/ready
    // check after the SQL lookup, including a concurrent delete transition.
    const { data: file, error: storageError } = await auth.client.storage
      .from("documents")
      .download(data.objectKey);
    if (storageError || !file || file.size !== data.bytes)
      return response({ kind: "unavailable" }, 503, auth.headers);
    const result = protectAuthResponse(
      new NextResponse(file, { status: 200, headers: auth.headers }),
    );
    result.headers.set("Content-Type", data.mime);
    result.headers.set(
      "Content-Disposition",
      attachmentDisposition(data.filename),
    );
    result.headers.set("Content-Length", String(file.size));
    return result;
  } catch {
    return response({ kind: "unavailable" }, 503);
  }
}
