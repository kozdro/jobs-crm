/** Synthetic Foundation PoC only; never imported by the Next.js application. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  cp,
  rm,
  rename,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import postgres from "postgres";
import { createDockerGuard } from "./docker-guard.ts";
import { serviceVersions } from "./service-versions.ts";
import {
  assertManifest,
  assertEndpoints,
  assertPostgres,
  assertBindings,
  assertContainerIdentities,
  assertEmptyPublic,
} from "./preflight-validation.ts";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
const stateRoot = join(root, ".foundation-f2");
const label = "jobs-crm.foundation-f2";
const ledgerSchema = "foundation_migrations";
const ledgerTable = "__drizzle_migrations";
const migrationRoot = join(root, "experiments/foundation/rls/migrations");
const excluded =
  "realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";

interface Manifest {
  id: string;
  projectId: string;
  networkId: string;
  workdir: string;
  configHash: string;
  createdAt: string;
  owner: "jobs-crm-foundation-f2";
  ports: { api: number; db: number };
  containers?: { id: string; name: string; imageId: string }[];
  migrationCheckpoint?: string;
}
export interface Target extends Manifest {
  apiUrl: string;
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  anonKey: string;
  serviceRoleKey: string;
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function pathFor(id: string) {
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(id))
    throw new Error("Invalid synthetic target ID");
  return join(stateRoot, id);
}
async function command(
  file: string,
  args: string[],
  timeout = 120_000,
  dockerHost?: string,
) {
  try {
    return (
      await exec(file, args, {
        cwd: root,
        timeout,
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          SUPABASE_ACCESS_TOKEN: "",
          SUPABASE_DB_PASSWORD: "",
          SUPABASE_TELEMETRY_DISABLED: "true",
          ...(dockerHost
            ? { DOCKER_HOST: dockerHost, DOCKER_CONTEXT: undefined }
            : {}),
        },
      })
    ).stdout;
  } catch {
    // CLI output can contain DB URLs, API keys and passwords. Never include it in errors.
    throw new Error(
      `Local command failed: ${file} ${args[0]} (output withheld; may contain credentials)`,
    );
  }
}
const docker = (...args: string[]) => command("docker", args);
const cli = (
  workdir: string,
  args: string[],
  timeout?: number,
  dockerHost?: string,
) =>
  command(
    join(root, "node_modules/.bin/supabase"),
    ["--workdir", workdir, "--agent", "no", ...args],
    timeout,
    dockerHost,
  );

async function localEngine() {
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith("unix://"))
    throw new Error("Remote Docker host refused");
  const contexts = JSON.parse(await docker("context", "inspect"));
  if (!contexts[0]?.Endpoints?.docker?.Host?.startsWith("unix://"))
    throw new Error("Nonlocal Docker context refused");
  const info = JSON.parse(await docker("info", "--format", "{{json .}}"));
  if (info.OSType !== "linux")
    throw new Error("Linux container engine required");
  return {
    dockerVersion: info.ServerVersion,
    cpus: info.NCPU,
    memory: info.MemTotal,
    context: contexts[0].Name,
  };
}
async function freePort(port: number) {
  await new Promise<void>((ok, no) => {
    const server = createServer();
    server.once("error", () =>
      no(new Error(`Required loopback port occupied: ${port}`)),
    );
    server.listen(port, "127.0.0.1", () => server.close(() => ok()));
  });
}
async function manifestFor(id: string): Promise<Manifest> {
  const dir = pathFor(id);
  const m: Manifest = JSON.parse(
    await readFile(join(dir, "manifest.json"), "utf8"),
  );
  const config = await readFile(join(dir, "supabase/config.toml"), "utf8");
  assertManifest(m, id, dir, config);
  return m;
}
async function inspectOwned(m: Manifest) {
  await localEngine();
  const net = JSON.parse(await docker("network", "inspect", m.networkId))[0];
  if (
    net.Labels?.[label] !== m.projectId ||
    net.Options?.["com.docker.network.bridge.host_binding_ipv4"] !== "127.0.0.1"
  )
    throw new Error("Unowned or non-loopback network refused");
  const ids = (
    await docker(
      "ps",
      "-aq",
      "--filter",
      `label=com.supabase.cli.project=${m.projectId}`,
    )
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!ids.length) throw new Error("Target containers missing");
  const containers = JSON.parse(await docker("inspect", ...ids));
  for (const c of containers) {
    if (
      !c.Name.endsWith(`_${m.projectId}`) ||
      !c.NetworkSettings.Networks[m.networkId]
    )
      throw new Error("Unexpected target container identity/network");
  }
  assertBindings(containers, m.projectId, m.ports);
  if (m.containers)
    assertContainerIdentities(
      containers.map((c: { Id: string; Name: string; Image: string }) => ({
        id: c.Id,
        name: c.Name,
        imageId: c.Image,
      })),
      m.containers,
    );
  return containers;
}
export async function startTarget(id: string): Promise<Target> {
  const dir = pathFor(id);
  if (existsSync(dir))
    throw new Error(
      "Target directory already exists; explicit inspect/cleanup required",
    );
  await localEngine();
  await freePort(56421);
  await freePort(56422);
  if ((await cli(root, ["--version"])).trim() !== "2.122.0")
    throw new Error("Supabase CLI pin mismatch");
  const projectId = `jobs-crm-f2-${id}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const networkId = `network-${projectId}`;
  const conflicts = (
    await docker(
      "ps",
      "-aq",
      "--filter",
      `label=com.supabase.cli.project=${projectId}`,
    )
  ).trim();
  if (conflicts) throw new Error("Existing project refused");
  const config = (
    await readFile(join(root, "supabase/config.toml"), "utf8")
  ).replace(
    'project_id = "jobs-crm-foundation-f2-template"',
    `project_id = "${projectId}"`,
  );
  await mkdir(join(dir, "supabase"), { recursive: true, mode: 0o700 });
  const m: Manifest = {
    id,
    projectId,
    networkId,
    workdir: dir,
    configHash: hash(config),
    createdAt: new Date().toISOString(),
    owner: "jobs-crm-foundation-f2",
    ports: { api: 56421, db: 56422 },
    migrationCheckpoint: hash("[]"),
  };
  await writeFile(join(dir, "supabase/config.toml"), config, { mode: 0o600 });
  await writeFile(join(dir, "manifest.json"), JSON.stringify(m, null, 2), {
    mode: 0o600,
  });
  await docker(
    "network",
    "create",
    "--driver",
    "bridge",
    "--opt",
    "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
    "--label",
    `${label}=${projectId}`,
    networkId,
  );
  const net = JSON.parse(await docker("network", "inspect", networkId))[0];
  if (
    net.Options?.["com.docker.network.bridge.host_binding_ipv4"] !== "127.0.0.1"
  )
    throw new Error("Loopback binding not guaranteed; start refused");
  const contexts = JSON.parse(await docker("context", "inspect"));
  const originalSocket = (
    process.env.DOCKER_HOST ?? contexts[0].Endpoints.docker.Host
  ).replace(/^unix:\/\//, "");
  const guard = await createDockerGuard(originalSocket, m);
  try {
    await cli(
      dir,
      ["--network-id", networkId, "start", "--exclude", excluded],
      600_000,
      guard.dockerHost,
    );
    const created = await inspectOwned(m);
    m.containers = created
      .map((c: { Id: string; Name: string; Image: string }) => ({
        id: c.Id,
        name: c.Name,
        imageId: c.Image,
      }))
      .sort((a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name),
      );
    await writeFile(join(dir, "manifest.json"), JSON.stringify(m, null, 2), {
      mode: 0o600,
    });
    return await readTarget(id);
  } catch (error) {
    const ids = (
      await docker(
        "ps",
        "-aq",
        "--filter",
        `label=com.supabase.cli.project=${projectId}`,
      )
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (ids.length) {
      const containers = JSON.parse(await docker("inspect", ...ids));
      if (
        containers.some(
          (c: { Name: string; Config: { Labels: Record<string, string> } }) =>
            !c.Name.endsWith(`_${projectId}`) ||
            c.Config.Labels?.["com.supabase.cli.project"] !== projectId,
        )
      )
        throw new Error(
          "Startup failure: unexpected resource identity; no guessed cleanup",
        );
      await writeFile(
        join(dir, "failed-start-bindings.json"),
        JSON.stringify(
          containers.map(
            (c: {
              Id: string;
              Name: string;
              Image: string;
              NetworkSettings: { Ports: unknown };
            }) => ({
              id: c.Id,
              name: c.Name,
              imageId: c.Image,
              ports: c.NetworkSettings.Ports,
            }),
          ),
          null,
          2,
        ),
        { mode: 0o600 },
      );
      await docker("stop", ...ids);
    }
    if (guard.denials.length)
      throw new Error(
        "CLI start refused by local Docker guard: " +
          [...new Set(guard.denials)].join("; "),
      );
    throw error;
  } finally {
    await guard.close();
  }
}
export async function readTarget(id: string): Promise<Target> {
  const m = await manifestFor(id);
  if (!m.containers?.length) throw new Error("Target creation not verified");
  await inspectOwned(m);
  const s = JSON.parse(await cli(m.workdir, ["status", "--output", "json"]));
  const apiUrl = s.API_URL;
  const url = assertEndpoints(s.DB_URL, apiUrl, m.ports);
  if (!s.ANON_KEY || !s.SERVICE_ROLE_KEY)
    throw new Error("Local fixture keys missing");
  return {
    ...m,
    apiUrl,
    db: {
      host: url.hostname,
      port: Number(url.port),
      database: "postgres",
      user: "postgres",
      password: decodeURIComponent(url.password),
    },
    anonKey: s.ANON_KEY,
    serviceRoleKey: s.SERVICE_ROLE_KEY,
  };
}
function connection(t: Target) {
  return postgres({
    ...t.db,
    max: 1,
    ssl: false,
    connect_timeout: 10,
    idle_timeout: 5,
    onnotice: () => {},
  });
}
async function dataApiRoleSettings(sql: postgres.Sql) {
  return sql`select r.rolname role,d.datname database,s.setting from pg_db_role_setting x join pg_roles r on r.oid=x.setrole left join pg_database d on d.oid=x.setdatabase cross join lateral unnest(x.setconfig) s(setting) where r.rolname='authenticator' and (x.setdatabase=0 or d.datname=current_database()) and s.setting like 'pgrst.db_schemas=%' order by d.datname nulls first,s.setting`;
}
async function schemaActivationBarrier(
  id: string,
  sql: postgres.Sql,
  required: boolean,
) {
  if (!required) return;
  const settings = await dataApiRoleSettings(sql);
  if (
    !settings.some(
      (r) =>
        r.database === "postgres" &&
        r.setting === "pgrst.db_schemas=public,foundation_poc",
    )
  )
    throw new Error("Data API activation role configuration mismatch");
  const t = await readTarget(id);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `${t.apiUrl}/rest/v1/probe_item?select=id&limit=0`,
        {
          headers: {
            apikey: t.anonKey,
            Authorization: `Bearer ${t.anonKey}`,
            "Accept-Profile": "foundation_poc",
          },
          signal: AbortSignal.timeout(1500),
        },
      );
      const body = (await response.json()) as { code?: unknown };
      // Schema/table cache exists. Permission denial is expected for anon; this is not an RLS test.
      if (
        response.status === 200 ||
        ((response.status === 401 || response.status === 403) &&
          body.code === "42501")
      )
        return;
    } catch {
      /* Read-only bounded polling while the reviewed NOTIFY reload is processed. */
    }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error(
    "Data API schema activation barrier timed out after committed migrations",
  );
}
export async function preflight(id: string) {
  const t = await readTarget(id);
  const sql = connection(t);
  try {
    const [v] =
      await sql`select current_database() db, current_user, current_setting('server_version') version, current_setting('server_version_num')::int version_num`;
    assertPostgres({
      db: v.db,
      current_user: v.current_user,
      version_num: v.version_num,
    });
    const [publicSurface] =
      await sql`select (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','f','S')) relations, (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') functions,has_schema_privilege('anon','public','create') anon_create,has_schema_privilege('authenticated','public','create') authenticated_create`;
    assertEmptyPublic({
      relations: publicSurface.relations,
      functions: publicSurface.functions,
      anon_create: publicSurface.anon_create,
      authenticated_create: publicSurface.authenticated_create,
    });
    const containers = await inspectOwned(t);
    const images = containers
      .map((c: { Name: string; Config: { Image: string }; Image: string }) => ({
        service: c.Name.replace(`_${t.projectId}`, "").replace(
          "/supabase_",
          "",
        ),
        image: c.Config.Image,
        imageId: c.Image,
      }))
      .sort((a: { service: string }, b: { service: string }) =>
        a.service.localeCompare(b.service),
      );
    const extensions =
      await sql`select name, default_version, installed_version from pg_available_extensions order by name`;
    return {
      id,
      projectId: t.projectId,
      ports: t.ports,
      postgres: v.version,
      publicSurface,
      dataApiRoleSettings: await dataApiRoleSettings(sql),
      runtimeVersions: await serviceVersions(t.projectId, t.apiUrl, t.anonKey),
      images,
      extensions,
      dataApi: containers
        .filter(
          (c: { Name: string }) => c.Name === `/supabase_rest_${t.projectId}`,
        )
        .flatMap((c: { Config: { Env: string[] } }) =>
          c.Config.Env.filter(
            (v) =>
              v.startsWith("PGRST_DB_SCHEMAS=") ||
              v.startsWith("PGRST_DB_EXTRA_SEARCH_PATH="),
          ),
        ),
      engine: await localEngine(),
    };
  } finally {
    await sql.end();
  }
}
export async function connectTarget(id: string) {
  await preflight(id);
  return connection(await readTarget(id));
}
export async function migrateTarget(
  id: string,
  options: { migrationsFolder?: string; through?: number } = {},
) {
  const sql = await connectTarget(id);
  let temp: string | undefined;
  let locked = false;
  try {
    const [lock] = await sql`select pg_try_advisory_lock(74291105) locked`;
    if (!lock.locked)
      throw new Error("Migration already running; safe refusal");
    locked = true;
    const folder = resolve(options.migrationsFolder ?? migrationRoot);
    const all = readMigrationFiles({ migrationsFolder: folder });
    const through = options.through ?? all.length;
    if (!Number.isInteger(through) || through < 1 || through > all.length)
      throw new Error("Invalid migration cutoff");
    const selected = all.slice(0, through);
    if (
      selected.some(
        (m, i) => i > 0 && m.folderMillis <= selected[i - 1].folderMillis,
      )
    )
      throw new Error("Nonmonotonic migration journal refused");
    const currentManifest = await manifestFor(id);
    const [exists] =
      await sql`select to_regclass('foundation_migrations.__drizzle_migrations') present`;
    const ledger = exists.present
      ? await sql`select id, hash, created_at from foundation_migrations.__drizzle_migrations order by id`
      : [];
    const fingerprint = (rows: readonly Record<string, unknown>[]) =>
      hash(
        JSON.stringify(
          rows.map((r) => ({
            id: Number(r.id),
            hash: r.hash,
            created_at: Number(r.created_at),
          })),
        ),
      );
    // SERIAL values can have gaps after rollback; the exact checkpoint still protects IDs.
    if (fingerprint(ledger) !== currentManifest.migrationCheckpoint)
      throw new Error("Migration ledger checkpoint tampering refused");
    if (!exists.present) {
      const [schema] =
        await sql`select exists(select 1 from pg_namespace where nspname='foundation_poc') present`;
      if (schema.present) throw new Error("Unrecorded PoC schema refused");
    }
    if (ledger.length > selected.length)
      throw new Error("Migration ledger is ahead of selected history");
    for (const [i, row] of ledger.entries())
      if (
        row.hash !== selected[i].hash ||
        Number(row.created_at) !== selected[i].folderMillis
      )
        throw new Error("Applied migration hash/ledger tampering refused");
    let applyFolder = folder;
    if (through !== all.length) {
      temp = await mkdtemp(join(tmpdir(), "jobs-f2-migrations-"));
      await cp(folder, temp, { recursive: true });
      const journalPath = join(temp, "meta/_journal.json");
      const journal = JSON.parse(await readFile(journalPath, "utf8"));
      journal.entries = journal.entries.slice(0, through);
      await writeFile(journalPath, JSON.stringify(journal));
      applyFolder = temp;
    }
    await migrate(drizzle(sql), {
      migrationsFolder: applyFolder,
      migrationsSchema: ledgerSchema,
      migrationsTable: ledgerTable,
    });
    const after =
      await sql`select id, hash, created_at from foundation_migrations.__drizzle_migrations order by id`;
    if (
      after.length !== selected.length ||
      after.some(
        (r, i) =>
          r.hash !== selected[i].hash ||
          Number(r.created_at) !== selected[i].folderMillis,
      )
    )
      throw new Error("Post-migrate ledger mismatch");
    await schemaActivationBarrier(
      id,
      sql,
      selected.some((m) =>
        /ALTER\s+ROLE\s+authenticator\s+IN\s+DATABASE\s+postgres\s+SET\s+pgrst\.db_schemas/i.test(
          m.sql.join("\n"),
        ),
      ),
    );
    currentManifest.migrationCheckpoint = fingerprint(after);
    const checkpointPath = join(currentManifest.workdir, "manifest.json");
    await writeFile(
      checkpointPath + ".next",
      JSON.stringify(currentManifest, null, 2),
      { mode: 0o600 },
    );
    await rename(checkpointPath + ".next", checkpointPath);
    return { applied: after.length - ledger.length, total: after.length };
  } finally {
    if (locked) await sql`select pg_advisory_unlock(74291105)`;
    await sql.end();
    if (temp) await rm(temp, { recursive: true, force: true });
  }
}
export async function snapshot(id: string) {
  const sql = await connectTarget(id);
  try {
    const relations =
      await sql`select c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.reloptions, pg_get_userbyid(c.relowner) owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='foundation_poc' order by c.relname`;
    const columns =
      await sql`select table_name,column_name,ordinal_position,data_type,is_nullable,column_default from information_schema.columns where table_schema='foundation_poc' order by table_name,ordinal_position`;
    const constraints =
      await sql`select c.conname, t.relname, pg_get_constraintdef(c.oid) definition from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='foundation_poc' order by t.relname,c.conname`;
    const policies =
      await sql`select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='foundation_poc' order by tablename,policyname`;
    const grants =
      await sql`select grantee,table_name,privilege_type,is_grantable from information_schema.table_privileges where table_schema='foundation_poc' order by grantee,table_name,privilege_type`;
    const functions =
      await sql`select p.proname,pg_get_function_identity_arguments(p.oid) args,p.prosecdef,p.proacl,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='foundation_poc' order by p.proname`;
    const schemas =
      await sql`select nspname,nspacl from pg_namespace where nspname in ('foundation_poc','foundation_migrations') order by nspname`;
    const defaults =
      await sql`select pg_get_userbyid(d.defaclrole) role,n.nspname,d.defaclobjtype,d.defaclacl from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in ('foundation_poc','foundation_migrations') order by role,n.nspname,d.defaclobjtype`;
    const publications =
      await sql`select pubname,schemaname,tablename from pg_publication_tables where schemaname='foundation_poc' order by pubname,tablename`;
    const ledger =
      await sql`select id,hash,created_at from foundation_migrations.__drizzle_migrations order by id`;
    const roleSettings = await dataApiRoleSettings(sql);
    return JSON.parse(
      JSON.stringify({
        relations,
        columns,
        constraints,
        policies,
        grants,
        functions,
        schemas,
        defaults,
        publications,
        roleSettings,
        ledger,
      }),
    );
  } finally {
    await sql.end();
  }
}
export async function stopTarget(
  id: string,
  options: { remove?: boolean } = {},
) {
  if (!options.remove)
    throw new Error(
      "Disposable F2 stop requires explicit remove:true / --remove",
    );
  const m = await manifestFor(id);
  await localEngine();
  const networks = (
    await docker(
      "network",
      "ls",
      "-q",
      "--filter",
      `label=${label}=${m.projectId}`,
    )
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const network of networks) {
    const n = JSON.parse(await docker("network", "inspect", network))[0];
    if (n.Name !== m.networkId || n.Labels?.[label] !== m.projectId)
      throw new Error("Unowned cleanup network refused");
  }
  const ids = (
    await docker(
      "ps",
      "-aq",
      "--filter",
      `label=com.supabase.cli.project=${m.projectId}`,
    )
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (ids.length) {
    const containers = JSON.parse(await docker("inspect", ...ids));
    for (const c of containers)
      if (
        c.Config.Labels?.["com.supabase.cli.project"] !== m.projectId ||
        !c.Name.endsWith(`_${m.projectId}`)
      )
        throw new Error("Unowned cleanup container refused");
    if (m.containers)
      assertContainerIdentities(
        containers.map((c: { Id: string; Name: string; Image: string }) => ({
          id: c.Id,
          name: c.Name,
          imageId: c.Image,
        })),
        m.containers,
      );
    await cli(m.workdir, [
      "--network-id",
      m.networkId,
      "stop",
      "--project-id",
      m.projectId,
      "--no-backup",
    ]);
  }
  if (
    (
      await docker(
        "ps",
        "-aq",
        "--filter",
        `label=com.supabase.cli.project=${m.projectId}`,
      )
    ).trim()
  )
    throw new Error("Owned containers remain after stop");
  const volumes = (
    await docker(
      "volume",
      "ls",
      "-q",
      "--filter",
      `label=com.supabase.cli.project=${m.projectId}`,
    )
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const volume of volumes) {
    const v = JSON.parse(await docker("volume", "inspect", volume))[0];
    if (
      v.Labels?.["com.supabase.cli.project"] !== m.projectId ||
      !v.Name.endsWith(`_${m.projectId}`)
    )
      throw new Error("Unowned cleanup volume refused");
    await docker("volume", "rm", volume);
  }
  const remainingNetworks = (
    await docker(
      "network",
      "ls",
      "-q",
      "--filter",
      `label=${label}=${m.projectId}`,
    )
  ).trim();
  if (remainingNetworks) await docker("network", "rm", m.networkId);
  await rm(m.workdir, { recursive: true });
}
