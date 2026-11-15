import { NextResponse, type NextRequest } from "next/server";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { authorizeDocumentDelete } from "@/modules/documents/infrastructure/storage";
import { deleteIntentDigest } from "@/modules/documents/application/delete-intent";
import { verifyOperationPermit } from "@/modules/documents/application/operation-permit";
import {
  parseSentIntent,
  sentIntentDigest,
} from "@/modules/documents/application/sent-intent";
import {
  parseDocumentIntent,
  documentIntentDigest,
} from "@/modules/documents/application/document-intent";
import { getAuthConfig, getDocumentsSecrets } from "@/shared/server/env";

export const dynamic = "force-dynamic";
async function readBody(request: NextRequest) {
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) throw new Error("Body too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
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
    // getUser contacts Auth, including for every irreversible delete initiation.
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return reply({ kind: "unauthenticated" }, 401);
    const raw = await readBody(request);
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return reply({ kind: "invalid" }, 400);
    const payload = raw as Record<string, unknown>;
    if (
      payload.expectedUserId !== data.user.id ||
      typeof payload.requestId !== "string" ||
      !uuidPattern.test(payload.requestId)
    )
      return reply({ kind: "forbidden" }, 403);
    if (payload.action === "preview-delete") {
      if (
        Object.keys(payload).some(
          (key) =>
            ![
              "action",
              "expectedUserId",
              "requestId",
              "versionId",
              "documentId",
            ].includes(key),
        )
      )
        return reply({ kind: "invalid" }, 400);
      const versionId = payload.versionId ?? null,
        documentId = payload.documentId ?? null;
      if (
        (versionId === null) === (documentId === null) ||
        (versionId !== null &&
          (typeof versionId !== "string" || !uuidPattern.test(versionId))) ||
        (documentId !== null &&
          (typeof documentId !== "string" || !uuidPattern.test(documentId)))
      )
        return reply({ kind: "invalid" }, 400);
      const result = await client.rpc("preview_document_delete", {
        p_version_id: versionId,
        p_document_id: documentId,
      });
      if (result.error || result.data?.kind !== "saved")
        return reply({ kind: "unavailable" }, 503);
      return reply(result.data);
    }
    if (payload.action === "delete-confirm") {
      if (
        Object.keys(payload).some(
          (key) =>
            ![
              "action",
              "expectedUserId",
              "requestId",
              "previewToken",
              "permit",
            ].includes(key),
        ) ||
        typeof payload.permit !== "string" ||
        typeof payload.previewToken !== "string" ||
        !uuidPattern.test(payload.previewToken)
      )
        return reply({ kind: "invalid" }, 400);
      const encodedSecret = getDocumentsSecrets().permit;
      const digest = deleteIntentDigest({ previewToken: payload.previewToken });
      if (!encodedSecret || !/^[A-Za-z0-9_-]+$/.test(encodedSecret) || !digest)
        return reply({ kind: "unavailable" }, 503);
      if (
        verifyOperationPermit(
          Buffer.from(encodedSecret, "base64url"),
          payload.permit,
          data.user.id,
          "delete",
          digest,
        ) !== payload.requestId
      )
        return reply({ kind: "forbidden" }, 403);
      const result = await authorizeDocumentDelete(
        data.user.id,
        payload.requestId,
        payload.previewToken,
      );
      return reply({
        ...result,
        kind: result.kind === "replayed" ? "replayed" : "saved",
      });
    }
    if (
      ["sent-add", "sent-correct", "sent-withdraw"].includes(
        payload.action as string,
      )
    ) {
      const {
        expectedUserId: _user,
        requestId: _request,
        permit,
        ...rawIntent
      } = payload;
      // The user and request were verified above and are not part of the intent digest.
      void _user;
      void _request;
      const intent = parseSentIntent(rawIntent);
      const encodedSecret = getDocumentsSecrets().permit;
      if (!intent || typeof permit !== "string")
        return reply({ kind: "invalid" }, 400);
      if (!encodedSecret || !/^[A-Za-z0-9_-]+$/.test(encodedSecret))
        return reply({ kind: "unavailable" }, 503);
      if (
        verifyOperationPermit(
          Buffer.from(encodedSecret, "base64url"),
          permit,
          data.user.id,
          "sent",
          sentIntentDigest(intent),
        ) !== payload.requestId
      )
        return reply({ kind: "forbidden" }, 403);
      const sent = await client.rpc("execute_document_sent_command", {
        p_request_id: payload.requestId,
        p_payload: intent,
      });
      if (sent.error)
        return reply(
          {
            kind:
              sent.error.code === "PT409" || sent.error.code === "PT412"
                ? "conflict"
                : "unavailable",
          },
          sent.error.code === "PT409" || sent.error.code === "PT412"
            ? 409
            : 503,
        );
      if (!sent.data || !["saved", "replayed"].includes(sent.data.kind))
        return reply({ kind: "unavailable" }, 503);
      return reply(sent.data);
    }
    if (
      ["rename", "label", "attach", "detach", "change-version"].includes(
        payload.action as string,
      )
    ) {
      const {
        expectedUserId: _user,
        requestId: _request,
        permit,
        ...rawIntent
      } = payload;
      void _user;
      void _request;
      const intent = parseDocumentIntent(rawIntent);
      const encodedSecret = getDocumentsSecrets().permit;
      if (!intent || typeof permit !== "string")
        return reply({ kind: "invalid" }, 400);
      if (!encodedSecret || !/^[A-Za-z0-9_-]+$/.test(encodedSecret))
        return reply({ kind: "unavailable" }, 503);
      if (
        verifyOperationPermit(
          Buffer.from(encodedSecret, "base64url"),
          permit,
          data.user.id,
          "document",
          documentIntentDigest(intent),
        ) !== payload.requestId
      )
        return reply({ kind: "forbidden" }, 403);
      const result = await client.rpc("execute_document_command", {
        p_request_id: payload.requestId,
        p_payload: intent,
      });
      if (result.error)
        return reply(
          {
            kind:
              result.error.code === "PT409" || result.error.code === "PT412"
                ? "conflict"
                : "unavailable",
          },
          result.error.code === "PT409" || result.error.code === "PT412"
            ? 409
            : 503,
        );
      if (!result.data || !["saved", "replayed"].includes(result.data.kind))
        return reply({ kind: "unavailable" }, 503);
      return reply(result.data);
    }
    return reply({ kind: "unavailable" }, 503);
  } catch {
    return reply(
      {
        kind: "unavailable",
        error:
          "Nie udało się potwierdzić operacji. Sprawdź wynik przed ponowieniem.",
      },
      503,
    );
  }
}
