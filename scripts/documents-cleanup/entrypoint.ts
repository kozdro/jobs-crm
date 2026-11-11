import { createClient } from "@supabase/supabase-js";
import { setTimeout as delay } from "node:timers/promises";
import { runCleanupBatch } from "./worker.ts";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = process.env.DOCUMENTS_CLEANUP_JWT;
  if (!url || !key || !token)
    throw new Error("Cleanup configuration unavailable");
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" &&
    !(
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    )
  )
    throw new Error("Cleanup transport unavailable");
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const once = process.argv.includes("--once");
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    do {
      try {
        const result = await runCleanupBatch(client);
        process.stdout.write(
          `Documents cleanup: ${result.confirmed} confirmed, ${result.pending} pending.\n`,
        );
      } catch {
        if (once) throw new Error("Cleanup pass failed");
        process.stderr.write(
          "Documents cleanup pass failed; queued operations remain pending.\n",
        );
      }
      if (once || controller.signal.aborted) break;
      await delay(60000, undefined, { signal: controller.signal }).catch(
        () => {},
      );
    } while (!controller.signal.aborted);
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
  }
}
main().catch(() => {
  process.stderr.write(
    "Documents cleanup did not complete; queued operations remain pending.\n",
  );
  process.exitCode = 1;
});
