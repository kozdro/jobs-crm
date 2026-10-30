/** One-command local DEV. Ctrl+C stops Next only; explicit stop preserves DB volumes. */
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createServer, createConnection } from "node:net";
import { request } from "node:https";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, chmod, lstat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { localAppEnvironment } from "./environment.ts";
import { writePrivateFile } from "./private-files.ts";
import { privateControlDirectory, assertControlSocket } from "./control.ts";
import { redactDevLog } from "./logs.ts";
import { X509Certificate } from "node:crypto";
import { sha256 } from "../recruitment/validation.ts";
import { ports } from "./validation.ts";
import { migrateLocalDev } from "./migrations.ts";
import {
  root,
  stateDirectory,
  command,
  assertFreePort,
  startLocalDevTarget,
  readLocalDevTarget,
  stopLocalDevTarget,
  resetLocalDevTarget,
  saveManifest,
  loadManifest,
  withLifecycleLock,
  preflightStop,
  preflightReset,
} from "./target.ts";
const socketDirectory = join(
  tmpdir(),
  `jobs-crm-dev-${sha256(root).slice(0, 16)}`,
);
const socketPath = join(socketDirectory, "control.sock");
const appLock = join(stateDirectory, "app.lock");
async function stopApplication() {
  const hasDirectory = await privateControlDirectory(socketDirectory);
  if (!hasDirectory || !(await assertControlSocket(socketPath))) {
    if (existsSync(appLock))
      throw new Error(
        "Local DEV app lock exists without control socket. Inspect the prior process; no PID was killed. See local-development.md.",
      );
    return;
  }
  const manifest = await loadManifest();
  await new Promise<void>((ok, no) => {
    const socket = createConnection(socketPath);
    socket.setTimeout(15000);
    socket.once("connect", () => socket.end(`stop ${manifest.projectId}\n`));
    let reply = "";
    socket.on("data", (b) => (reply += b));
    socket.once("error", () =>
      no(
        new Error(
          "Local DEV control socket unavailable; no process was killed",
        ),
      ),
    );
    socket.once("timeout", () => {
      socket.destroy();
      no(new Error("Local DEV application stop timed out"));
    });
    socket.once("close", () =>
      reply === `stopped ${manifest.projectId}\n`
        ? ok()
        : no(new Error("Local DEV application stop not acknowledged")),
    );
  });
}
async function certificate() {
  const dir = join(stateDirectory, "tls"),
    key = join(dir, "key.pem"),
    cert = join(dir, "cert.pem");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  for (const p of [dir, key, cert])
    if (existsSync(p) && (await lstat(p)).isSymbolicLink())
      throw new Error("Local DEV TLS symlink refused");
  let renew = !existsSync(key) || !existsSync(cert);
  if (!renew) {
    const parsed = new X509Certificate(await readFile(cert));
    renew = Date.parse(parsed.validTo) < Date.now() + 86400000;
    if (!parsed.checkIP("127.0.0.1"))
      throw new Error("Local DEV certificate identity mismatch");
  }
  if (renew) {
    await command("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "365",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1,DNS:localhost",
    ]);
    await chmod(key, 0o600);
    await chmod(cert, 0o600);
  }
  return { key, cert };
}
function ready(url: string, ca: Buffer) {
  return new Promise<boolean>((ok) => {
    const req = request(url, { ca, timeout: 5000 }, (r) => {
      r.resume();
      ok(r.statusCode === 200);
    });
    req.once("error", () => ok(false));
    req.once("timeout", () => {
      req.destroy();
      ok(false);
    });
    req.end();
  });
}
async function start() {
  await assertFreePort(ports.app);
  if (
    existsSync(stateDirectory) &&
    (await lstat(stateDirectory)).isSymbolicLink()
  )
    throw new Error("Local DEV state symlink refused");
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  try {
    await mkdir(appLock, { mode: 0o700 });
  } catch {
    throw new Error(
      "Local DEV app already running or prior lock requires inspection; no automatic takeover",
    );
  }
  let child: ChildProcess | undefined;
  let closed: Promise<void> = Promise.resolve();
  let stopping = false;
  let ownsSocket = false;
  let controlProjectId = "";
  const control = createServer({ allowHalfOpen: true }, (socket) => {
    let input = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      input += chunk;
      if (input === `stop ${controlProjectId}\n`)
        void shutdown().then(() => socket.end(`stopped ${controlProjectId}\n`));
      else if (input.length > 100) socket.destroy();
    });
  });
  async function shutdown() {
    if (stopping) return closed;
    stopping = true;
    child?.kill("SIGTERM");
    await closed;
  }
  const signal = () => {
    void shutdown();
  };
  process.once("SIGINT", signal);
  process.once("SIGTERM", signal);
  try {
    await privateControlDirectory(socketDirectory, true);
    if (await assertControlSocket(socketPath))
      throw new Error(
        "Local DEV control socket already exists; inspect prior process before removing stale state",
      );
    const target = await withLifecycleLock(async () => {
      const t = await startLocalDevTarget();
      const migrations = await migrateLocalDev(t, async (state) => {
        const m = await loadManifest();
        Object.assign(m, state);
        await saveManifest(m);
      });
      return { ...t, migrations };
    });
    if (stopping) return;
    controlProjectId = target.projectId;
    const tls = await certificate();
    // Explicit derived values take precedence over Next's dotenv loading; .env.local is untouched.
    const env = localAppEnvironment(target);
    // Keep diagnostic writes entirely outside the watched repository.
    // The control directory is already verified as private, owned and mode0700.
    const logFile = join(socketDirectory, "next.log");
    await writePrivateFile(logFile, "");
    child = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(ports.app),
        "--experimental-https",
        "--experimental-https-key",
        tls.key,
        "--experimental-https-cert",
        tls.cert,
      ],
      { cwd: root, env, stdio: ["inherit", "pipe", "pipe"] },
    );
    closed = new Promise<void>((ok, no) => {
      child!.once("error", () =>
        no(new Error("Local DEV Next failed to start")),
      );
      child!.once("close", () => ok());
    });
    // Redact complete diagnostic lines before writing private local logs.
    let logWrites = Promise.resolve();
    let logFailure = false;
    for (const stream of [child.stdout, child.stderr]) {
      let pending = "";
      stream?.on("data", (chunk) => {
        pending += chunk.toString();
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        if (pending.length > 65536) {
          lines.push("[oversized development log line withheld]");
          pending = "";
        }
        if (lines.length)
          logWrites = logWrites
            .then(async () => {
              await writePrivateFile(
                logFile,
                lines.map(redactDevLog).join("\n") + "\n",
                true,
              );
            })
            .catch(() => {
              logFailure = true;
              void shutdown();
            });
      });
      // Do not persist incomplete trailing fragments, which can split sensitive values.
    }
    await new Promise<void>((ok, no) => {
      control.once("error", no);
      control.listen(socketPath, ok);
    });
    ownsSocket = true;
    await chmod(socketPath, 0o600);
    const deadline = Date.now() + 90000;
    let healthy = false;
    const ca = await readFile(tls.cert);
    while (Date.now() < deadline && !stopping && child.exitCode === null) {
      if (await ready(`${target.appOrigin}/health/ready`, ca)) {
        healthy = true;
        break;
      }
      await new Promise((ok) => setTimeout(ok, 300));
    }
    if (stopping) return;
    if (!healthy)
      throw new Error(
        `Local DEV app readiness failed; inspect private ${logFile}. Database retained.`,
      );
    // Studio root intentionally redirects; probe its concrete local project page.
    for (const url of [`${target.studioUrl}/project/default`, target.mailUrl])
      if (
        (
          await fetch(url, {
            signal: AbortSignal.timeout(10000),
            redirect: "manual",
          })
        ).status !== 200
      )
        throw new Error("Local DEV Studio/mail HTTP readiness failed");
    console.log(
      `Jobs CRM Local DEV ready\n\nApp:       ${target.appOrigin}\nStudio:    ${target.studioUrl}\nMail:      ${target.mailUrl}\nSupabase:  ${target.apiUrl}\n\nDatabase: persistent\nMigrations: up to date (${target.migrations.total})\nAuthentication: enabled\n\nCtrl+C stops the app; database services remain running.\nUse pnpm dev:local:stop to stop all DEV services while preserving data.\nNext/Fast Refresh logs: ${logFile} (private local file).`,
    );
    await closed;
    await logWrites;
    if (logFailure)
      throw new Error(
        "Local DEV diagnostic log write refused; application stopped, data preserved.",
      );
  } finally {
    await shutdown();
    if (control.listening)
      await new Promise<void>((ok) => control.close(() => ok()));
    if (ownsSocket) await rm(socketPath, { force: true });
    await rm(appLock, { recursive: true, force: true });
    process.removeListener("SIGINT", signal);
    process.removeListener("SIGTERM", signal);
  }
}
async function main() {
  if (process.version !== "v24.22.2")
    throw new Error(
      `Local DEV requires Node24.22.2; this process uses ${process.version}. Verify pnpm exec node -v; see local-development.md.`,
    );
  if (
    process.env.npm_config_user_agent &&
    !/^pnpm\/12\.16\.1(?:\s|$)/.test(process.env.npm_config_user_agent)
  )
    throw new Error(
      "Local DEV requires pnpm12.16.1; verify pnpm -v and pnpm exec node -v.",
    );
  const [action = "start", ...args] = process.argv.slice(2);
  if (action === "start" && !args.length) return start();
  if (action === "stop" && !args.length) {
    await withLifecycleLock(async () => {
      await preflightStop();
      await stopApplication();
      await stopLocalDevTarget();
    });
    console.log("Local DEV stopped; PostgreSQL users and cases preserved.");
    return;
  }
  if (action === "status" && !args.length) {
    const t = await readLocalDevTarget();
    console.log(
      JSON.stringify(
        {
          projectId: t.projectId,
          app: t.appOrigin,
          studio: t.studioUrl,
          mail: t.mailUrl,
          supabase: t.apiUrl,
          persistent: true,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (action === "reset") {
    // Confirmation happens before stopping even the app.
    const m = await loadManifest();
    const confirmation =
      args.length === 2 && args[0] === "--confirm" ? args[1] : undefined;
    const { assertResetConfirmation } = await import("./validation.ts");
    assertResetConfirmation(m, confirmation);
    await withLifecycleLock(async () => {
      await preflightReset(confirmation);
      await stopApplication();
      await resetLocalDevTarget(confirmation);
    });
    console.log(
      "Confirmed Local DEV target removed; evidence archived. Existing manual-dev and CI unchanged.",
    );
    return;
  }
  throw new Error(
    "Usage: pnpm dev:local | dev:local:stop | dev:local:status | dev:local:reset --confirm <projectId>",
  );
}
await main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Local DEV failed; raw details withheld",
  );
  process.exitCode = 1;
});
