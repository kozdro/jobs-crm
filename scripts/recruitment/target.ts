/** Disposable product-model local target. Never imported by the application. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rm, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  assertRecruitmentManifest,
  assertMigrationLedger,
  ledgerCheckpoint,
  sha256,
  recruitmentProjectId,
} from "./validation.ts";
import type { RecruitmentManifest, LedgerRow } from "./validation.ts";
import { createDockerGuard } from "../db/docker-guard.ts";
import { planRecruitmentCleanup } from "./cleanup-plan.ts";
import type { CleanupInventory } from "./cleanup-plan.ts";
import {
  assertEndpoints,
  assertPostgres,
  assertContainerIdentities,
} from "../db/preflight-validation.ts";
const root = resolve(import.meta.dirname, "../..");
const state = join(root, ".recruitment-local");
const label = "jobs-crm.recruitment-local";
const publishedPorts = {
  "5432/tcp": "56622",
  "8000/tcp": "56621",
  "8025/tcp": "56624",
};
const excluded =
  "realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";
const exec = promisify(execFile);
type Manifest = RecruitmentManifest;
export interface RecruitmentTarget extends Manifest {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  mailUrl: string;
  appOrigin: string;
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}
function pathFor(id: string) {
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(id))
    throw new Error("Invalid Recruitment target ID");
  return join(state, id);
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
    throw new Error(
      `Recruitment local command failed: ${file.split("/").at(-1)} ${args[0]} (output withheld)`,
    );
  }
}
const docker = (...args: string[]) => command("docker", args);
const cli = (
  dir: string,
  args: string[],
  timeout?: number,
  dockerHost?: string,
) =>
  command(
    join(root, "node_modules/.bin/supabase"),
    ["--workdir", dir, "--agent", "no", ...args],
    timeout,
    dockerHost,
  );
async function localEngine() {
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith("unix://"))
    throw new Error("Remote Docker refused");
  const contexts = JSON.parse(await docker("context", "inspect"));
  const endpoint =
    process.env.DOCKER_HOST ?? contexts[0]?.Endpoints?.docker?.Host;
  if (!endpoint?.startsWith("unix://"))
    throw new Error("Local Unix Docker required");
  const info = JSON.parse(await docker("info", "--format", "{{json .}}"));
  if (info.OSType !== "linux") throw new Error("Linux local engine required");
  return endpoint.replace(/^unix:\/\//, "");
}
async function freePort(port: number) {
  await new Promise<void>((ok, no) => {
    const s = createServer();
    s.once("error", () =>
      no(new Error(`Recruitment loopback port occupied: ${port}`)),
    );
    s.listen(port, "127.0.0.1", () => s.close(() => ok()));
  });
}
async function manifestFor(id: string, retiringPrestartTarget = false) {
  const dir = pathFor(id);
  const m = JSON.parse(
    await readFile(join(dir, "manifest.json"), "utf8"),
  ) as Manifest;
  const config = await readFile(join(dir, "supabase/config.toml"), "utf8");
  assertRecruitmentManifest(
    m,
    id,
    dir,
    config,
    await readFile(join(root, "supabase/recruitment-config.toml"), "utf8"),
    retiringPrestartTarget,
  );
  return m;
}
async function inspectOwned(m: Manifest) {
  await localEngine();
  const network = JSON.parse(
    await docker("network", "inspect", m.networkId),
  )[0];
  if (
    network.Labels?.[label] !== m.projectId ||
    network.Options?.["com.docker.network.bridge.host_binding_ipv4"] !==
      "127.0.0.1"
  )
    throw new Error("Recruitment network ownership/binding refused");
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
  if (!ids.length) throw new Error("Recruitment containers missing");
  const cs = JSON.parse(await docker("inspect", ...ids));
  for (const c of cs) {
    if (
      !c.Name.endsWith(`_${m.projectId}`) ||
      c.Config.Labels?.["com.supabase.cli.project"] !== m.projectId ||
      Object.keys(c.NetworkSettings.Networks).length !== 1 ||
      !c.NetworkSettings.Networks[m.networkId]
    )
      throw new Error("Recruitment container scope drift");
    for (const mapping of [
      c.HostConfig.PortBindings,
      c.NetworkSettings.Ports,
    ]) {
      for (const [port, bindings] of Object.entries(mapping ?? {})) {
        for (const binding of (bindings ?? []) as {
          HostIp: string;
          HostPort: string;
        }[]) {
          if (
            binding.HostIp !== "127.0.0.1" ||
            !Object.hasOwn(publishedPorts, port) ||
            binding.HostPort !==
              publishedPorts[port as keyof typeof publishedPorts]
          )
            throw new Error("Recruitment effective/requested binding drift");
        }
      }
    }
  }
  for (const [service, port, host] of [
    ["db", "5432/tcp", "56622"],
    ["kong", "8000/tcp", "56621"],
    ["inbucket", "8025/tcp", "56624"],
  ]) {
    if (
      cs.find(
        (c: { Name: string }) =>
          c.Name === `/supabase_${service}_${m.projectId}`,
      )?.NetworkSettings.Ports?.[port]?.[0]?.HostPort !== host
    )
      throw new Error(
        `Recruitment required service binding missing: ${service}`,
      );
  }
  const expectedImages = {
    db: "postgres:17.11.0.006",
    auth: "gotrue:v2.197.0",
    rest: "postgrest:v16.5",
    kong: "kong:2.8.1",
    inbucket: "mailpit:v1.31.3",
  };
  if (cs.length !== Object.keys(expectedImages).length)
    throw new Error("Recruitment unexpected service count");
  for (const [service, image] of Object.entries(expectedImages)) {
    const c = cs.find(
      (entry: { Name: string }) =>
        entry.Name === `/supabase_${service}_${m.projectId}`,
    );
    if (
      !c ||
      !["public.ecr.aws/supabase/", "ghcr.io/supabase/", "supabase/"].some(
        (prefix) => c.Config.Image === prefix + image,
      )
    )
      throw new Error(`Recruitment service image pin mismatch: ${service}`);
  }
  const identities = cs.map(
    (c: { Id: string; Name: string; Image: string }) => ({
      id: c.Id,
      name: c.Name,
      imageId: c.Image,
    }),
  );
  if (m.containers) assertContainerIdentities(identities, m.containers);
  return identities;
}
export async function startRecruitmentTarget(
  id: string,
): Promise<RecruitmentTarget> {
  const dir = pathFor(id);
  if (existsSync(dir))
    throw new Error("Recruitment target exists; inspect/cleanup explicitly");
  const originalSocket = await localEngine();
  for (const port of [56621, 56622, 56624]) await freePort(port);
  if ((await cli(root, ["--version"])).trim() !== "2.122.0")
    throw new Error("Recruitment CLI pin mismatch");
  const projectId = recruitmentProjectId(
    id,
    randomUUID().replaceAll("-", "").slice(0, 12),
  );
  const config = (
    await readFile(join(root, "supabase/recruitment-config.toml"), "utf8")
  ).replace("jobs-crm-recruitment-local-template", projectId);
  const m: Manifest = {
    id,
    owner: "jobs-crm-recruitment-local",
    projectId,
    networkId: `network-${projectId}`,
    workdir: dir,
    configHash: sha256(config),
    migrationCheckpoint: ledgerCheckpoint([]),
    createdAt: new Date().toISOString(),
  };
  await mkdir(join(dir, "supabase"), { recursive: true, mode: 0o700 });
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
    m.networkId,
  );
  const guard = await createDockerGuard(originalSocket, {
    ...m,
    publishedPorts,
    networkLabel: label,
  });
  try {
    await cli(
      dir,
      ["--network-id", m.networkId, "start", "--exclude", excluded],
      600_000,
      guard.dockerHost,
    );
    m.containers = await inspectOwned(m);
    await writeFile(join(dir, "manifest.json"), JSON.stringify(m, null, 2), {
      mode: 0o600,
    });
    return await readRecruitmentTarget(id);
  } catch (error) {
    await writeFile(
      join(dir, "failed-start.json"),
      JSON.stringify({
        failed: true,
        guardDenials: guard.denials,
        at: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );
    throw error;
  } finally {
    await guard.close();
  }
}
export async function readRecruitmentTarget(
  id: string,
): Promise<RecruitmentTarget> {
  const m = await manifestFor(id);
  if (!m.containers?.length)
    throw new Error("Recruitment creation not verified");
  await inspectOwned(m);
  const s = JSON.parse(await cli(m.workdir, ["status", "--output", "json"]));
  const url = assertEndpoints(s.DB_URL, s.API_URL, { api: 56621, db: 56622 });
  if (!s.ANON_KEY || !s.SERVICE_ROLE_KEY)
    throw new Error("Recruitment fixture keys absent");
  return {
    ...m,
    apiUrl: s.API_URL,
    anonKey: s.ANON_KEY,
    serviceRoleKey: s.SERVICE_ROLE_KEY,
    mailUrl: "http://127.0.0.1:56624",
    appOrigin: "https://127.0.0.1:3153",
    db: {
      host: "127.0.0.1",
      port: 56622,
      database: "postgres",
      user: "postgres",
      password: decodeURIComponent(url.password),
    },
  };
}
const migrationFolder = join(root, "db/recruitment/migrations");
async function databaseFor(id: string) {
  const target = await readRecruitmentTarget(id);
  const sql = postgres({
    ...target.db,
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  try {
    const [v] =
      await sql`select current_database() db,current_user,current_setting('server_version_num')::int version_num`;
    assertPostgres(
      v as { db: string; current_user: string; version_num: number },
    );
    return { target, sql };
  } catch (error) {
    await sql.end();
    throw error;
  }
}
async function readLedger(
  sql: ReturnType<typeof postgres>,
): Promise<LedgerRow[]> {
  const [exists] =
    await sql`select to_regclass('recruitment_migrations.__drizzle_migrations') present`;
  return exists.present
    ? await sql<
        LedgerRow[]
      >`select id,hash,created_at from recruitment_migrations.__drizzle_migrations order by id`
    : [];
}
export async function verifyRecruitmentMigrations(id: string) {
  const { sql } = await databaseFor(id);
  try {
    const manifest = await manifestFor(id);
    const ledger = await readLedger(sql);
    assertMigrationLedger(
      ledger,
      readMigrationFiles({ migrationsFolder: migrationFolder }),
      manifest.migrationCheckpoint,
      true,
    );
    return { total: ledger.length, checkpoint: manifest.migrationCheckpoint };
  } finally {
    await sql.end();
  }
}
export async function migrateRecruitmentTarget(id: string) {
  const { target, sql } = await databaseFor(id);
  let locked = false;
  try {
    const [lock] = await sql`select pg_try_advisory_lock(74291106) locked`;
    if (!lock.locked)
      throw new Error("Recruitment migration already running; refused");
    locked = true;
    const manifest = await manifestFor(id);
    const history = readMigrationFiles({ migrationsFolder: migrationFolder });
    const ledger = await readLedger(sql);
    assertMigrationLedger(ledger, history, manifest.migrationCheckpoint);
    const [synthetic] =
      await sql`select to_regnamespace('foundation_poc') present`;
    if (synthetic.present)
      throw new Error("Synthetic F2 schema on product target refused");
    if (!ledger.length) {
      const [bootstrap] = await sql`select
        (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','f','S')) relations,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') functions,
        has_schema_privilege('anon','public','create') anon_create,
        has_schema_privilege('authenticated','public','create') authenticated_create`;
      if (
        bootstrap.relations ||
        bootstrap.functions ||
        bootstrap.anon_create ||
        bootstrap.authenticated_create
      )
        throw new Error(
          "Product target public bootstrap is not empty/non-writable",
        );
    }
    await migrate(drizzle(sql), {
      migrationsFolder: migrationFolder,
      migrationsSchema: "recruitment_migrations",
      migrationsTable: "__drizzle_migrations",
    });
    const after = await readLedger(sql);
    const checkpoint = ledgerCheckpoint(after);
    assertMigrationLedger(after, history, checkpoint, true);
    // A committed migration must become visible through the actual local Data API.
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
    if (!activated) throw new Error("Recruitment Data API activation timeout");
    manifest.migrationCheckpoint = checkpoint;
    const path = join(manifest.workdir, "manifest.json");
    await writeFile(path + ".next", JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });
    await rename(path + ".next", path);
    return {
      applied: after.length - ledger.length,
      total: after.length,
      checkpoint,
    };
  } finally {
    if (locked) await sql`select pg_advisory_unlock(74291106)`;
    await sql.end();
  }
}
export async function stopRecruitmentTarget(id: string) {
  // Manifest/config validation remains mandatory even after an interrupted start.
  const m = await manifestFor(id, true);
  await localEngine();
  const containerListing = (
    await docker("ps", "-a", "--no-trunc", "--format", "{{.ID}} {{.Names}}")
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(" "));
  const labelled = (
    await docker(
      "ps",
      "-aq",
      "--no-trunc",
      "--filter",
      `label=com.supabase.cli.project=${m.projectId}`,
    )
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const ids = [
    ...new Set([
      ...labelled,
      ...containerListing
        .filter(([, name]) => name?.endsWith(`_${m.projectId}`))
        .map(([id]) => id),
    ]),
  ];
  const containers: CleanupInventory["containers"] = ids.length
    ? JSON.parse(await docker("inspect", ...ids))
    : [];
  const volumeNames = (await docker("volume", "ls", "--format", "{{.Name}}"))
    .trim()
    .split(/\s+/)
    .filter((name) => name.endsWith(`_${m.projectId}`));
  const labelledVolumes = (
    await docker(
      "volume",
      "ls",
      "--filter",
      `label=com.supabase.cli.project=${m.projectId}`,
      "--format",
      "{{.Name}}",
    )
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const names = [...new Set([...volumeNames, ...labelledVolumes])];
  const volumes: CleanupInventory["volumes"] = names.length
    ? JSON.parse(await docker("volume", "inspect", ...names))
    : [];
  const networks = (await docker("network", "ls", "--format", "{{.Name}}"))
    .trim()
    .split(/\s+/);
  const network: CleanupInventory["network"] = networks.includes(m.networkId)
    ? JSON.parse(await docker("network", "inspect", m.networkId))[0]
    : undefined;
  // Validate the entire partial inventory before the first mutation; no healthy services required.
  const plan = planRecruitmentCleanup(m, { containers, volumes, network });
  const receipt = {
    projectId: m.projectId,
    configHash: m.configHash,
    at: new Date().toISOString(),
    ...plan,
  };
  await writeFile(
    join(m.workdir, "cleanup-started.json"),
    JSON.stringify(receipt, null, 2),
    { mode: 0o600 },
  );
  if (plan.containerIds.length)
    await docker("rm", "--force", ...plan.containerIds);
  if (plan.volumeNames.length)
    await docker("volume", "rm", ...plan.volumeNames);
  if (plan.networkIds.length) await docker("network", "rm", ...plan.networkIds);
  await rm(join(m.workdir, "tls"), { recursive: true, force: true });
  await writeFile(
    join(m.workdir, "cleanup-complete.json"),
    JSON.stringify(receipt, null, 2),
    { mode: 0o600 },
  );
  // Retain manifest/config and failed-start evidence. Repeated cleanup is safe; ID stays consumed.
}

/** Safe runtime evidence: no keys, cookies, DB URLs or token material. */
export async function recruitmentTargetEvidence(id: string) {
  const t = await readRecruitmentTarget(id);
  const authResponse = await fetch(`${t.apiUrl}/auth/v1/health`, {
    headers: { apikey: t.anonKey },
    signal: AbortSignal.timeout(10_000),
  });
  const auth = await authResponse.json();
  if (!authResponse.ok || auth.version !== "v2.197.0")
    throw new Error("Recruitment Auth runtime version mismatch");
  const rest = (
    await docker(
      "exec",
      `supabase_rest_${t.projectId}`,
      "postgrest",
      "--version",
    )
  ).trim();
  if (!/^PostgREST v?16\.5(?:[\w .()+-]*)$/.test(rest))
    throw new Error("Recruitment Data API runtime version mismatch");
  const sql = postgres({ ...t.db, max: 1, ssl: false, onnotice: () => {} });
  try {
    const [v] =
      await sql`select current_database() db,current_user,current_setting('server_version_num')::int version_num,current_setting('server_version') version`;
    assertPostgres(
      v as { db: string; current_user: string; version_num: number },
    );
    return {
      id,
      projectId: t.projectId,
      configHash: t.configHash,
      containers: t.containers,
      auth: auth.version,
      postgrest: rest,
      postgres: v.version,
      fixture: {
        jwtExpirySeconds: 60,
        emailOtpExpirySeconds: 60,
        signup: true,
        emailConfirmation: true,
        securePasswordChange: true,
      },
    };
  } finally {
    await sql.end();
  }
}
