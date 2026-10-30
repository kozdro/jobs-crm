/** Persistent DEV uses the existing product Drizzle history, never the F2 fixtures. */
import { resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  assertMigrationLedger,
  ledgerCheckpoint,
  sha256,
} from "../recruitment/validation.ts";
import type {
  LedgerRow,
  MigrationIdentity,
} from "../recruitment/validation.ts";
import {
  assertEmptyPublic,
  assertPostgres,
} from "../db/preflight-validation.ts";

export interface LocalMigrationTarget {
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  apiUrl: string;
  anonKey: string;
  migrationCheckpoint: string;
  schemaCheckpoint?: string;
}
export interface MigrationCheckpoints {
  migrationCheckpoint: string;
  schemaCheckpoint: string;
}
const migrationsFolder = resolve(
  import.meta.dirname,
  "../../db/recruitment/migrations",
);
type Sql = ReturnType<typeof postgres>;

export function assertLocalMigrationTarget(target: LocalMigrationTarget) {
  if (
    target.db.host !== "127.0.0.1" ||
    target.db.port !== 56722 ||
    target.db.database !== "postgres" ||
    target.db.user !== "postgres" ||
    !target.db.password ||
    target.apiUrl !== "http://127.0.0.1:56721" ||
    !target.anonKey
  )
    throw new Error("Local DEV migration target mismatch; refused");
}

/** Refuse both changed history and out-of-band SQL before any migration writes. */
export function assertPersistentMigrationState(
  ledger: readonly LedgerRow[],
  history: readonly MigrationIdentity[],
  target: Pick<
    LocalMigrationTarget,
    "migrationCheckpoint" | "schemaCheckpoint"
  >,
  actualSchemaCheckpoint: string,
) {
  assertMigrationLedger(ledger, history, target.migrationCheckpoint);
  if (
    !/^[a-f0-9]{64}$/.test(actualSchemaCheckpoint) ||
    (ledger.length > 0 && target.schemaCheckpoint === undefined) ||
    (target.schemaCheckpoint !== undefined &&
      target.schemaCheckpoint !== actualSchemaCheckpoint)
  )
    throw new Error(
      "Local DEV schema drift/checkpoint missing; inspect without resetting data",
    );
}

async function readLedger(sql: Sql): Promise<LedgerRow[]> {
  const [row] =
    await sql`select to_regclass('recruitment_migrations.__drizzle_migrations') present`;
  return row.present
    ? await sql<
        LedgerRow[]
      >`select id,hash,created_at from recruitment_migrations.__drizzle_migrations order by id`
    : [];
}

/** Definitions/ACLs only: account data, row counts, sequence positions and OIDs are excluded. */
export async function schemaCheckpoint(sql: Sql) {
  const schemas =
    await sql`select nspname,pg_get_userbyid(nspowner) owner,nspacl::text acl
    from pg_namespace where nspname in ('public','recruitment_migrations') order by nspname`;
  const relations =
    await sql`select n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
    c.relreplident,c.reloptions,c.relacl::text acl,pg_get_userbyid(c.relowner) owner
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','recruitment_migrations') order by n.nspname,c.relname`;
  const columns =
    await sql`select n.nspname,c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod) type,
    a.attnotnull,a.attidentity,a.attgenerated,a.attacl::text acl,co.collname,
    pg_get_expr(d.adbin,d.adrelid) default_expression
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    left join pg_collation co on co.oid=a.attcollation
    where n.nspname in ('public','recruitment_migrations') and a.attnum>0 and not a.attisdropped
    order by n.nspname,c.relname,a.attnum`;
  const constraints =
    await sql`select n.nspname,c.relname,x.conname,x.convalidated,pg_get_constraintdef(x.oid) definition
    from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','recruitment_migrations') order by n.nspname,c.relname,x.conname`;
  const indexes =
    await sql`select n.nspname,c.relname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) definition
    from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','recruitment_migrations') order by n.nspname,c.relname`;
  const policies =
    await sql`select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    from pg_policies where schemaname in ('public','recruitment_migrations') order by schemaname,tablename,policyname`;
  const functions =
    await sql`select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) arguments,
    pg_get_functiondef(p.oid) definition,p.proacl::text acl,pg_get_userbyid(p.proowner) owner
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','recruitment_migrations') and p.prokind in ('f','p','w')
    order by n.nspname,p.proname,arguments`;
  const triggers =
    await sql`select n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','recruitment_migrations') and not t.tgisinternal order by n.nspname,c.relname,t.tgname`;
  const types =
    await sql`select n.nspname,t.typname,t.typtype,t.typnotnull,t.typdefault,t.typacl::text acl,
    pg_get_userbyid(t.typowner) owner,e.enumlabel,e.enumsortorder
    from pg_type t join pg_namespace n on n.oid=t.typnamespace left join pg_enum e on e.enumtypid=t.oid
    where n.nspname in ('public','recruitment_migrations') and t.typtype in ('d','e')
    order by n.nspname,t.typname,e.enumsortorder`;
  const sequences =
    await sql`select n.nspname,c.relname,format_type(s.seqtypid,null) type,
    s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle
    from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','recruitment_migrations') order by n.nspname,c.relname`;
  return sha256(
    JSON.stringify({
      schemas,
      relations,
      columns,
      constraints,
      indexes,
      policies,
      functions,
      triggers,
      types,
      sequences,
    }),
  );
}

export async function migrateLocalDev(
  target: LocalMigrationTarget,
  saveCheckpoint: (state: MigrationCheckpoints) => Promise<void>,
) {
  assertLocalMigrationTarget(target);
  const sql = postgres({
    ...target.db,
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  let locked = false;
  try {
    const [identity] =
      await sql`select current_database() db,current_user,current_setting('server_version_num')::int version_num`;
    assertPostgres(
      identity as { db: string; current_user: string; version_num: number },
    );
    const [lock] = await sql`select pg_try_advisory_lock(74291106) locked`;
    if (!lock.locked)
      throw new Error("Local DEV migration already running; refused");
    locked = true;
    const history = readMigrationFiles({ migrationsFolder });
    const ledger = await readLedger(sql);
    assertPersistentMigrationState(
      ledger,
      history,
      target,
      await schemaCheckpoint(sql),
    );
    const [synthetic] =
      await sql`select to_regnamespace('foundation_poc') present`;
    if (synthetic.present)
      throw new Error("Synthetic F2 schema on Local DEV refused");
    if (!ledger.length) {
      const [bootstrap] = await sql`select
        (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','f','S')) relations,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') functions,
        has_schema_privilege('anon','public','create') anon_create,
        has_schema_privilege('authenticated','public','create') authenticated_create`;
      assertEmptyPublic(
        bootstrap as {
          relations: number;
          functions: number;
          anon_create: boolean;
          authenticated_create: boolean;
        },
      );
      const [unexpected] = await sql`select
        to_regnamespace('recruitment_migrations') ledger_schema,
        (select count(*)::int from pg_type t join pg_namespace n on n.oid=t.typnamespace
          where n.nspname='public' and t.typtype in ('d','e')) custom_types`;
      if (unexpected.ledger_schema || unexpected.custom_types)
        throw new Error(
          "Local DEV bootstrap has unexpected schema objects; inspect without resetting data",
        );
    }
    if (ledger.length < history.length)
      await migrate(drizzle(sql), {
        migrationsFolder,
        migrationsSchema: "recruitment_migrations",
        migrationsTable: "__drizzle_migrations",
      });
    const after = await readLedger(sql);
    const checkpoint = ledgerCheckpoint(after);
    assertMigrationLedger(after, history, checkpoint, true);
    const schema = await schemaCheckpoint(sql);
    // Persist immediately after DB commit. Interrupted checkpoint writes fail closed next start.
    await saveCheckpoint({
      migrationCheckpoint: checkpoint,
      schemaCheckpoint: schema,
    });
    const deadline = Date.now() + 15_000;
    let activated = false;
    while (Date.now() < deadline) {
      const response = await fetch(
        `${target.apiUrl}/rest/v1/recruitment_case?select=id&limit=0`,
        {
          headers: {
            apikey: target.anonKey,
            Authorization: `Bearer ${target.anonKey}`,
            "Accept-Profile": "public",
          },
          signal: AbortSignal.timeout(5000),
          redirect: "error",
        },
      );
      const body = await response.json();
      if ([401, 403].includes(response.status) && body.code === "42501") {
        activated = true;
        break;
      }
      await new Promise((ok) => setTimeout(ok, 100));
    }
    if (!activated) throw new Error("Local DEV Data API activation timeout");
    return {
      applied: after.length - ledger.length,
      total: after.length,
      checkpoint,
      schemaCheckpoint: schema,
    };
  } finally {
    try {
      if (locked) await sql`select pg_advisory_unlock(74291106)`;
    } finally {
      await sql.end();
    }
  }
}
