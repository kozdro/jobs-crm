import { NextResponse, type NextRequest } from "next/server";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { createOperationPermit } from "@/modules/documents/application/operation-permit";
import { deleteIntentDigest } from "@/modules/documents/application/delete-intent";
import {
  parseDocumentIntent,
  documentIntentDigest,
} from "@/modules/documents/application/document-intent";
import {
  parseSentIntent,
  sentIntentDigest,
} from "@/modules/documents/application/sent-intent";
import {
  parseUploadIntent,
  uploadIntentDigest,
} from "@/modules/documents/application/upload-intent";
import { getAuthConfig, getDocumentsSecrets } from "@/shared/server/env";

export const dynamic = "force-dynamic";

async function readSmallBody(request: NextRequest): Promise<string> {
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) throw new Error("Body too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8");
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
      request.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return reply({ kind: "invalid" }, 415);
    const client = getRouteClient(request, cookieResponse);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return reply({ kind: "unauthenticated" }, 401);
    const raw = await readSmallBody(request);
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return reply({ kind: "invalid" }, 400);
    const body = payload as Record<string, unknown>;
    if (
      Object.keys(body).some(
        (key) => !["expectedUserId", "operation", "intent"].includes(key),
      ) ||
      body.expectedUserId !== data.user.id ||
      (body.operation !== "upload" &&
        body.operation !== "delete" &&
        body.operation !== "sent" &&
        body.operation !== "document")
    )
      return reply({ kind: "invalid" }, 400);
    const intent =
      body.operation === "upload" ? parseUploadIntent(body.intent) : null;
    const sent =
      body.operation === "sent" ? parseSentIntent(body.intent) : null;
    const document =
      body.operation === "document" ? parseDocumentIntent(body.intent) : null;
    const digest =
      body.operation === "upload"
        ? intent
          ? uploadIntentDigest(intent)
          : null
        : body.operation === "delete"
          ? deleteIntentDigest(body.intent)
          : body.operation === "sent"
            ? sent
              ? sentIntentDigest(sent)
              : null
            : document
              ? documentIntentDigest(document)
              : null;
    if (!digest) return reply({ kind: "invalid" }, 400);
    const encodedSecret = getDocumentsSecrets().permit;
    if (!encodedSecret || !/^[A-Za-z0-9_-]+$/.test(encodedSecret))
      return reply({ kind: "unavailable" }, 503);
    const secret = Buffer.from(encodedSecret, "base64url");
    const result = createOperationPermit(
      secret,
      data.user.id,
      body.operation,
      digest,
    );
    return reply({ kind: "issued", ...result });
  } catch {
    return reply({ kind: "unavailable" }, 503);
  }
}
