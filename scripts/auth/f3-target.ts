/** Disposable F3 synthetic Auth target. Never imported by the application. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDockerGuard } from "../db/docker-guard.ts";
import { planAuthCleanup } from "./cleanup-plan.ts";
import type { CleanupInventory } from "./cleanup-plan.ts";
import {
  assertEndpoints,
  assertPostgres,
  assertContainerIdentities,
} from "../db/preflight-validation.ts";
const root = resolve(import.meta.dirname, "../..");
const state = join(root, ".foundation-f3");
const label = "jobs-crm.foundation-f3";
const publishedPorts = {
  "5432/tcp": "56522",
  "8000/tcp": "56521",
  "8025/tcp": "56524",
};
const excluded =
  "realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";
const exec = promisify(execFile);
const hash = (data: string) => createHash("sha256").update(data).digest("hex");
interface Manifest {
  id: string;
  owner: "jobs-crm-foundation-f3";
  projectId: string;
  networkId: string;
  workdir: string;
  configHash: string;
  createdAt: string;
  containers?: { id: string; name: string; imageId: string }[];
}
export interface AuthTarget extends Manifest {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  mailUrl: string;
  appOrigin: string;
  secondAppOrigin: string;
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
    throw new Error("Invalid F3 target ID");
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
      `F3 local command failed: ${file.split("/").at(-1)} ${args[0]} (output withheld)`,
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
    s.once("error", () => no(new Error(`F3 loopback port occupied: ${port}`)));
    s.listen(port, "127.0.0.1", () => s.close(() => ok()));
  });
}
async function manifestFor(id: string) {
  const dir = pathFor(id);
  const m = JSON.parse(
    await readFile(join(dir, "manifest.json"), "utf8"),
  ) as Manifest;
  const config = await readFile(join(dir, "supabase/config.toml"), "utf8");
  if (
    m.id !== id ||
    m.owner !== "jobs-crm-foundation-f3" ||
    m.workdir !== dir ||
    !new RegExp(`^jobs-crm-f3-${id}-[a-f0-9]{12}$`).test(m.projectId) ||
    m.networkId !== `network-${m.projectId}` ||
    hash(config) !== m.configHash ||
    !config.includes(`project_id = "${m.projectId}"`)
  )
    throw new Error("F3 target manifest/config drift refused");
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
    throw new Error("F3 network ownership/binding refused");
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
  if (!ids.length) throw new Error("F3 containers missing");
  const cs = JSON.parse(await docker("inspect", ...ids));
  for (const c of cs) {
    if (
      !c.Name.endsWith(`_${m.projectId}`) ||
      c.Config.Labels?.["com.supabase.cli.project"] !== m.projectId ||
      Object.keys(c.NetworkSettings.Networks).length !== 1 ||
      !c.NetworkSettings.Networks[m.networkId]
    )
      throw new Error("F3 container scope drift");
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
            throw new Error("F3 effective/requested binding drift");
        }
      }
    }
  }
  for (const [service, port, host] of [
    ["db", "5432/tcp", "56522"],
    ["kong", "8000/tcp", "56521"],
    ["inbucket", "8025/tcp", "56524"],
  ]) {
    if (
      cs.find(
        (c: { Name: string }) =>
          c.Name === `/supabase_${service}_${m.projectId}`,
      )?.NetworkSettings.Ports?.[port]?.[0]?.HostPort !== host
    )
      throw new Error(`F3 required service binding missing: ${service}`);
  }
  const expectedImages = {
    db: "postgres:17.11.0.006",
    auth: "gotrue:v2.197.0",
    rest: "postgrest:v16.5",
    kong: "kong:2.8.1",
    inbucket: "mailpit:v1.31.3",
  };
  if (cs.length !== Object.keys(expectedImages).length)
    throw new Error("F3 unexpected service count");
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
      throw new Error(`F3 service image pin mismatch: ${service}`);
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
export async function startAuthTarget(id: string): Promise<AuthTarget> {
  const dir = pathFor(id);
  if (existsSync(dir))
    throw new Error("F3 target exists; inspect/cleanup explicitly");
  const originalSocket = await localEngine();
  for (const port of [56521, 56522, 56524]) await freePort(port);
  if ((await cli(root, ["--version"])).trim() !== "2.122.0")
    throw new Error("F3 CLI pin mismatch");
  const projectId = `jobs-crm-f3-${id}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const config = (
    await readFile(join(root, "supabase/f3-config.toml"), "utf8")
  ).replace("jobs-crm-foundation-f3-template", projectId);
  const m: Manifest = {
    id,
    owner: "jobs-crm-foundation-f3",
    projectId,
    networkId: `network-${projectId}`,
    workdir: dir,
    configHash: hash(config),
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
    return await readAuthTarget(id);
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
export async function readAuthTarget(id: string): Promise<AuthTarget> {
  const m = await manifestFor(id);
  if (!m.containers?.length) throw new Error("F3 creation not verified");
  await inspectOwned(m);
  const s = JSON.parse(await cli(m.workdir, ["status", "--output", "json"]));
  const url = assertEndpoints(s.DB_URL, s.API_URL, { api: 56521, db: 56522 });
  if (!s.ANON_KEY || !s.SERVICE_ROLE_KEY)
    throw new Error("F3 fixture keys absent");
  return {
    ...m,
    apiUrl: s.API_URL,
    anonKey: s.ANON_KEY,
    serviceRoleKey: s.SERVICE_ROLE_KEY,
    mailUrl: "http://127.0.0.1:56524",
    appOrigin: "https://127.0.0.1:3143",
    secondAppOrigin: "https://127.0.0.1:3144",
    db: {
      host: "127.0.0.1",
      port: 56522,
      database: "postgres",
      user: "postgres",
      password: decodeURIComponent(url.password),
    },
  };
}
export async function migrateAuthTarget(id: string) {
  const t = await readAuthTarget(id);
  const sql = postgres({ ...t.db, max: 1, ssl: false, onnotice: () => {} });
  try {
    const [v] =
      await sql`select current_database() db,current_user,current_setting('server_version_num')::int version_num`;
    assertPostgres(
      v as { db: string; current_user: string; version_num: number },
    );
    const [s] = await sql`select to_regnamespace('foundation_poc') present`;
    if (s.present)
      throw new Error("F3 initial migration requires fresh fixture schema");
    await migrate(drizzle(sql), {
      migrationsFolder: join(root, "experiments/foundation/rls/migrations"),
      migrationsSchema: "foundation_migrations",
    });
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const res = await fetch(
        `${t.apiUrl}/rest/v1/probe_item?select=id&limit=0`,
        {
          headers: {
            apikey: t.anonKey,
            Authorization: `Bearer ${t.anonKey}`,
            "Accept-Profile": "foundation_poc",
          },
        },
      );
      const body = await res.json();
      if ([401, 403].includes(res.status) && body.code === "42501") return;
      await new Promise((ok) => setTimeout(ok, 100));
    }
    throw new Error("F3 Data API activation timeout");
  } finally {
    await sql.end();
  }
}
export async function stopAuthTarget(id: string) {
  // Manifest/config validation remains mandatory even after an interrupted start.
  const m = await manifestFor(id);
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
  const plan = planAuthCleanup(m, { containers, volumes, network });
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
export async function authTargetEvidence(id: string) {
  const t = await readAuthTarget(id);
  const authResponse = await fetch(`${t.apiUrl}/auth/v1/health`, {
    headers: { apikey: t.anonKey },
    signal: AbortSignal.timeout(10_000),
  });
  const auth = await authResponse.json();
  if (!authResponse.ok || auth.version !== "v2.197.0")
    throw new Error("F3 Auth runtime version mismatch");
  const rest = (
    await docker(
      "exec",
      `supabase_rest_${t.projectId}`,
      "postgrest",
      "--version",
    )
  ).trim();
  if (!/^PostgREST v?16\.5(?:[\w .()+-]*)$/.test(rest))
    throw new Error("F3 Data API runtime version mismatch");
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
