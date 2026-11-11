/** Run the actual built BFF in an owned container without host socket or mounts. */
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
const label = "jobs-crm.documents-bff-qa";
const base =
  "node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9";
const allowed = new Set([
  "APP_ENV",
  "APP_ORIGIN",
  "NEXT_PUBLIC_APP_ORIGIN",
  "NEXT_PUBLIC_AUTH_ENABLED",
  "NEXT_PUBLIC_AUTH_LOCAL_TEST",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_GOOGLE_AUTH_ENABLED",
  "NEXT_TELEMETRY_DISABLED",
  "RECRUITMENT_TARGET_ID",
  "RECRUITMENT_TEST_SECRET",
  "DOCUMENTS_PERMIT_SECRET",
  "DOCUMENTS_UPLOADER_JWT",
  "DOCUMENTS_DELETE_AUTHORIZER_JWT",
  "DOCUMENTS_VALIDATOR_SERVICE_SECRET",
]);
export async function startBffQa(
  id: string,
  options: { env: Record<string, string>; validatorInternalUrl: string },
) {
  const target = await readRecruitmentTarget(id);
  const project = target.projectId;
  const match = /^http:\/\/(documents-validator-proxy-[a-f0-9]{12}):8080$/.exec(
    options.validatorInternalUrl,
  );
  if (
    !target.storage ||
    !match ||
    Object.keys(options.env).some((k) => !allowed.has(k)) ||
    Object.values(options.env).some((v) => /[\r\n]/.test(v))
  )
    throw new Error("BFF QA configuration refused");
  const validator = JSON.parse(await docker("inspect", match[1]))[0];
  if (
    !validator.Config?.Labels?.["jobs-crm.documents-validator-qa"]?.startsWith(
      `${project}-`,
    ) ||
    !validator.NetworkSettings?.Networks?.[`network-${project}`]
  )
    throw new Error("BFF validator ownership refused");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12),
    owner = `${project}-${suffix}`;
  const network = `documents-bff-${suffix}`,
    bff = `documents-bff-${suffix}`,
    proxy = `documents-bff-proxy-${suffix}`,
    image = `jobs-documents-bff-qa:${suffix}`,
    targetNetwork = `network-${project}`;
  const context = await mkdtemp(join(tmpdir(), "jobs-documents-bff-"));
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
        throw new Error("BFF QA container ownership refused");
    }
    if (networkCreated) {
      const item = JSON.parse(await docker("network", "inspect", network))[0];
      if (
        item.Name !== network ||
        item.Labels?.[label] !== owner ||
        Object.values(item.Containers ?? {}).some(
          (v) => !created.includes((v as { Name: string }).Name),
        )
      )
        throw new Error("BFF QA network ownership refused");
    }
    for (const name of [...created].reverse())
      await docker("rm", "--force", name);
    if (networkCreated) await docker("network", "rm", network);
    if (imageCreated) {
      const item = JSON.parse(await docker("image", "inspect", image))[0];
      if (item.Config?.Labels?.[label] !== owner)
        throw new Error("BFF QA image ownership refused");
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
    await cp(join(root, ".next"), join(context, ".next"), { recursive: true });
    await cp(
      join(root, "scripts/documents-validator-qa/bff-proxy.mjs"),
      join(context, "proxy.mjs"),
    );
    await cp(
      join(root, "scripts/documents-validator-qa/bff-bootstrap.mjs"),
      join(context, "bootstrap.mjs"),
    );
    await writeFile(
      join(context, "Dockerfile"),
      `FROM ${base}\nWORKDIR /app\nCOPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./\nRUN npm install -g pnpm@12.16.1 && pnpm install --prod --frozen-lockfile\nCOPY .next ./.next\nCOPY proxy.mjs bootstrap.mjs ./\nLABEL ${label}=${owner}\n`,
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
    const envFile = join(context, "bff.env");
    await writeFile(
      envFile,
      Object.entries({
        ...options.env,
        DOCUMENTS_VALIDATOR_URL: "http://127.0.0.1:3174",
      })
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
    const hard = [
      "--user",
      "10001:10001",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "128",
      "--memory",
      "1536m",
      "--cpus",
      "2",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--label",
      `${label}=${owner}`,
    ];
    await docker(
      "create",
      "--name",
      bff,
      ...hard,
      "--network",
      network,
      "--network-alias",
      "bff",
      "--env-file",
      envFile,
      image,
      "node",
      "bootstrap.mjs",
    );
    created.push(bff);
    await rm(envFile);
    await docker(
      "create",
      "--name",
      proxy,
      ...hard,
      "--network",
      targetNetwork,
      "--publish",
      "127.0.0.1:3172:8080",
      "--env",
      `QA_KONG_HOST=supabase_kong_${project}`,
      "--env",
      `QA_VALIDATOR_HOST=${match[1]}`,
      image,
      "node",
      "proxy.mjs",
    );
    created.push(proxy);
    await docker("network", "connect", "--alias", "proxy", network, proxy);
    await docker("start", bff, proxy);
    const items = JSON.parse(await docker("inspect", bff, proxy));
    const app = items.find(
      (entry: { Name: string }) => entry.Name === `/${bff}`,
    );
    if (
      !app?.State?.Running ||
      app.Config?.User !== "10001:10001" ||
      !app.HostConfig?.ReadonlyRootfs ||
      app.HostConfig?.Privileged ||
      (app.Mounts?.length ?? 0) !== 0 ||
      Object.keys(app.NetworkSettings?.Networks ?? {}).join() !== network ||
      app.Config?.Labels?.[label] !== owner ||
      !app.HostConfig?.CapDrop?.includes("ALL")
    )
      throw new Error("BFF QA isolation inspection refused");
    const isolationProbe = `import {existsSync} from 'node:fs';
      if(existsSync('/var/run/docker.sock') || ['DOCUMENTS_VALIDATOR_JWT','DOCUMENTS_CLEANUP_JWT'].some(k=>process.env[k]))process.exit(2);
      try{await fetch('http://supabase_kong_${project}:8000',{signal:AbortSignal.timeout(3000)});process.exit(3)}catch{}`;
    await docker(
      "exec",
      bff,
      "node",
      "--input-type=module",
      "-e",
      isolationProbe,
    );
    return { stop };
  } catch (error) {
    await stop();
    throw error;
  } finally {
    await rm(context, { recursive: true, force: true });
  }
}
