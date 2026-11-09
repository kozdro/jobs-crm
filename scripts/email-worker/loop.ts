import { setTimeout as delay } from "node:timers/promises";
import type { Sql } from "postgres";
import type { DeliveryTransport } from "./core.ts";
import { processQueueOnce } from "./queue.ts";

/** Caller supplies an explicitly configured transport, database role and shutdown signal. */
export async function runWorker(
  sql: Sql,
  transport: DeliveryTransport,
  applicationUrl: URL,
  signal: AbortSignal,
): Promise<void> {
  let nextPurge = 0;
  while (!signal.aborted) {
    if (Date.now() >= nextPurge) {
      await sql`select email_reminder.purge_terminal()`;
      nextPurge = Date.now() + 60 * 60 * 1000;
    }
    const processed = await processQueueOnce(sql, transport, applicationUrl);
    if (!processed && !signal.aborted) {
      try {
        await delay(1000, undefined, { signal });
      } catch (error) {
        if (!signal.aborted) throw error;
      }
    }
  }
}
