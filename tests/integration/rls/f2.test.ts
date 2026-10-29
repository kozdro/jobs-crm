// Sequential, synthetic, non-production Supabase Local integration experiment.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  connectTarget,
  migrateTarget,
  preflight,
  snapshot,
  startTarget,
  stopTarget,
  type Target,
} from "../../../scripts/db/f2.ts";
import { migrationFaultChecks } from "../migrations/checks.ts";
import { catalogChecks, sensitivityChecks } from "./catalog.ts";
import type { Cases } from "./data-api.ts";
import { runMatrix } from "./matrix.ts";

const evidenceDir = resolve(".foundation-f2/evidence");
const command = "pnpm test:integration:f2";
type Outcome = {
  name: string;
  environment: string;
  initial: string;
  expected: string;
  status: "PASS" | "FAIL";
  startedAt: string;
  durationMs: number;
  observed: string;
};
const sha256 = (input: string) =>
  createHash("sha256").update(input).digest("hex");
async function sourceManifest(
  directory: string,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, await sourceManifest(path));
    else result[path] = sha256(await readFile(path, "utf8"));
  }
  return result;
}

test(
  "Foundation F2 real Supabase Data API migrations and RLS A/B",
  { timeout: 1_200_000 },
  async (t) => {
    const runId = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
    const outcomes: Outcome[] = [];
    const versions: unknown[] = [];
    const manifests: Record<string, unknown> = {};
    let active: string | undefined;
    let suiteComplete = false;
    let environment = "local-engine preflight";
    const tracked: Cases = {
      async test(name, fn) {
        let failure: unknown;
        await t.test(name, async () => {
          const started = Date.now();
          const entry: Outcome = {
            name,
            environment,
            initial:
              "Owned disposable local target; synthetic fixture only; positive-owner assertions in test source",
            expected: name,
            status: "FAIL",
            startedAt: new Date(started).toISOString(),
            durationMs: 0,
            observed: "Test did not complete",
          };
          try {
            await fn();
            entry.status = "PASS";
            entry.observed = "All assertions completed; no skipped assertion";
          } catch (error) {
            failure = error;
            entry.observed =
              error instanceof Error
                ? `Assertion/operation failed (${error.name}); inspect sanitized TAP`
                : "Operation failed";
            throw error;
          } finally {
            entry.durationMs = Date.now() - started;
            outcomes.push(entry);
          }
        });
        if (failure) throw new Error(`Required F2 case failed: ${name}`);
      },
    };
    async function begin(id: string): Promise<Target> {
      environment = id;
      const target = await startTarget(id);
      active = id;
      await tracked.test(
        `FQA-10 ${id} actual local identity network bindings versions and empty ledger preflight`,
        async () => {
          versions.push(await preflight(id));
          assert.equal(target.apiUrl, "http://127.0.0.1:56421");
          assert.equal(target.db.host, "127.0.0.1");
          assert.equal(target.db.port, 56422);
          await assert.rejects(preflight("qa-nonexistent-target"));
          const sql = await connectTarget(id);
          try {
            const [ledger] =
              await sql`select to_regclass('foundation_migrations.__drizzle_migrations') present`;
            assert.equal(
              ledger.present,
              null,
              "Target must be fresh before first apply",
            );
          } finally {
            await sql.end();
          }
        },
      );
      return target;
    }
    async function cleanup() {
      if (active) {
        const id = active;
        await tracked.test(
          `Cleanup ${id}: only exact owned project containers volumes network and directory removed`,
          async () => {
            await stopTarget(id, { remove: true });
          },
        );
        active = undefined;
      }
    }
    try {
      const baseline = await begin("baseline");
      await tracked.test(
        "FQA-11 baseline fresh apply canonical Drizzle history and exact no-op rerun",
        async () => {
          assert.deepEqual(await migrateTarget("baseline"), {
            applied: 5,
            total: 5,
          });
          manifests.baseline = await snapshot("baseline");
          assert.deepEqual(await migrateTarget("baseline"), {
            applied: 0,
            total: 5,
          });
          assert.deepEqual(await snapshot("baseline"), manifests.baseline);
        },
      );
      await catalogChecks(tracked, "baseline", baseline);
      await runMatrix(tracked, baseline);
      await cleanup();
      const replica = await begin("replica");
      await tracked.test(
        "FQA-11 second independent fresh project has identical actual schema ACL policies constraints functions ledger",
        async () => {
          assert.deepEqual(await migrateTarget("replica"), {
            applied: 5,
            total: 5,
          });
          manifests.replica = await snapshot("replica");
          assert.deepEqual(manifests.replica, manifests.baseline);
        },
      );
      await catalogChecks(tracked, "replica", replica);
      await runMatrix(tracked, replica);
      await cleanup();
      const fault = await begin("fault");
      await migrationFaultChecks(tracked, "fault", fault);
      await sensitivityChecks(tracked, "fault", fault);
      await cleanup();
      for (const [prefix, first, last] of [
        ["FQA", 10, 21],
        ["RLS", 1, 12],
      ] as const) {
        for (let id = first; id <= last; id++) {
          assert.ok(
            outcomes.some((row) =>
              Array.from(
                row.name.matchAll(
                  new RegExp(`${prefix}-(\\d{2}(?:/\\d{2})*)`, "g"),
                ),
              ).some((match) =>
                match[1].split("/").includes(String(id).padStart(2, "0")),
              ),
            ),
            `Missing mandatory executed coverage ${prefix}-${id}`,
          );
        }
      }
      suiteComplete = true;
    } finally {
      try {
        await cleanup();
      } finally {
        const sources = {
          ...(await sourceManifest("tests/integration")),
          ...(await sourceManifest("experiments/foundation/rls")),
          ...(await sourceManifest("scripts/db")),
        };
        const coverage = (prefix: "FQA" | "RLS", first: number, last: number) =>
          Array.from({ length: last - first + 1 }, (_, index) => {
            const id = `${prefix}-${String(index + first).padStart(2, "0")}`;
            const matches = outcomes.filter((row) =>
              Array.from(
                row.name.matchAll(
                  new RegExp(`${prefix}-(\\d{2}(?:/\\d{2})*)`, "g"),
                ),
              ).some((match) =>
                match[1]
                  .split("/")
                  .includes(String(index + first).padStart(2, "0")),
              ),
            );
            const status = matches.some((row) => row.status === "FAIL")
              ? "FAIL"
              : !matches.length
                ? "NOT RUN"
                : suiteComplete
                  ? "PASS"
                  : "BLOCKED";
            return {
              id,
              status,
              environment:
                "Supabase Local owned disposable baseline/replica/fault",
              initial:
                "Fresh guarded local targets and synthetic fixture A/B; see executable cases",
              expected: `${prefix === "FQA" ? "foundation-qa.md" : "foundation-pocs.md"} ${id} contract`,
              observed: matches.map((row) => ({
                case: row.name,
                status: row.status,
                target: row.environment,
              })),
              reason:
                status === "PASS"
                  ? null
                  : status === "NOT RUN"
                    ? "Required setup or earlier dependent case did not complete; no assertion execution for this ID"
                    : status === "BLOCKED"
                      ? "Partial cases passed but complete mandatory target sequence did not finish"
                      : "Executed case violated its expected result",
              evidence: `${runId}.json`,
              command,
            };
          });
        const report = {
          runId,
          baseSha: "d0c645f48e323cae722720d4262cba2d558e6fd0",
          generatedAt: new Date().toISOString(),
          command,
          node: process.version,
          model: "inherited NOT EXPOSED",
          role: "native generic subagent + canonical qa-engineer",
          status:
            suiteComplete &&
            outcomes.length > 0 &&
            outcomes.every((row) => row.status === "PASS") &&
            active === undefined
              ? "PASS"
              : "FAIL",
          suiteComplete,
          tests: outcomes.length,
          passed: outcomes.filter((row) => row.status === "PASS").length,
          failed: outcomes.filter((row) => row.status === "FAIL").length,
          skipped: 0,
          outcomes,
          coverage: {
            fqa: coverage("FQA", 10, 21),
            rls: coverage("RLS", 1, 12),
          },
          versions,
          sources,
          manifests,
          deferred: [
            {
              scope: "BFF/session end-to-end",
              status: "NOT RUN",
              reason: "F3",
            },
            {
              scope: "atomic RPC and idempotency registry",
              status: "NOT RUN",
              reason: "F4",
            },
          ],
        };
        const reportJson = `${JSON.stringify(report, null, 2)}\n`;
        await writeFile(join(evidenceDir, `${runId}.json`), reportJson, {
          mode: 0o600,
          flag: "wx",
        });
        await writeFile(join(evidenceDir, "results.json"), reportJson, {
          mode: 0o600,
        });
      }
    }
  },
);
