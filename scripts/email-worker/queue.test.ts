import assert from "node:assert/strict";
import test from "node:test";
import type { Sql } from "postgres";
import { processQueueOnce } from "./queue.ts";

function fakeDatabase(recipient: string | null = "owner@example.test") {
  const calls: string[] = [];
  const run = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join("?");
    if (query.includes("enqueue_due")) calls.push("enqueue");
    if (query.includes("claim()")) {
      calls.push("claim");
      return [{ attempt: "00000000-0000-0000-0000-000000000001" }];
    }
    if (query.includes("prepare")) {
      calls.push("prepare");
      return [{ recipient }];
    }
    if (query.includes("finish")) calls.push(`finish:${String(values[1])}`);
    return [];
  };
  const db = Object.assign(run, {
    begin: async (fn: (tx: typeof run) => Promise<void>) => {
      calls.push("begin");
      await fn(run);
      calls.push("commit");
    },
  });
  return { sql: db as unknown as Sql, calls };
}

test("transaction covers preflight and neutral provider handoff", async () => {
  const { sql, calls } = fakeDatabase();
  await processQueueOnce(
    sql,
    {
      async send(message) {
        calls.push("send");
        assert.deepEqual(message, {
          recipient: "owner@example.test",
          subject: "Przypomnienie",
          text: "Masz przypomnienie w aplikacji. Zaloguj się, aby je zobaczyć: https://crm.example.test/",
        });
        return "accepted";
      },
    },
    new URL("https://crm.example.test/"),
  );
  assert.deepEqual(calls, [
    "enqueue",
    "claim",
    "begin",
    "prepare",
    "send",
    "finish:accepted",
    "commit",
  ]);
});

test("transport exception is unknown and is not retried", async () => {
  const { sql, calls } = fakeDatabase();
  await processQueueOnce(
    sql,
    {
      async send() {
        calls.push("send");
        throw new Error("timeout");
      },
    },
    new URL("https://crm.example.test/"),
  );
  assert.deepEqual(calls, [
    "enqueue",
    "claim",
    "begin",
    "prepare",
    "send",
    "finish:unknown",
    "commit",
  ]);
});

test("a confirmed permanent rejection remains distinct from retryable failure", async () => {
  const { sql, calls } = fakeDatabase();
  await processQueueOnce(
    sql,
    {
      async send() {
        return "permanent_failure";
      },
    },
    new URL("https://crm.example.test/"),
  );
  assert.deepEqual(calls, [
    "enqueue",
    "claim",
    "begin",
    "prepare",
    "finish:permanent_failure",
    "commit",
  ]);
});

test("failed preflight and unsafe application URLs never reach transport", async () => {
  const { sql, calls } = fakeDatabase(null);
  const transport = {
    async send(): Promise<never> {
      throw new Error("unexpected send");
    },
  };
  await processQueueOnce(sql, transport, new URL("https://crm.example.test/"));
  assert.deepEqual(calls, ["enqueue", "claim", "begin", "prepare", "commit"]);
  for (const url of [
    "http://crm.example.test/",
    "https://crm.example.test/?token=x",
    "https://user:secret@crm.example.test/",
  ]) {
    await assert.rejects(
      processQueueOnce(sql, transport, new URL(url)),
      /Invalid application URL/,
    );
  }
});
