import { NextResponse, type NextRequest } from "next/server";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { uploadDocument } from "@/modules/documents/application/upload";
import { fingerprintUpload } from "@/modules/documents/application/upload-fingerprint";
import {
  parseUploadIntent,
  uploadIntentDigest,
} from "@/modules/documents/application/upload-intent";
import { verifyOperationPermit } from "@/modules/documents/application/operation-permit";
import { getAuthConfig, getDocumentsSecrets } from "@/shared/server/env";

export const dynamic = "force-dynamic";
const maxRequestBytes = 21 * 1024 * 1024;

async function boundedForm(request: NextRequest): Promise<FormData> {
  if (!request.body) throw new Error("Invalid body");
  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxRequestBytes) throw new Error("Body too large");
      chunks.push(Uint8Array.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const multipart = new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body: new Blob(chunks),
  });
  return multipart.formData();
}

export async function POST(request: NextRequest) {
  const cookieResponse = protectAuthResponse(NextResponse.json({}));
  function reply(body: unknown, status = 200) {
    return protectAuthResponse(
      NextResponse.json(body, { status, headers: cookieResponse.headers }),
    );
  }
  try {
    const config = getAuthConfig();
    if (!config.enabled) return reply({ kind: "unavailable" }, 503);
    const site = request.headers.get("sec-fetch-site");
    if (
      request.headers.get("host")?.toLowerCase() !==
        new URL(config.origin).host ||
      request.headers.get("origin") !== config.origin ||
      (site !== null && site !== "same-origin")
    )
      return reply({ kind: "forbidden" }, 403);
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("multipart/form-data;")
    )
      return reply({ kind: "invalid" }, 415);
    const client = getRouteClient(request, cookieResponse);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return reply({ kind: "unauthenticated" }, 401);
    const form = await boundedForm(request);
    if (
      [...form.keys()].some((key) => key !== "file" && key !== "intent") ||
      form.getAll("file").length !== 1 ||
      form.getAll("intent").length !== 1
    )
      return reply({ kind: "invalid" }, 400);
    const file = form.get("file"),
      rawIntent = form.get("intent");
    if (!(file instanceof File) || typeof rawIntent !== "string")
      return reply({ kind: "invalid" }, 400);
    let value: unknown;
    try {
      value = JSON.parse(rawIntent);
    } catch {
      return reply({ kind: "invalid" }, 400);
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      return reply({ kind: "invalid" }, 400);
    const { expectedUserId, requestId, permit, ...intent } = value as Record<
      string,
      unknown
    >;
    if (
      typeof expectedUserId !== "string" ||
      !uuidPattern.test(expectedUserId) ||
      expectedUserId !== data.user.id
    )
      return reply({ kind: "forbidden" }, 403);
    if (typeof requestId !== "string" || !uuidPattern.test(requestId))
      return reply({ kind: "invalid" }, 400);
    const parsed = parseUploadIntent(intent);
    if (!parsed || typeof permit !== "string")
      return reply({ kind: "invalid" }, 400);
    const encodedSecret = getDocumentsSecrets().permit;
    if (!encodedSecret || !/^[A-Za-z0-9_-]+$/.test(encodedSecret))
      return reply({ kind: "unavailable" }, 503);
    const secret = Buffer.from(encodedSecret, "base64url");
    if (
      verifyOperationPermit(
        secret,
        permit,
        data.user.id,
        "upload",
        uploadIntentDigest(parsed),
      ) !== requestId
    )
      return reply({ kind: "forbidden" }, 403);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fingerprint = fingerprintUpload(bytes);
    if (
      parsed.filename !== file.name ||
      (parsed.mime !== "" && file.type.toLowerCase() !== parsed.mime) ||
      fingerprint.bytes !== parsed.bytes ||
      fingerprint.sha256 !== parsed.sha256
    )
      return reply({ kind: "invalid" }, 400);
    const domainIntent = {
      scope: parsed.scope,
      caseId: parsed.caseId,
      documentId: parsed.documentId,
      name: parsed.name,
      isCv: parsed.isCv,
      label: parsed.label,
    };
    const result = await uploadDocument(
      client,
      requestId,
      domainIntent,
      file.name,
      parsed.effectiveMime,
      bytes,
    );
    return reply(result);
  } catch {
    return reply(
      {
        kind: "unavailable",
        error:
          "Nie udało się potwierdzić zapisu. Sprawdź wynik przed ponowieniem.",
      },
      503,
    );
  }
}
