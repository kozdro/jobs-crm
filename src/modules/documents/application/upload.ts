import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { fingerprintUpload } from "./upload-fingerprint";
import { uploadReservedObject } from "../infrastructure/storage";
import { validatePendingVersion } from "../infrastructure/validator-client";

/** Orchestrates only an already authenticated and owner-bound request. */
export async function uploadDocument(
  client: SupabaseClient,
  requestId: string,
  intent: Record<string, unknown>,
  filename: string,
  mime: string,
  bytes: Uint8Array,
) {
  if (!uuidPattern.test(requestId)) throw new Error("Invalid document intent");
  const fingerprint = fingerprintUpload(bytes);
  const { data, error } = await client.rpc("reserve_document_upload", {
    p_request_id: requestId,
    p_intent: {
      ...intent,
      filename,
      mime,
      ...fingerprint,
    },
  });
  if (
    error ||
    !data ||
    !["reserved", "replayed"].includes(data.kind) ||
    typeof data.versionId !== "string" ||
    !uuidPattern.test(data.versionId) ||
    typeof data.documentId !== "string" ||
    !uuidPattern.test(data.documentId) ||
    typeof data.objectKey !== "string" ||
    !uuidPattern.test(data.objectKey)
  )
    throw new Error("Document reservation unconfirmed");
  try {
    await uploadReservedObject(data.objectKey, fingerprint.bytes, bytes, mime);
  } catch {
    // A lost upload response is resolved by re-reading pending bytes below.
  }
  await validatePendingVersion(data.versionId);
  return {
    kind: "saved" as const,
    documentId: data.documentId,
    versionId: data.versionId,
  };
}
