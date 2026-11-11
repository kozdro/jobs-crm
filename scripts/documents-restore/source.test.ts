import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { captureHeldLedger, isHeldLedger } from "./source.ts";
const id = "c4362060-f58c-4f21-8adc-a2d1e1ff69ee";
const entry = {
  versionId: "252ac4fa-e1cb-48d4-9921-50c58fc3cd8f",
  ownerId: "20fbff99-f3b2-4a91-92ca-14e4dd94098a",
  documentId: "f6a67e3c-f091-4081-bdfb-2957aa73e70d",
  objectKey: "984be804-90a8-4a8c-a3d4-3e709d606cf2",
};
const timestamp = "2026-11-11T12:00:00Z";

test("held source ledger is explicitly unpublishable", async () => {
  const calls: string[] = [];
  const client = {
    rpc: async (name: string) => {
      calls.push(name);
      return name === "begin_document_restore_hold"
        ? { data: { kind: "held", id }, error: null }
        : { data: [entry], error: null };
    },
  } as unknown as SupabaseClient;
  const held = await captureHeldLedger(client, id, timestamp);
  assert.deepEqual(held, {
    publication: "blocked",
    entries: [entry],
  });
  assert.equal(isHeldLedger(held), true);
  assert.equal(
    isHeldLedger({ publication: "blocked", entries: [entry] }),
    false,
  );
  assert.equal(Object.isFrozen(held.entries[0]), true);
  assert.deepEqual(calls, [
    "begin_document_restore_hold",
    "list_document_restore_ledger",
  ]);
});
test("unconfirmed hold or malformed ledger fails closed", async () => {
  for (const mode of ["hold", "entry"]) {
    const client = {
      rpc: async (name: string) =>
        name === "begin_document_restore_hold"
          ? {
              data: mode === "hold" ? null : { kind: "held", id },
              error: mode === "hold" ? new Error("lost") : null,
            }
          : { data: [{ ...entry, objectKey: "arbitrary/path" }], error: null },
    } as unknown as SupabaseClient;
    await assert.rejects(captureHeldLedger(client, id, timestamp));
  }
});
