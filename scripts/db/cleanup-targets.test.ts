import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cleanupTargets, cleanupAllTargets } from "./cleanup-targets.ts";
test("cleanup ignores evidence and keeps every manifest-bearing target for validation", async () => {
  const root = await mkdtemp(join(tmpdir(), "jobs-f2-cleanup-"));
  try {
    await mkdir(join(root, "evidence"));
    await writeFile(join(root, "evidence/results.json"), "{}");
    await mkdir(join(root, "primary"));
    await writeFile(join(root, "primary/manifest.json"), "{}");
    await mkdir(join(root, "fault"));
    await writeFile(
      join(root, "fault/manifest.json"),
      "malformed-not-swallowed",
    );
    assert.deepEqual(await cleanupTargets(root), ["fault", "primary"]);
    assert.deepEqual(await cleanupTargets(join(root, "absent")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup attempts later targets after earlier failure and fails with redacted aggregate", async () => {
  const called: string[] = [];
  const sensitive = "synthetic-error-payload-must-not-leak";
  await assert.rejects(
    cleanupAllTargets(["first", "second", "third"], async (id) => {
      called.push(id);
      if (id !== "second") throw new Error(sensitive);
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 2);
      assert.equal(
        error.message,
        "F2 cleanup failed for 2 target(s); every target was attempted",
      );
      assert.ok(!error.message.includes(sensitive));
      assert.deepEqual(
        error.errors.map((e) => e.message),
        ["Owned F2 cleanup failed: first", "Owned F2 cleanup failed: third"],
      );
      return true;
    },
  );
  assert.deepEqual(called, ["first", "second", "third"]);
});
