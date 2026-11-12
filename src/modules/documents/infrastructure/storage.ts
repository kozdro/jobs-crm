import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getAuthConfig, getDocumentsSecrets } from "@/shared/server/env";
import { documentFileLimitBytes } from "../domain/limits";

const bucket = "documents";

/**
 * Tokens are separate, externally issued credentials. The database and Storage
 * policies must constrain each role to its pending or queued objects; these
 * checks do not turn an overprivileged token into a restricted one.
 */
function operatorClient(token: string | undefined) {
  const config = getAuthConfig();
  if (!config.enabled || !token)
    throw new Error("Documents operator unavailable");
  return createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}

/**
 * Call only after binding the reservation to the authenticated request. The
 * reservation's trusted byte count must equal the actual buffered payload.
 */
export async function uploadReservedObject(
  path: string,
  reservedBytes: number,
  bytes: Uint8Array,
  mime: string,
): Promise<void> {
  if (
    !Number.isSafeInteger(reservedBytes) ||
    reservedBytes < 1 ||
    reservedBytes > documentFileLimitBytes ||
    bytes.byteLength !== reservedBytes
  )
    throw new Error("Document reservation mismatch");
  const client = operatorClient(getDocumentsSecrets().uploader);
  const { error } = await client.storage.from(bucket).upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error("Document upload unconfirmed");
}

/** Must only be called after the current owner is verified by Auth. */
export async function authorizeDocumentDelete(
  ownerId: string,
  requestId: string,
  preview: string,
) {
  const client = operatorClient(getDocumentsSecrets().deleteAuthorizer);
  const { data, error } = await client.rpc("authorize_document_delete", {
    p_owner: ownerId,
    p_request_id: requestId,
    p_preview: preview,
  });
  if (
    error ||
    !["queued", "replayed"].includes(data?.kind) ||
    !Array.isArray(data.versionIds)
  )
    throw new Error("Document deletion unconfirmed");
  return data;
}
