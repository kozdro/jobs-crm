// Fault injection is restricted to the separately owned disposable fault target.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  connectTarget,
  migrateTarget,
  preflight,
  snapshot,
} from "../../../scripts/db/f2.ts";
import {
  assertIsolation,
  createAccounts,
  denied,
  request,
  rest,
  rows,
  type ApiTarget,
  type Cases,
  type Fixture,
  type User,
} from "../rls/data-api.ts";

const migrationRoot = resolve("experiments/foundation/rls/migrations");
const moduleUrl = new URL("../../../scripts/db/f2.ts", import.meta.url).href;

// v0 is intentionally not in the Data API schema list. This is privileged
// synthetic setup, not evidence of user authorization. User proof follows v1.
async function seedV0(id: string, user: User): Promise<Fixture> {
  const fixture: Fixture = {
    probe_item: {
      id: randomUUID(),
      owner_id: user.id,
      marker: `synthetic-v0-${randomUUID()}`,
    },
    probe_label: {
      id: randomUUID(),
      owner_id: user.id,
      marker: `synthetic-v0-${randomUUID()}`,
    },
    probe_link: {
      id: randomUUID(),
      owner_id: user.id,
      marker: `synthetic-v0-${randomUUID()}`,
    },
  };
  fixture.probe_link.item_id = fixture.probe_item.id;
  fixture.probe_link.label_id = fixture.probe_label.id;
  const sql = await connectTarget(id);
  try {
    await sql.begin(async (tx) => {
      for (const table of ["probe_item", "probe_label"] as const) {
        const row = fixture[table];
        await tx.unsafe(
          `insert into foundation_poc.${table}(id,owner_id,marker) values ($1,$2,$3)`,
          [row.id, row.owner_id, row.marker],
        );
      }
      const row = fixture.probe_link;
      await tx.unsafe(
        "insert into foundation_poc.probe_link(id,owner_id,marker,item_id,label_id) values ($1,$2,$3,$4,$5)",
        [row.id, row.owner_id, row.marker, row.item_id!, row.label_id!],
      );
    });
  } finally {
    await sql.end();
  }
  return fixture;
}
type Journal = {
  entries: {
    idx: number;
    version: string;
    when: number;
    tag: string;
    breakpoints: boolean;
  }[];
};

async function appendMigration(folder: string, tag: string, content: string) {
  const path = join(folder, "meta/_journal.json");
  const journal = JSON.parse(await readFile(path, "utf8")) as Journal;
  journal.entries.push({
    idx: journal.entries.length,
    version: "7",
    when: journal.entries.at(-1)!.when + 1000,
    tag,
    breakpoints: true,
  });
  await writeFile(path, JSON.stringify(journal));
  await writeFile(join(folder, `${tag}.sql`), content);
}
async function subprocess(
  id: string,
  folder: string,
): Promise<{ code: number | null; safeRefusal: boolean }> {
  return new Promise((ok, no) => {
    const child = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        `import { migrateTarget } from ${JSON.stringify(moduleUrl)}; try { await migrateTarget(process.argv[1], {migrationsFolder:process.argv[2]}); } catch (e) { if (e instanceof Error && e.message === 'Migration already running; safe refusal') process.exitCode=42; else process.exitCode=1; }`,
        id,
        folder,
      ],
      { stdio: ["ignore", "ignore", "pipe"], env: process.env },
    );
    // Child diagnostics are deliberately withheld: SQL driver diagnostics may contain values.
    child.stderr.resume();
    const timer = setTimeout(() => child.kill("SIGKILL"), 120000);
    child.on("error", (error) => {
      clearTimeout(timer);
      no(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      ok({ code, safeRefusal: code === 42 });
    });
  });
}

export async function migrationFaultChecks(
  t: Cases,
  id: string,
  target: ApiTarget,
): Promise<void> {
  const temp = await mkdtemp(join(tmpdir(), "jobs-crm-f2-qa-"));
  try {
    const manifestPath = resolve(".foundation-f2", id, "manifest.json");
    const originalManifest = await readFile(manifestPath, "utf8");
    for (const mutation of ["project", "port", "config-hash", "image-id"]) {
      await t.test(
        `FQA-10 live owned ${id} manifest ${mutation} tamper refuses before first DDL`,
        async () => {
          const manifest = JSON.parse(originalManifest);
          if (mutation === "project")
            manifest.projectId = "jobs-crm-f2-foreign-000000000000";
          if (mutation === "port") manifest.ports.db = 56423;
          if (mutation === "config-hash") manifest.configHash = "0".repeat(64);
          if (mutation === "image-id") {
            assert.ok(
              manifest.containers?.length > 0,
              "Start must bind actual container identities before migrations",
            );
            manifest.containers[0].imageId = `sha256:${"0".repeat(64)}`;
          }
          try {
            await writeFile(manifestPath, JSON.stringify(manifest), {
              mode: 0o600,
            });
            await assert.rejects(
              preflight(id),
              /manifest identity mismatch|config tampering refused|identity\/image drift refused/,
            );
          } finally {
            await writeFile(manifestPath, originalManifest, { mode: 0o600 });
          }
          await preflight(id);
          const sql = await connectTarget(id);
          try {
            const [state] =
              await sql`select to_regclass('foundation_migrations.__drizzle_migrations') ledger, to_regnamespace('foundation_poc') schema`;
            assert.equal(state.ledger, null);
            assert.equal(state.schema, null);
          } finally {
            await sql.end();
          }
        },
      );
    }
    await cp(migrationRoot, temp, { recursive: true });
    await t.test(
      "FQA-11 synthetic v0 to v1 upgrade retains fixture and owner policies",
      async () => {
        assert.deepEqual(await migrateTarget(id, { through: 2 }), {
          applied: 2,
          total: 2,
        });
        const users = await createAccounts(target);
        denied(await request(target, users[0].token, rest("probe_item")));
        const fixture = await seedV0(id, users[0]);
        const otherFixture = await seedV0(id, users[1]);
        assert.deepEqual(await migrateTarget(id), { applied: 3, total: 5 });
        const sql = await connectTarget(id);
        try {
          const records =
            await sql`select id,owner_id,marker,revision from foundation_poc.probe_item`;
          assert.equal(records.length, 2);
          const retained = records.find(
            (row) => row.id === fixture.probe_item.id,
          );
          assert.ok(retained);
          assert.equal(retained.marker, fixture.probe_item.marker);
          assert.equal(retained.revision, 0);
          const policies =
            await sql`select policyname from pg_policies where schemaname='foundation_poc'`;
          assert.equal(policies.length, 12);
        } finally {
          await sql.end();
        }
        assert.equal(
          rows(
            await request(
              target,
              users[0].token,
              rest("probe_item", `id=eq.${fixture.probe_item.id}`),
            ),
          )[0].revision,
          0,
        );
        await assertIsolation(target, users[0], users[1], otherFixture);
        await assertIsolation(target, users[1], users[0], fixture);
      },
    );
    await t.test(
      "FQA-18 privileged setup constraint diagnostic: FK CHECK NOT NULL and relation uniqueness rollback",
      async () => {
        const sql = await connectTarget(id);
        try {
          const links =
            await sql`select * from foundation_poc.probe_link order by owner_id`;
          assert.equal(links.length, 2);
          const own = links[0],
            other = links[1];
          const before =
            await sql`select (select count(*)::int from foundation_poc.probe_item) items,(select count(*)::int from foundation_poc.probe_label) labels,(select count(*)::int from foundation_poc.probe_link) links`;
          const attempts = [
            {
              owner: own.owner_id,
              item: other.item_id,
              label: own.label_id,
              marker: "synthetic-cross-item",
              code: "23503",
            },
            {
              owner: own.owner_id,
              item: own.item_id,
              label: other.label_id,
              marker: "synthetic-cross-label",
              code: "23503",
            },
            {
              owner: own.owner_id,
              item: randomUUID(),
              label: own.label_id,
              marker: "synthetic-missing",
              code: "23503",
            },
            {
              owner: own.owner_id,
              item: own.item_id,
              label: own.label_id,
              marker: "",
              code: "23514",
            },
            {
              owner: null,
              item: own.item_id,
              label: own.label_id,
              marker: "synthetic-null",
              code: "23502",
            },
            {
              owner: own.owner_id,
              item: own.item_id,
              label: own.label_id,
              marker: "synthetic-duplicate",
              code: "23505",
            },
          ];
          for (const attempt of attempts) {
            await assert.rejects(
              sql.begin(async (tx) => {
                await tx.unsafe(
                  "insert into foundation_poc.probe_link(owner_id,id,marker,item_id,label_id) values ($1,$2,$3,$4,$5)",
                  [
                    attempt.owner,
                    randomUUID(),
                    attempt.marker,
                    attempt.item,
                    attempt.label,
                  ],
                );
              }),
              (error: unknown) =>
                (error as { code?: string }).code === attempt.code,
            );
          }
          const after =
            await sql`select (select count(*)::int from foundation_poc.probe_item) items,(select count(*)::int from foundation_poc.probe_label) labels,(select count(*)::int from foundation_poc.probe_link) links`;
          assert.deepEqual(after, before);
        } finally {
          await sql.end();
        }
      },
    );
    await t.test(
      "FQA-12 two actual migrator processes serialize or safely refuse with one DDL/ledger entry",
      async () => {
        await appendMigration(
          temp,
          "0005_qa_concurrency",
          "CREATE TABLE foundation_poc.concurrency_probe(id integer PRIMARY KEY);\n--> statement-breakpoint\nSELECT pg_sleep(2);\n",
        );
        const results = await Promise.all([
          subprocess(id, temp),
          subprocess(id, temp),
        ]);
        assert.ok(
          results.some((result) => result.code === 0),
          "At least one migrator must apply migration",
        );
        assert.ok(
          results.every((result) => result.code === 0 || result.safeRefusal),
          "Concurrent process must succeed or explicitly refuse lock",
        );
        const sql = await connectTarget(id);
        try {
          const ledger =
            await sql`select hash,created_at from foundation_migrations.__drizzle_migrations`;
          assert.equal(ledger.length, 6);
          assert.equal(new Set(ledger.map((row) => row.hash)).size, 6);
          const relations =
            await sql`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='foundation_poc' and c.relname='concurrency_probe'`;
          assert.equal(relations[0].n, 1);
        } finally {
          await sql.end();
        }
      },
    );
    await t.test(
      "FQA-11/12 multi-pending failure rolls back DDL/ledger; unapplied repair accepts legitimate SERIAL gaps",
      async () => {
        const before = await snapshot(id);
        await appendMigration(
          temp,
          "0006_qa_pending_prefix",
          "CREATE TABLE foundation_poc.pending_prefix(id integer PRIMARY KEY);\n",
        );
        await appendMigration(
          temp,
          "0007_qa_invalid",
          "CREATE TABLE foundation_poc.should_rollback(id integer);\n--> statement-breakpoint\nSELECT 1/0;\n",
        );
        await assert.rejects(migrateTarget(id, { migrationsFolder: temp }));
        assert.deepEqual(
          await snapshot(id),
          before,
          "Failed migration must leave exact catalog/ledger unchanged",
        );
        // Only the failed, never-applied temporary SQL is repaired. Canonical/applied
        // migrations remain immutable. PostgreSQL does not roll back sequence nextval.
        await writeFile(
          join(temp, "0007_qa_invalid.sql"),
          "CREATE TABLE foundation_poc.recovered_probe(id integer PRIMARY KEY);\n",
        );
        assert.deepEqual(await migrateTarget(id, { migrationsFolder: temp }), {
          applied: 2,
          total: 8,
        });
        const sql = await connectTarget(id);
        try {
          const ledger =
            await sql`select id from foundation_migrations.__drizzle_migrations order by id`;
          assert.equal(ledger.length, 8);
          assert.ok(
            ledger.some(
              (row, index) =>
                index > 0 && Number(row.id) - Number(ledger[index - 1].id) > 1,
            ),
            "Rolled-back pending ledger insert must leave a legitimate SERIAL gap",
          );
          const recovered =
            await sql`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='foundation_poc' and c.relname in ('pending_prefix','recovered_probe') order by c.relname`;
          assert.deepEqual(
            recovered.map((row) => row.relname),
            ["pending_prefix", "recovered_probe"],
          );
        } finally {
          await sql.end();
        }
        const recoveredSnapshot = await snapshot(id);
        assert.deepEqual(await migrateTarget(id, { migrationsFolder: temp }), {
          applied: 0,
          total: 8,
        });
        assert.deepEqual(await snapshot(id), recoveredSnapshot);
      },
    );
    await t.test(
      "FQA-10/12 applied-file tampering refused before SQL and without catalog changes",
      async () => {
        const before = await snapshot(id);
        const journal = JSON.parse(
          await readFile(join(temp, "meta/_journal.json"), "utf8"),
        ) as Journal;
        const first = join(temp, `${journal.entries[0].tag}.sql`);
        await writeFile(
          first,
          `${await readFile(first, "utf8")}\n-- deliberate QA tamper in disposable file copy\n`,
        );
        await assert.rejects(
          migrateTarget(id, { migrationsFolder: temp }),
          /hash\/ledger tampering refused/,
        );
        assert.deepEqual(await snapshot(id), before);
      },
    );
    await t.test(
      "FQA-10 applied ledger hash tampering refuses before further SQL",
      async () => {
        const journal = JSON.parse(
          await readFile(join(temp, "meta/_journal.json"), "utf8"),
        ) as Journal;
        const firstFile = `${journal.entries[0].tag}.sql`;
        await writeFile(
          join(temp, firstFile),
          await readFile(join(migrationRoot, firstFile), "utf8"),
        );
        const sql = await connectTarget(id);
        let originalHash: string;
        try {
          const [original] =
            await sql`select hash from foundation_migrations.__drizzle_migrations order by id limit 1`;
          originalHash = original.hash;
          await sql`update foundation_migrations.__drizzle_migrations set hash='qa-intentional-tamper' where id=(select min(id) from foundation_migrations.__drizzle_migrations)`;
        } finally {
          await sql.end();
        }
        try {
          const before = await snapshot(id);
          await assert.rejects(
            migrateTarget(id, { migrationsFolder: temp }),
            /ledger checkpoint tampering refused|hash\/ledger tampering refused/,
          );
          assert.deepEqual(await snapshot(id), before);
        } finally {
          const restore = await connectTarget(id);
          try {
            await restore`update foundation_migrations.__drizzle_migrations set hash=${originalHash} where id=(select min(id) from foundation_migrations.__drizzle_migrations)`;
          } finally {
            await restore.end();
          }
        }
      },
    );
    await t.test(
      "FQA-10 trailing ledger-row deletion refused before DDL and not silently reapplied",
      async () => {
        const sql = await connectTarget(id);
        try {
          await sql`delete from foundation_migrations.__drizzle_migrations where id=(select max(id) from foundation_migrations.__drizzle_migrations)`;
        } finally {
          await sql.end();
        }
        const before = await snapshot(id);
        await assert.rejects(
          migrateTarget(id, { migrationsFolder: temp }),
          /ledger checkpoint tampering refused/,
        );
        assert.deepEqual(await snapshot(id), before);
        // Preserve the intentional consumed failure state until owned target cleanup.
      },
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
