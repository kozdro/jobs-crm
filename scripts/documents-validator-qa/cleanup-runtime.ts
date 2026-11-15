/** Disposable, separately networked cleanup worker for an owned QA target. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readRecruitmentTarget } from "../recruitment/target.ts";

const exec = promisify(execFile);
const docker = async (...args: string[]) =>
  (await exec("docker", args, { maxBuffer: 1024 * 1024 })).stdout.trim();
const root = resolve(import.meta.dirname, "../..");
const label = "jobs-crm.documents-cleanup-qa";
const baseImage =
  "node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9";

export async function startCleanupQa(
  id: string,
  options: { cleanupJwt: string; anonKey: string },
) {
  const target = await readRecruitmentTarget(id);
  if (
    !target.storage ||
    target.anonKey !== options.anonKey ||
    !options.cleanupJwt ||
    /[\r\n]/.test(options.cleanupJwt + options.anonKey)
  )
    throw new Error("Cleanup QA credentials or target refused");
  const project = target.projectId;
  if (!/^jobs-crm-recruitment-[a-f0-9]{6}-[a-f0-9]{12}$/.test(project))
    throw new Error("Invalid QA project");
  const targetNetwork = `network-${project}`;
  const owned = JSON.parse(
    await docker("network", "inspect", targetNetwork),
  )[0];
  if (
    owned.Name !== targetNetwork ||
    owned.Labels?.["jobs-crm.recruitment-local"] !== project ||
    owned.Options?.["com.docker.network.bridge.host_binding_ipv4"] !==
      "127.0.0.1"
  )
    throw new Error("Cleanup QA target network refused");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const owner = `${project}-${suffix}`;
  const network = `documents-cleanup-${suffix}`;
  const worker = `documents-cleanup-${suffix}`;
  const proxy = `documents-cleanup-proxy-${suffix}`;
  const image = `jobs-documents-cleanup-qa:${suffix}`;
  const context = await mkdtemp(join(tmpdir(), "jobs-documents-cleanup-"));
  const created: string[] = [];
  let networkCreated = false,
    imageCreated = false,
    stopped = false;
  async function stop() {
    if (stopped) return;
    for (const name of created) {
      const item = JSON.parse(await docker("inspect", name))[0];
      if (
        item.Name !== `/${name}` ||
        item.Config?.Labels?.[label] !== owner ||
        (item.Mounts?.length ?? 0) !== 0
      )
        throw new Error("Cleanup QA container ownership refused");
    }
    if (networkCreated) {
      const item = JSON.parse(await docker("network", "inspect", network))[0];
      if (
        item.Name !== network ||
        item.Labels?.[label] !== owner ||
        Object.values(item.Containers ?? {}).some(
          (value) => !created.includes((value as { Name: string }).Name),
        )
      )
        throw new Error("Cleanup QA network ownership refused");
    }
    for (const name of [...created].reverse())
      await docker("rm", "--force", name);
    if (networkCreated) await docker("network", "rm", network);
    if (imageCreated) {
      const item = JSON.parse(await docker("image", "inspect", image))[0];
      if (item.Config?.Labels?.[label] !== owner)
        throw new Error("Cleanup QA image ownership refused");
      await docker("image", "rm", image);
    }
    stopped = true;
  }
  try {
    for (const file of [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ])
      await cp(join(root, file), join(context, file));
    await cp(
      join(root, "scripts/documents-cleanup"),
      join(context, "scripts/documents-cleanup"),
      { recursive: true },
    );
    await cp(
      join(root, "scripts/documents-validator-qa/cleanup-proxy.mjs"),
      join(context, "proxy.mjs"),
    );
    await exec("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(context, "proxy.key"),
      "-out",
      join(context, "proxy.crt"),
      "-days",
      "1",
      "-subj",
      "/CN=proxy",
      "-addext",
      "subjectAltName=DNS:proxy",
    ]);
    await writeFile(
      join(context, "Dockerfile"),
      `FROM ${baseImage}\nWORKDIR /app\nCOPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./\nRUN npm install -g pnpm@12.16.1 && pnpm install --prod --frozen-lockfile\nCOPY scripts/documents-cleanup ./scripts/documents-cleanup\nCOPY --chmod=0444 proxy.mjs proxy.crt proxy.key ./\nLABEL ${label}=${owner}\n`,
    );
    await docker("build", "--quiet", "--tag", image, context);
    imageCreated = true;
    await docker(
      "network",
      "create",
      "--driver",
      "bridge",
      "--internal",
      "--opt",
      "com.docker.network.bridge.gateway_mode_ipv4=isolated",
      "--label",
      `${label}=${owner}`,
      network,
    );
    networkCreated = true;
    const envFile = join(context, "cleanup.env");
    await writeFile(
      envFile,
      [
        `NEXT_PUBLIC_SUPABASE_URL=https://proxy:8081`,
        `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${options.anonKey}`,
        `DOCUMENTS_CLEANUP_JWT=${options.cleanupJwt}`,
        "NODE_EXTRA_CA_CERTS=/app/proxy.crt",
      ].join("\n") + "\n",
      { mode: 0o600 },
    );
    const hardening = [
      "--user",
      "10001:10001",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "64",
      "--memory",
      "256m",
      "--cpus",
      "1",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=32m",
      "--label",
      `${label}=${owner}`,
    ];
    await docker(
      "create",
      "--name",
      proxy,
      ...hardening,
      "--network",
      targetNetwork,
      "--env",
      `QA_KONG_HOST=supabase_kong_${project}`,
      image,
      "node",
      "proxy.mjs",
    );
    created.push(proxy);
    await docker("network", "connect", "--alias", "proxy", network, proxy);
    await docker(
      "create",
      "--name",
      worker,
      ...hardening,
      "--network",
      network,
      "--env-file",
      envFile,
      image,
      "node",
      "scripts/documents-cleanup/entrypoint.ts",
    );
    created.push(worker);
    await rm(envFile);
    await docker("start", proxy, worker);
    const items = JSON.parse(await docker("inspect", proxy, worker));
    const item = items.find(
      (entry: { Name: string }) => entry.Name === `/${worker}`,
    );
    if (
      !item?.State?.Running ||
      item.Config?.User !== "10001:10001" ||
      !item.HostConfig?.ReadonlyRootfs ||
      item.HostConfig?.Privileged ||
      (item.Mounts?.length ?? 0) !== 0 ||
      Object.keys(item.NetworkSettings?.Networks ?? {}).join() !== network ||
      item.Config?.Labels?.[label] !== owner ||
      !item.HostConfig?.CapDrop?.includes("ALL") ||
      item.HostConfig?.Memory !== 256 * 1024 * 1024 ||
      item.HostConfig?.PidsLimit !== 64
    )
      throw new Error("Cleanup QA isolation inspection refused");
    const isolationProbe = `import {existsSync} from 'node:fs';
      if(existsSync('/var/run/docker.sock') || ['DOCUMENTS_VALIDATOR_JWT','DOCUMENTS_UPLOADER_JWT','DOCUMENTS_DELETE_AUTHORIZER_JWT','DOCUMENTS_PERMIT_SECRET','DOCUMENTS_VALIDATOR_SERVICE_SECRET'].some(k=>process.env[k]))process.exit(2);
      const denied=await fetch('https://proxy:8081/rest/v1/rpc/forbidden',{method:'POST',signal:AbortSignal.timeout(3000)});if(denied.status!==403)process.exit(3);
      try{await fetch('http://supabase_kong_${project}:8000',{signal:AbortSignal.timeout(3000)});process.exit(4)}catch{}`;
    await docker(
      "exec",
      worker,
      "node",
      "--input-type=module",
      "-e",
      isolationProbe,
    );
    // Exercise the actual restricted worker and TLS proxy before handing it to the runner.
    await docker(
      "exec",
      worker,
      "node",
      "scripts/documents-cleanup/entrypoint.ts",
      "--once",
    );
    return { stop };
  } catch (error) {
    await stop();
    throw error;
  } finally {
    await rm(context, { recursive: true, force: true });
  }
}
