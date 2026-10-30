/** Persistent local target; no imports from application code and no cloud operations. */
import { writePrivateFile } from "./private-files.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  rm,
  lstat,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { createDockerGuard } from "../db/docker-guard.ts";
import { assertEndpoints } from "../db/preflight-validation.ts";
import type {
  CleanupInventory,
  CleanupContainer,
} from "../recruitment/cleanup-plan.ts";
import { ledgerCheckpoint, sha256 } from "../recruitment/validation.ts";
import {
  ports,
  publishedPorts,
  networkLabel,
  assertDevManifest,
  assertDevInventory,
  assertResetConfirmation,
} from "./validation.ts";
import type { DevManifest } from "./validation.ts";
export const root = resolve(import.meta.dirname, "../..");
export const stateDirectory = join(root, ".local-dev");
const exec = promisify(execFile);
const templateFile = join(root, "supabase/local-dev-config.toml");
const manifestFile = join(stateDirectory, "manifest.json");
const excluded =
  "realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor";
export async function command(
  file: string,
  args: string[],
  timeout = 120000,
  extraEnv: NodeJS.ProcessEnv = {},
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
          ...extraEnv,
        },
      })
    ).stdout;
  } catch {
    throw new Error(
      `Local DEV ${file.split("/").at(-1)} ${args[0]} failed (raw output withheld). Check Docker/tool versions and local-development.md.`,
    );
  }
}
let verifiedDockerHost: string | undefined;
const dockerEnvironment = (host: string): NodeJS.ProcessEnv => ({
  DOCKER_HOST: host,
  DOCKER_CONTEXT: undefined,
  DOCKER_TLS_VERIFY: undefined,
  DOCKER_CERT_PATH: undefined,
});
const docker = (...args: string[]) => {
  if (!verifiedDockerHost)
    throw new Error("Local DEV Docker endpoint has not been verified");
  return command("docker", args, 120000, dockerEnvironment(verifiedDockerHost));
};
export async function localEngine() {
  verifiedDockerHost = undefined;
  if (process.env.DOCKER_HOST && process.env.DOCKER_CONTEXT)
    throw new Error(
      "Local DEV refuses simultaneous DOCKER_HOST and DOCKER_CONTEXT; select one local Unix Docker endpoint.",
    );
  let endpoint = process.env.DOCKER_HOST;
  if (endpoint && !endpoint.startsWith("unix:///"))
    throw new Error(
      "Local DEV requires local Docker Unix socket; remote Docker refused",
    );
  if (!endpoint) {
    try {
      // Context inspection reads local metadata only. Never contact its daemon before validating the endpoint.
      const contexts = JSON.parse(
        await command(
          "docker",
          [
            "context",
            "inspect",
            ...(process.env.DOCKER_CONTEXT ? [process.env.DOCKER_CONTEXT] : []),
          ],
          120000,
          { DOCKER_HOST: undefined, DOCKER_CONTEXT: undefined },
        ),
      );
      endpoint = contexts[0]?.Endpoints?.docker?.Host;
    } catch {
      throw new Error(
        "Local Docker unavailable. Start Docker Desktop and retry pnpm dev:local.",
      );
    }
  }
  if (!endpoint?.startsWith("unix:///"))
    throw new Error(
      "Local DEV requires local Docker Unix socket; remote Docker refused",
    );
  let info;
  try {
    info = JSON.parse(
      await command(
        "docker",
        ["info", "--format", "{{json .}}"],
        120000,
        dockerEnvironment(endpoint),
      ),
    );
  } catch {
    throw new Error(
      "Local Docker unavailable. Start Docker Desktop and retry pnpm dev:local.",
    );
  }
  if (info.OSType !== "linux")
    throw new Error("Local Linux Docker Unix socket required");
  verifiedDockerHost = endpoint;
  return endpoint.slice(7);
}
const cli = (args: string[], dockerHost?: string) => {
  const host = dockerHost ?? verifiedDockerHost;
  if (!host) throw new Error("Local DEV Docker endpoint has not been verified");
  return command(
    join(root, "node_modules/.bin/supabase"),
    ["--workdir", stateDirectory, "--agent", "no", ...args],
    600000,
    dockerEnvironment(host),
  );
};
export async function assertFreePort(port: number) {
  await new Promise<void>((ok, no) => {
    const server = createServer();
    server.once("error", () =>
      no(
        new Error(
          `Local DEV port ${port} is occupied; no service was stopped or replaced.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(() => ok()));
  });
}
async function noSymlink(path: string) {
  if (existsSync(path) && (await lstat(path)).isSymbolicLink())
    throw new Error("Local DEV symlink state refused");
}
export async function loadManifest() {
  for (const p of [
    stateDirectory,
    manifestFile,
    join(stateDirectory, "supabase"),
    join(stateDirectory, "supabase/config.toml"),
  ])
    await noSymlink(p);
  const m = JSON.parse(await readFile(manifestFile, "utf8")) as DevManifest;
  assertDevManifest(
    m,
    stateDirectory,
    await readFile(join(stateDirectory, "supabase/config.toml"), "utf8"),
    await readFile(templateFile, "utf8"),
  );
  return m;
}
export async function saveManifest(m: DevManifest) {
  const temp = manifestFile + `-${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(m, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temp, manifestFile);
}
export async function inventoryFor(m: DevManifest): Promise<CleanupInventory> {
  await localEngine();
  const all = (
    await docker("ps", "-a", "--no-trunc", "--format", "{{.ID}} {{.Names}}")
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(" "));
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
      ...all
        .filter(([, name]) => name?.endsWith(`_${m.projectId}`))
        .map(([id]) => id),
    ]),
  ];
  const containers = ids.length
    ? (JSON.parse(await docker("inspect", ...ids)) as CleanupContainer[])
    : [];
  const names = (await docker("volume", "ls", "--format", "{{.Name}}"))
    .trim()
    .split(/\s+/)
    .filter((n) => n.endsWith(`_${m.projectId}`));
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
  const volumes = [...new Set([...names, ...labelledVolumes])];
  const networks = (await docker("network", "ls", "--format", "{{.Name}}"))
    .trim()
    .split(/\s+/);
  return {
    containers,
    volumes: volumes.length
      ? JSON.parse(await docker("volume", "inspect", ...volumes))
      : [],
    network: networks.includes(m.networkId)
      ? JSON.parse(await docker("network", "inspect", m.networkId))[0]
      : undefined,
  };
}
async function waitHealthy(m: DevManifest) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const inv = await inventoryFor(m);
    assertDevInventory(m, inv, { complete: true });
    if (
      inv.containers.every((c) => {
        const state = (
          c as typeof c & {
            State: { Running: boolean; Health?: { Status: string } };
          }
        ).State;
        return (
          state.Running && (!state.Health || state.Health.Status === "healthy")
        );
      })
    )
      return;
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  throw new Error(
    "Local DEV services health timeout; data retained, no automatic cleanup",
  );
}
export async function startLocalDevTarget() {
  const socket = await localEngine();
  if (
    (
      await command(join(root, "node_modules/.bin/supabase"), ["--version"])
    ).trim() !== "2.122.0"
  )
    throw new Error("Local DEV requires Supabase CLI 2.122.0");
  let m: DevManifest;
  if (existsSync(manifestFile)) {
    m = await loadManifest();
    if (!m.containers?.length || !m.volumes?.length)
      throw new Error(
        "Local DEV incomplete initial startup; inspect preserved state before any retry/reset",
      );
    const inv = await inventoryFor(m);
    assertDevInventory(m, inv, { complete: true });
    for (const port of Object.values(ports).filter((p) => p !== ports.app)) {
      const running = inv.containers.some((c) =>
        Object.values(c.NetworkSettings.Ports ?? {}).some((bs) =>
          bs?.some((b) => b.HostPort === String(port)),
        ),
      );
      if (!running) await assertFreePort(port);
    }
    const stopped = inv.containers.filter(
      (c) => !(c as typeof c & { State: { Running: boolean } }).State.Running,
    );
    if (stopped.length) await docker("start", ...stopped.map((c) => c.Id));
  } else {
    await noSymlink(stateDirectory);
    if (
      existsSync(stateDirectory) &&
      (await readdir(stateDirectory)).some(
        (n) => n !== "app.lock" && n !== "lifecycle.lock",
      )
    )
      throw new Error(
        "Local DEV partial state found; inspect manually. No automatic replacement/reset.",
      );
    for (const port of Object.values(ports).filter((p) => p !== ports.app))
      await assertFreePort(port);
    const projectId = `jobs-crm-dev-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const config = (await readFile(templateFile, "utf8")).replace(
      "jobs-crm-dev-template",
      projectId,
    );
    m = {
      owner: "jobs-crm-local-dev",
      projectId,
      networkId: `network-${projectId}`,
      workdir: stateDirectory,
      configHash: sha256(config),
      migrationCheckpoint: ledgerCheckpoint([]),
      createdAt: new Date().toISOString(),
    };
    await mkdir(join(stateDirectory, "supabase"), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(join(stateDirectory, "supabase/config.toml"), config, {
      mode: 0o600,
      flag: "wx",
    });
    await saveManifest(m);
    const before = await inventoryFor(m);
    if (before.containers.length || before.volumes.length || before.network)
      throw new Error(
        "Local DEV identity already has resources; refusing adoption",
      );
    await docker(
      "network",
      "create",
      "--driver",
      "bridge",
      "--opt",
      "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
      "--label",
      `${networkLabel}=${projectId}`,
      m.networkId,
    );
    const studioSnippetsVolume = `supabase_snippets_${m.projectId}`;
    await docker(
      "volume",
      "create",
      "--label",
      `com.supabase.cli.project=${m.projectId}`,
      studioSnippetsVolume,
    );
    const guard = await createDockerGuard(socket, {
      ...m,
      publishedPorts,
      networkLabel,
      studioSnippetsVolume,
    });
    try {
      await cli(
        ["--network-id", m.networkId, "start", "--exclude", excluded],
        guard.dockerHost,
      );
    } catch (error) {
      await writePrivateFile(
        join(stateDirectory, "failed-start.json"),
        JSON.stringify({
          failed: true,
          guardDenials: guard.denials,
          at: new Date().toISOString(),
        }),
      );
      throw error;
    } finally {
      await guard.close();
    }
    const inv = await inventoryFor(m);
    assertDevInventory(m, inv, { complete: true });
    m.containers = inv.containers.map((c) => ({
      id: c.Id,
      name: c.Name,
      imageId: c.Image,
    }));
    m.volumes = inv.volumes.map((v) => v.Name);
    m.networkIdentity = inv.network!.Id;
    m.volumeIdentities = inv.volumes.map((v) => ({
      name: v.Name,
      createdAt: (v as typeof v & { CreatedAt: string }).CreatedAt,
    }));
    await saveManifest(m);
  }
  await waitHealthy(m);
  return readLocalDevTarget();
}
export async function readLocalDevTarget() {
  const m = await loadManifest();
  const inv = await inventoryFor(m);
  assertDevInventory(m, inv, { complete: true });
  const status = JSON.parse(await cli(["status", "--output", "json"]));
  const url = assertEndpoints(status.DB_URL, status.API_URL, ports);
  if (
    !status.ANON_KEY ||
    !status.SERVICE_ROLE_KEY ||
    status.STUDIO_URL !== `http://127.0.0.1:${ports.studio}`
  )
    throw new Error("Local DEV status endpoint/key drift");
  return {
    ...m,
    apiUrl: status.API_URL as string,
    anonKey: status.ANON_KEY as string,
    appOrigin: `https://127.0.0.1:${ports.app}`,
    mailUrl: `http://127.0.0.1:${ports.mail}`,
    studioUrl: `http://127.0.0.1:${ports.studio}`,
    db: {
      host: "127.0.0.1",
      port: ports.db,
      database: "postgres",
      user: "postgres",
      password: decodeURIComponent(url.password),
    },
  };
}
export async function preflightStop() {
  if (!existsSync(manifestFile)) return;
  const m = await loadManifest();
  const inv = await inventoryFor(m);
  return assertDevInventory(m, inv, { complete: true });
}
export async function stopLocalDevTarget() {
  const plan = await preflightStop();
  if (plan?.containerIds.length) await docker("stop", ...plan.containerIds);
}
export async function preflightReset(confirmation: string | undefined) {
  const m = await loadManifest();
  assertResetConfirmation(m, confirmation);
  const history = join(root, ".local-dev-history");
  await noSymlink(history);
  const inv = await inventoryFor(m);
  const plan = assertDevInventory(m, inv);
  for (const v of plan.volumeNames) {
    const users = (await docker("ps", "-aq", "--filter", `volume=${v}`))
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (
      users.some((id) => !plan.containerIds.some((own) => own.startsWith(id)))
    )
      throw new Error(
        "Local DEV volume attached to foreign container; reset refused",
      );
  }
  return { m, plan, history };
}
export async function resetLocalDevTarget(confirmation: string | undefined) {
  const { m, plan, history } = await preflightReset(confirmation);
  await writePrivateFile(
    join(stateDirectory, "reset-started.json"),
    JSON.stringify({
      projectId: m.projectId,
      ...plan,
      at: new Date().toISOString(),
    }),
  );
  if (plan.containerIds.length)
    await docker("rm", "--force", ...plan.containerIds);
  if (plan.volumeNames.length)
    await docker("volume", "rm", ...plan.volumeNames);
  if (plan.networkIds.length) await docker("network", "rm", ...plan.networkIds);
  // Archive the identity, config and failure receipts; do not reuse a consumed project ID.
  await mkdir(history, { recursive: true, mode: 0o700 });
  await rename(stateDirectory, join(history, `${Date.now()}-${m.projectId}`));
}
export async function withLifecycleLock<T>(run: () => Promise<T>) {
  await noSymlink(stateDirectory);
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  const lock = join(stateDirectory, "lifecycle.lock");
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch {
    throw new Error(
      "Local DEV lifecycle operation already running; stale lock requires manual inspection",
    );
  }
  try {
    return await run();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
