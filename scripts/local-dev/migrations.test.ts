import assert from "node:assert/strict";
import test from "node:test";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { resolve } from "node:path";
import {
  assertLocalMigrationTarget,
  assertPersistentMigrationState,
  migrateLocalDev,
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
  assert.equal(history.length, 12);
  assertPersistentMigrationState([], history, target(), schema);
  // Pre-3A, 3A, 3B and history-integrity ledgers remain accepted upgrade prefixes.
  for (const count of [1, 7, 8, 9, 10, 11, history.length]) {
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
