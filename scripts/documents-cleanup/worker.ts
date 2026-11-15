import type { SupabaseClient } from "@supabase/supabase-js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Performs one retryable cleanup pass; no names, tokens or provider errors are logged. */
export async function runCleanupBatch(client: SupabaseClient) {
  const abandoned = await client.rpc("enqueue_abandoned_documents", {
    p_limit: 50,
  });
  if (abandoned.error) throw new Error("Cleanup queue unavailable");
  const list = await client.rpc("list_document_cleanup", { p_limit: 50 });
  if (list.error || !Array.isArray(list.data))
    throw new Error("Cleanup queue unavailable");
  let confirmed = 0;
  let pending = 0;
  for (const value of list.data) {
    if (
      !value ||
      typeof value !== "object" ||
      typeof value.versionId !== "string" ||
      !uuid.test(value.versionId) ||
      typeof value.objectKey !== "string" ||
      !uuid.test(value.objectKey)
    )
      throw new Error("Invalid cleanup queue item");
    const removed = await client.storage
      .from("documents")
      .remove([value.objectKey]);
    if (removed.error || !Array.isArray(removed.data)) {
      pending++;
      continue;
    }
    // An empty successful removal can mean a previous response was lost. The
    // confirmation RPC independently requires a queued item and no Storage row.
    const acknowledgment = await client.rpc("confirm_document_cleanup", {
      p_version_id: value.versionId,
    });
    if (acknowledgment.error || acknowledgment.data?.kind !== "confirmed") {
      pending++;
      continue;
    }
    confirmed++;
  }
  const purge = await client.rpc("purge_expired_document_ledgers");
  if (purge.error) throw new Error("Cleanup ledger unavailable");
  return { confirmed, pending };
}
