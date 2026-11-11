import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readRecruitmentTarget } from "../recruitment/target.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type RestoreLedgerEntry = {
  versionId: string;
  ownerId: string;
  documentId: string;
  objectKey: string;
};
export type HeldLedger = {
  publication: "blocked";
  entries: readonly Readonly<RestoreLedgerEntry>[];
  sourceProjectId?: string;
};
const heldLedgers = new WeakSet<object>();
export function isHeldLedger(value: unknown): value is HeldLedger {
  return typeof value === "object" && value !== null && heldLedgers.has(value);
}

/** Local QA only; source identity is verified by the disposable target guard. */
export async function captureLocalHeldLedger(
  sourceId: string,
  roleJwt: string,
  holdId: string,
  oldestSnapshotAt: string,
): Promise<HeldLedger> {
  if (!/^restore-qa-[a-z0-9-]+$/.test(sourceId) || !roleJwt)
    throw new Error("Invalid local restore source");
  const target = await readRecruitmentTarget(sourceId);
  if (
    !target.storage ||
    !["127.0.0.1", "localhost", "[::1]"].includes(
      new URL(target.apiUrl).hostname,
    )
  )
    throw new Error("Restore source is not isolated");
  const client = createClient(target.apiUrl, target.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${roleJwt}` },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  const captured = await captureHeldLedger(client, holdId, oldestSnapshotAt);
  const result: HeldLedger = Object.freeze({
    publication: "blocked",
    entries: captured.entries,
    sourceProjectId: target.projectId,
  });
  heldLedgers.add(result);
  return result;
}

/**
 * Source-only snapshot. It deliberately never releases a hold or publishes a
 * restore: later insertions can sort before the cursor and must be reconciled
 * during a separately fenced cutover. The source credential is role restricted.
 */
export async function captureHeldLedger(
  client: SupabaseClient,
  holdId: string,
  oldestSnapshotAt: string,
): Promise<HeldLedger> {
  if (!uuid.test(holdId) || !Number.isFinite(Date.parse(oldestSnapshotAt)))
    throw new Error("Invalid restore request");
  const hold = await client.rpc("begin_document_restore_hold", {
    p_id: holdId,
    p_oldest_snapshot_at: oldestSnapshotAt,
  });
  if (hold.error || hold.data?.kind !== "held" || hold.data.id !== holdId)
    throw new Error("Restore hold unavailable");
  const entries: RestoreLedgerEntry[] = [];
  let after: string | null = null;
  for (;;) {
    const page: { data: unknown; error: unknown } = await client.rpc(
      "list_document_restore_ledger",
      {
        p_id: holdId,
        p_after: after,
        p_limit: 100,
      },
    );
    if (page.error || !Array.isArray(page.data) || page.data.length > 100)
      throw new Error("Restore ledger unavailable");
    for (const value of page.data as unknown[]) {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid restore ledger page");
      const row = value as Record<string, unknown>;
      if (
        typeof row.versionId !== "string" ||
        !uuid.test(row.versionId) ||
        typeof row.ownerId !== "string" ||
        !uuid.test(row.ownerId) ||
        typeof row.documentId !== "string" ||
        !uuid.test(row.documentId) ||
        typeof row.objectKey !== "string" ||
        !uuid.test(row.objectKey) ||
        (after && row.versionId.toLowerCase() <= after.toLowerCase())
      )
        throw new Error("Invalid restore ledger page");
      entries.push({
        versionId: row.versionId,
        ownerId: row.ownerId,
        documentId: row.documentId,
        objectKey: row.objectKey,
      });
      after = row.versionId;
    }
    if (page.data.length < 100) break;
  }
  const result: HeldLedger = Object.freeze({
    publication: "blocked",
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
  });
  heldLedgers.add(result);
  return result;
}
