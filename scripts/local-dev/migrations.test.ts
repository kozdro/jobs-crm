import assert from "node:assert/strict";
import test from "node:test";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { resolve } from "node:path";
import {
  assertLocalMigrationTarget,
  assertPersistentMigrationState,
  migrateLocalDev,
  schemaCheckpoint,
} from "./migrations.ts";
import type { LocalMigrationTarget } from "./migrations.ts";
import { ledgerCheckpoint, sha256 } from "../recruitment/validation.ts";

const history = readMigrationFiles({
  migrationsFolder: resolve(
    import.meta.dirname,
    "../../db/recruitment/migrations",
  ),
});
const ledger = history.map((entry, index) => ({
  id: index + 1,
  hash: entry.hash,
  created_at: entry.folderMillis,
}));
const schema = sha256("trusted catalog definitions, grants and RLS");

test("v1 fingerprint is unchanged and v2 binds private worker definitions", async () => {
  const makeSql = (workerAcl: string) =>
    (async (parts: TemplateStringsArray) => {
      const text = parts.join("");
      if (text.includes("where n.nspname='email_reminder' and p.prokind"))
        return [{ proname: "prepare", acl: workerAcl }];
      return [];
    }) as unknown as Parameters<typeof schemaCheckpoint>[0];
  const a = makeSql("worker=EXECUTE");
  const b = makeSql("public=EXECUTE");
  const legacy = await schemaCheckpoint(a);
  assert.equal(legacy, await schemaCheckpoint(b));
  assert.notEqual(legacy, await schemaCheckpoint(a, true));
  assert.notEqual(
    await schemaCheckpoint(a, true),
    await schemaCheckpoint(b, true),
  );
});
const target = (): LocalMigrationTarget => ({
  db: {
    host: "127.0.0.1",
    port: 56722,
    database: "postgres",
    user: "postgres",
    password: "synthetic-only",
  },
  apiUrl: "http://127.0.0.1:56721",
  anonKey: "synthetic-public-key",
  migrationCheckpoint: ledgerCheckpoint([]),
});

test("Local DEV migrations reject cloud, CI and alternate endpoints before connecting", async () => {
  assertLocalMigrationTarget(target());
  for (const mutate of [
    (t: LocalMigrationTarget) => {
      t.db.host = "db.example.com";
    },
    (t: LocalMigrationTarget) => {
      t.db.port = 56422;
    },
    (t: LocalMigrationTarget) => {
      t.db.port = 56522;
    },
    (t: LocalMigrationTarget) => {
      t.db.port = 56622;
    },
    (t: LocalMigrationTarget) => {
      t.db.database = "other";
    },
    (t: LocalMigrationTarget) => {
      t.db.user = "other";
    },
    (t: LocalMigrationTarget) => {
      t.apiUrl = "https://cloud.supabase.co";
    },
    (t: LocalMigrationTarget) => {
      t.apiUrl = "http://127.0.0.1:56621";
    },
    (t: LocalMigrationTarget) => {
      t.anonKey = "";
    },
  ]) {
    const t = target();
    mutate(t);
    let saved = false;
    await assert.rejects(
      migrateLocalDev(t, async () => {
        saved = true;
      }),
      /target mismatch/,
    );
    assert.equal(saved, false);
  }
});

test("fresh bootstrap and checkpoint-bound approved prefix/full histories are accepted", () => {
  assert.equal(history.length, 54);
  // Fixed independently against base b28877e; the approved historical prefix
  // includes each migration hash, ordinal and timestamp, not only its count.
  assert.equal(
    ledgerCheckpoint(ledger.slice(0, 23)),
    "86508cc5dea3df2570d6fa313a123505152fe770dc78f2ee47ce0b1ba3eed160",
  );
  assert.equal(history[15]?.folderMillis, 1_793_879_424_259);
  assert.equal(history[18]?.folderMillis, 1_794_055_693_932);
  assert.equal(history[20]?.folderMillis, 1_794_220_100_000);
  assert.equal(history[22]?.folderMillis, 1_794_265_451_629);
  assertPersistentMigrationState([], history, target(), schema);
  // Pre-3A, 3A, 3B and history-integrity ledgers remain accepted upgrade prefixes.
  for (const count of [
    1,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    history.length,
  ]) {
    const prefix = ledger.slice(0, count);
    assertPersistentMigrationState(
      prefix,
      history,
      {
        migrationCheckpoint: ledgerCheckpoint(prefix),
        schemaCheckpoint: schema,
      },
      schema,
    );
  }
});

test("nonempty ledger never silently adopts missing or changed schema checkpoint", () => {
  const t = {
    migrationCheckpoint: ledgerCheckpoint(ledger),
    schemaCheckpoint: schema,
  };
  assert.throws(
    () =>
      assertPersistentMigrationState(
        ledger,
        history,
        { migrationCheckpoint: t.migrationCheckpoint },
        schema,
      ),
    /schema drift/,
  );
  for (const actual of [
    sha256("RLS disabled"),
    sha256("extra column"),
    "invalid",
  ])
    assert.throws(
      () => assertPersistentMigrationState(ledger, history, t, actual),
      /schema drift/,
    );
  assert.throws(
    () =>
      assertPersistentMigrationState(
        [],
        history,
        { ...target(), schemaCheckpoint: schema },
        sha256("changed bootstrap"),
      ),
    /schema drift/,
  );
});

test("deleted, reordered, modified and ahead history cannot be repaired automatically", () => {
  const t = {
    migrationCheckpoint: ledgerCheckpoint(ledger),
    schemaCheckpoint: schema,
  };
  for (const rows of [
    ledger.slice(0, -1),
    [...ledger].reverse(),
    ledger.map((row) => ({ ...row, hash: sha256("edited") })),
    ledger.map((row) => ({ ...row, id: row.id + 1 })),
  ])
    assert.throws(
      () => assertPersistentMigrationState(rows, history, t, schema),
      /ledger checkpoint/,
    );
  assert.throws(
    () =>
      assertPersistentMigrationState(ledger, history.slice(0, -1), t, schema),
    /history\/ledger mismatch/,
  );
  const changed = [...history];
  changed[0] = { ...changed[0], hash: sha256("edited SQL") };
  assert.throws(
    () => assertPersistentMigrationState(ledger, changed, t, schema),
    /history\/ledger mismatch/,
  );
});
