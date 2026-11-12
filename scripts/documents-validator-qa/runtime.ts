/** Disposable validator runtime for the owned Recruitment QA target only. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readRecruitmentTarget } from "../recruitment/target.ts";

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
const baseImage =
  "node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9";
const label = "jobs-crm.documents-validator-qa";
const port = 3174;
const docker = async (...args: string[]) =>
  (await exec("docker", args, { maxBuffer: 1024 * 1024 })).stdout.trim();

export async function startValidatorQa(
  id: string,
  options: { validatorJwt: string; serviceSecret: string; anonKey: string },
) {
  const target = await readRecruitmentTarget(id);
  if (
    !target.storage ||
    target.anonKey !== options.anonKey ||
    !options.validatorJwt ||
    !options.serviceSecret ||
    /[\r\n]/.test(
      options.validatorJwt + options.serviceSecret + options.anonKey,
    )
  )
    throw new Error("Validator QA target or credentials refused");
  const project = target.projectId;
  if (!/^jobs-crm-recruitment-[a-f0-9]{6}-[a-f0-9]{12}$/.test(project))
    throw new Error("Invalid QA project");
  const targetNetwork = `network-${project}`;
  const inspectedNetwork = JSON.parse(
    await docker("network", "inspect", targetNetwork),
  )[0];
  if (
    inspectedNetwork.Name !== targetNetwork ||
    inspectedNetwork.Labels?.["jobs-crm.recruitment-local"] !== project ||
    inspectedNetwork.Options?.[
      "com.docker.network.bridge.host_binding_ipv4"
    ] !== "127.0.0.1"
  )
    throw new Error("Validator QA target network refused");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const owner = `${project}-${suffix}`;
  const network = `documents-validator-${suffix}`;
  const validator = `documents-validator-${suffix}`;
  const proxy = `documents-validator-proxy-${suffix}`;
  const image = `jobs-documents-validator-qa:${suffix}`;
  const context = await mkdtemp(join(tmpdir(), "jobs-documents-validator-"));
  let networkCreated = false;
  let imageCreated = false;
  const created: string[] = [];
  let stopped = false;
  async function stop() {
    if (stopped) return;
    // Inspect every resource before deleting anything; a foreign object blocks cleanup.
    for (const name of created) {
      const container = JSON.parse(await docker("inspect", name))[0];
      if (
        container.Name !== `/${name}` ||
        container.Config?.Labels?.[label] !== owner ||
        (container.Mounts?.length ?? 0) !== 0
      )
        throw new Error("Validator QA container ownership refused");
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
        throw new Error("Validator QA network ownership refused");
    }
    for (const name of [...created].reverse())
      await docker("rm", "--force", name);
    if (networkCreated) await docker("network", "rm", network);
    if (imageCreated) {
      const item = JSON.parse(await docker("image", "inspect", image))[0];
      if (item.Config?.Labels?.[label] !== owner)
        throw new Error("Validator QA image ownership refused");
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
    await mkdir(join(context, "src/modules/documents/application"), {
      recursive: true,
    });
    await cp(
      join(root, "scripts/documents-validator"),
      join(context, "scripts/documents-validator"),
      { recursive: true },
    );
    await cp(
      join(root, "src/modules/documents/application/validate-content.ts"),
      join(context, "src/modules/documents/application/validate-content.ts"),
      { recursive: true },
    );
    await cp(
      join(root, "src/modules/documents/application/validate-image.ts"),
      join(context, "src/modules/documents/application/validate-image.ts"),
    );
    await cp(
      join(root, "src/modules/documents/application/validate-docx-package.ts"),
      join(
        context,
        "src/modules/documents/application/validate-docx-package.ts",
      ),
    );
    await cp(
      join(root, "scripts/documents-validator-qa/proxy.mjs"),
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
      `FROM ${baseImage}\nWORKDIR /app\nCOPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./\nRUN npm install -g pnpm@12.16.1 && pnpm install --prod --frozen-lockfile\nCOPY scripts/documents-validator ./scripts/documents-validator\nCOPY src/modules/documents/application/validate-content.ts src/modules/documents/application/validate-image.ts src/modules/documents/application/validate-docx-package.ts ./src/modules/documents/application/\nCOPY --chmod=0444 proxy.mjs proxy.crt proxy.key ./\nLABEL ${label}=${owner}\n`,
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
    const envFile = join(context, "validator.env");
    await writeFile(
      envFile,
      [
        `NEXT_PUBLIC_SUPABASE_URL=https://proxy:8081`,
        `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${options.anonKey}`,
        `DOCUMENTS_VALIDATOR_JWT=${options.validatorJwt}`,
        `DOCUMENTS_VALIDATOR_SERVICE_SECRET=${options.serviceSecret}`,
        "DOCUMENTS_VALIDATOR_PORT=8080",
        "DOCUMENTS_VALIDATOR_HOST=0.0.0.0",
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
      "768m",
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
      validator,
      ...hardening,
      "--network",
      network,
      "--network-alias",
      "validator",
      "--env-file",
      envFile,
      image,
      "node",
      "scripts/documents-validator/entrypoint.ts",
    );
    created.push(validator);
    await rm(envFile);
    await docker(
      "create",
      "--name",
      proxy,
      ...hardening,
      "--network",
      targetNetwork,
      "--publish",
      `127.0.0.1:${port}:8080`,
      "--env",
      `QA_KONG_HOST=supabase_kong_${project}`,
      image,
      "node",
      "proxy.mjs",
    );
    created.push(proxy);
    await docker("network", "connect", "--alias", "proxy", network, proxy);
    await docker("start", validator, proxy);
    const containers = JSON.parse(await docker("inspect", validator, proxy));
    const runtime = containers.find(
      (item: { Name: string }) => item.Name === `/${validator}`,
    );
    const bridge = containers.find(
      (item: { Name: string }) => item.Name === `/${proxy}`,
    );
    const expectedEnv = new Set([
      "PATH",
      "NODE_VERSION",
      "YARN_VERSION",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "DOCUMENTS_VALIDATOR_JWT",
      "DOCUMENTS_VALIDATOR_SERVICE_SECRET",
      "DOCUMENTS_VALIDATOR_PORT",
      "DOCUMENTS_VALIDATOR_HOST",
      "NODE_EXTRA_CA_CERTS",
    ]);
    if (
      !runtime?.State?.Running ||
      runtime.Config?.User !== "10001:10001" ||
      !runtime.HostConfig?.ReadonlyRootfs ||
      runtime.HostConfig?.Privileged ||
      (runtime.Mounts?.length ?? 0) !== 0 ||
      Object.keys(runtime.NetworkSettings?.Networks ?? {}).join() !== network ||
      runtime.Config?.Labels?.[label] !== owner ||
      !runtime.HostConfig?.CapDrop?.includes("ALL") ||
      !runtime.HostConfig?.SecurityOpt?.includes("no-new-privileges") ||
      runtime.HostConfig?.Memory !== 768 * 1024 * 1024 ||
      runtime.HostConfig?.PidsLimit !== 64 ||
      runtime.HostConfig?.NanoCpus !== 1_000_000_000 ||
      runtime.Config?.Env?.some(
        (entry: string) => !expectedEnv.has(entry.split("=", 1)[0]),
      ) ||
      !bridge?.State?.Running ||
      bridge.Config?.Labels?.[label] !== owner ||
      bridge.Config?.User !== "10001:10001" ||
      !bridge.HostConfig?.ReadonlyRootfs ||
      (bridge.Mounts?.length ?? 0) !== 0 ||
      Object.keys(bridge.NetworkSettings?.Networks ?? {})
        .sort()
        .join() !== [network, targetNetwork].sort().join() ||
      JSON.stringify(bridge.HostConfig?.PortBindings?.["8080/tcp"]) !==
        JSON.stringify([{ HostIp: "127.0.0.1", HostPort: String(port) }])
    )
      throw new Error("Validator QA isolation inspection refused");
    let ready = false;
    for (let attempt = 0; attempt < 30 && !ready; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
          headers: { Authorization: `Bearer ${options.serviceSecret}` },
          signal: AbortSignal.timeout(1000),
        });
        ready = response.ok;
      } catch {
        /* Wait for both owned processes. */
      }
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Validator QA readiness failed");
    const isolationProbe = `import {existsSync} from 'node:fs';
      if(existsSync('/var/run/docker.sock') || ['DOCUMENTS_CLEANUP_JWT','DOCUMENTS_UPLOADER_JWT','DOCUMENTS_DELETE_AUTHORIZER_JWT','DOCUMENTS_PERMIT_SECRET'].some(k=>process.env[k]))process.exit(2);
      const denied=await fetch('https://proxy:8081/rest/v1/rpc/forbidden',{method:'POST',signal:AbortSignal.timeout(3000)});if(denied.status!==403)process.exit(3);
      try{await fetch('http://supabase_kong_${project}:8000',{signal:AbortSignal.timeout(3000)});process.exit(4)}catch{}`;
    await docker(
      "exec",
      validator,
      "node",
      "--input-type=module",
      "-e",
      isolationProbe,
    );
    return {
      url: `http://127.0.0.1:${port}`,
      internalUrl: `http://${proxy}:8080`,
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  } finally {
    await rm(context, { recursive: true, force: true });
  }
}
