import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runCleanupBatch } from "./worker.ts";

const versionId = "d9ae7f3a-7420-4b54-a3b3-ac1f8f0bf937";
const objectKey = "5608bc31-e28f-4809-977e-a82049332dae";

test("cleanup never acknowledges a failed Storage call and retries an empty successful removal", async () => {
  let failStorage = true;
  let acknowledgments = 0;
  const client = {
    rpc: async (name: string) => {
      if (name === "list_document_cleanup")
        return { data: [{ versionId, objectKey }], error: null };
      if (name === "confirm_document_cleanup") {
        acknowledgments++;
        return { data: { kind: "confirmed" }, error: null };
      }
      return { data: 0, error: null };
    },
    storage: {
      from: () => ({
        remove: async () =>
          failStorage
            ? { data: null, error: new Error("network") }
            : { data: [], error: null },
      }),
    },
  } as unknown as SupabaseClient;
  assert.deepEqual(await runCleanupBatch(client), { confirmed: 0, pending: 1 });
  assert.equal(acknowledgments, 0);
  failStorage = false;
  assert.deepEqual(await runCleanupBatch(client), { confirmed: 1, pending: 0 });
  assert.equal(acknowledgments, 1);
});
