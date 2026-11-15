/** Upgrade a newly-created, guarded disposable Storage target from the exact 0022 baseline. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  migrateRecruitmentTarget,
  readRecruitmentTarget,
  verifyRecruitmentMigrations,
} from "./target.ts";
import { assertMigrationLedger, ledgerCheckpoint } from "./validation.ts";

export async function verifyDocumentsUpgrade(id: string) {
  const target = await readRecruitmentTarget(id);
  if (!target.storage || target.migrationCheckpoint !== ledgerCheckpoint([]))
    throw new Error("Documents upgrade requires a fresh owned Storage target");
  const source = resolve(
    import.meta.dirname,
    "../../db/recruitment/migrations",
  );
  const journal = JSON.parse(
    await readFile(join(source, "meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  const entries = journal.entries.slice(0, 23);
  assert.equal(entries.length, 23);
  assert.equal(entries[22].tag, "0022_global_search");
  if (journal.entries.length <= 23)
    throw new Error("Documents migrations missing");
  const directory = await mkdtemp(join(tmpdir(), "jobs-documents-upgrade-"));
  const sql = postgres({
    ...target.db,
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  try {
    const [existing] =
      await sql`select to_regclass('recruitment_migrations.__drizzle_migrations') present`;
    if (existing.present)
      throw new Error("Documents upgrade target already migrated");
    await mkdir(join(directory, "meta"));
    await writeFile(
      join(directory, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries }),
    );
    for (const entry of entries)
      await copyFile(
        join(source, `${entry.tag}.sql`),
        join(directory, `${entry.tag}.sql`),
      );
    await migrate(drizzle(sql), {
      migrationsFolder: directory,
      migrationsSchema: "recruitment_migrations",
      migrationsTable: "__drizzle_migrations",
    });
    const ledger = await sql<
      { id: number; hash: string; created_at: string }[]
    >`select id,hash,created_at from recruitment_migrations.__drizzle_migrations order by id`;
    const checkpoint = ledgerCheckpoint(ledger);
    assertMigrationLedger(
      ledger,
      readMigrationFiles({ migrationsFolder: directory }),
      checkpoint,
      true,
    );
    const manifestPath = join(target.workdir, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (
      manifest.projectId !== target.projectId ||
      manifest.migrationCheckpoint !== ledgerCheckpoint([])
    )
      throw new Error("Documents upgrade target manifest changed");
    manifest.migrationCheckpoint = checkpoint;
    await writeFile(manifestPath + ".next", JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });
    await rename(manifestPath + ".next", manifestPath);
    const owner = randomUUID(),
      caseId = randomUUID(),
      requestId = randomUUID();
    await sql`insert into auth.users(id) values (${owner}::uuid)`;
    await sql`insert into public.recruitment_case(id, owner_id, request_id, title, created_at) values (${caseId}::uuid, ${owner}::uuid, ${requestId}::uuid, 'Synthetic legacy case', '2000-01-01T00:00:00Z')`;
    const before = JSON.stringify(
      await sql`select * from public.recruitment_case where id=${caseId}::uuid`,
    );
    const result = await migrateRecruitmentTarget(id);
    assert.equal(
      JSON.stringify(
        await sql`select * from public.recruitment_case where id=${caseId}::uuid`,
      ),
      before,
    );
    const [events] =
      await sql`select count(*)::int n from public.recruitment_case_event where case_id=${caseId}::uuid`;
    assert.equal(events.n, 0, "Upgrade must not invent a historical event");
    const verified = await verifyRecruitmentMigrations(id);
    assert.equal(verified.total, journal.entries.length);
    return result;
  } finally {
    await sql.end();
    await rm(directory, { recursive: true, force: true });
  }
}
