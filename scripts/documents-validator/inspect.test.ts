import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";

async function inspect(fixture: string) {
  const bytes = await readFile(
    resolve(import.meta.dirname, "../../tests/fixtures/documents", fixture),
  );
  return new Promise<unknown>((resolveResult, reject) => {
    const worker = new Worker(new URL("./inspect.ts", import.meta.url), {
      env: {},
      execArgv: [],
      workerData: { bytes, filename: "sample.pdf", mime: "application/pdf" },
      resourceLimits: {
        maxOldGenerationSizeMb: 256,
        maxYoungGenerationSizeMb: 32,
        stackSizeMb: 4,
      },
    });
    worker.once("message", resolveResult);
    worker.once("error", reject);
  });
}
test("isolated parser worker accepts a real PDF and rejects active content", async () => {
  assert.deepEqual(await inspect("valid.pdf"), { valid: true });
  assert.deepEqual(await inspect("active.pdf"), { valid: false });
});
