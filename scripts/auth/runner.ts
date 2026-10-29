/** Build and test the actual app against an owned disposable local Auth stack. */
import { spawn, execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createServer as createHttpsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  startAuthTarget,
  readAuthTarget,
  migrateAuthTarget,
  stopAuthTarget,
  authTargetEvidence,
} from "./f3-target.ts";
const root = resolve(import.meta.dirname, "../..");
const exec = promisify(execFile);
const node = process.execPath;
if (process.version !== "v24.22.2")
  throw new Error("Pinned Node 24.22.2 required");
const id = process.env.F3_TARGET_ID ?? `run-${randomUUID().slice(0, 8)}`;
const reuse = Boolean(process.env.F3_TARGET_ID);
const target = reuse ? await readAuthTarget(id) : await startAuthTarget(id);
const directory = join(root, ".foundation-f3", id);
const evidence = {
  id,
  projectId: target.projectId,
  startedAt: new Date().toISOString(),
  node: process.version,
  status: "FAIL",
  stages: [] as string[],
};
const children: ChildProcess[] = [];
const proxies: ReturnType<typeof createHttpsServer>[] = [];
let succeeded = false;
async function run(args: string[], env: NodeJS.ProcessEnv) {
  await new Promise<void>((ok, no) => {
    const p = spawn(node, args, { cwd: root, env, stdio: "inherit" });
    p.once("error", () => no(new Error("F3 test process failed to start")));
    p.once("exit", (code) =>
      code === 0 ? ok() : no(new Error(`F3 stage exited ${code}`)),
    );
  });
}
try {
  if (!reuse) await migrateAuthTarget(id);
  await writeFile(
    join(root, ".foundation-f3", `runtime-${id}.json`),
    JSON.stringify(await authTargetEvidence(id), null, 2),
    { mode: 0o600 },
  );
  evidence.stages.push("local-target-and-RLS-migrations");
  await mkdir(join(directory, "tls"), { recursive: true, mode: 0o700 });
  const keyPath = join(directory, "tls/key.pem"),
    certPath = join(directory, "tls/cert.pem");
  await exec("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "1",
    "-subj",
    "/CN=127.0.0.1",
    "-addext",
    "subjectAltName=IP:127.0.0.1,DNS:localhost",
  ]);
  const env = {
    ...process.env,
    APP_ENV: "test",
    APP_ORIGIN: target.appOrigin,
    NEXT_PUBLIC_APP_ORIGIN: target.appOrigin,
    NEXT_PUBLIC_AUTH_ENABLED: "true",
    NEXT_PUBLIC_AUTH_LOCAL_TEST: "true",
    NEXT_PUBLIC_AUTH_LOCAL_FIXTURE: "true",
    NEXT_PUBLIC_SUPABASE_URL: target.apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: target.anonKey,
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "false",
    F3_TARGET_ID: id,
    NODE_EXTRA_CA_CERTS: certPath,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  await run(["node_modules/next/dist/bin/next", "build"], env);
  evidence.stages.push("production-build");
  for (const [upstreamPort, publicPort] of [
    [3133, 3143],
    [3134, 3144],
  ] as const) {
    const child = spawn(
      node,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(upstreamPort),
      ],
      { cwd: root, env, stdio: "ignore" },
    );
    children.push(child);
    child.once("error", () => {});
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null)
        throw new Error("F3 application process exited before readiness");
      try {
        if ((await fetch(`http://127.0.0.1:${upstreamPort}/health/ready`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((ok) => setTimeout(ok, 100));
    }
    if (!ready) throw new Error("F3 app readiness timeout");
    const proxy = createHttpsServer(
      { key: await readFile(keyPath), cert: await readFile(certPath) },
      (req, res) => {
        const upstream = httpRequest(
          {
            hostname: "127.0.0.1",
            port: upstreamPort,
            path: req.url,
            method: req.method,
            headers: {
              ...req.headers,
              host: `127.0.0.1:${publicPort}`,
              "x-forwarded-host": `127.0.0.1:${publicPort}`,
              "x-forwarded-proto": "https",
            },
          },
          (response) => {
            res.writeHead(response.statusCode ?? 502, response.headers);
            response.pipe(res);
          },
        );
        upstream.on("error", () => {
          res.writeHead(502);
          res.end();
        });
        req.pipe(upstream);
      },
    );
    await new Promise<void>((ok, no) => {
      proxy.once("error", no);
      proxy.listen(publicPort, "127.0.0.1", ok);
    });
    proxies.push(proxy);
  }
  await run(["--test", "scripts/auth/integration.ts"], env);
  evidence.stages.push("real-auth-sdk-data-api");
  await run(
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config=playwright.auth.config.ts",
    ],
    env,
  );
  evidence.stages.push("production-HTTPS-browser");
  evidence.status = "PASS";
  succeeded = true;
} finally {
  for (const proxy of proxies) {
    proxy.closeAllConnections();
    await new Promise<void>((ok) => proxy.close(() => ok()));
  }
  for (const child of children) {
    child.kill("SIGTERM");
    await new Promise<void>((ok) => {
      if (child.exitCode !== null) ok();
      else child.once("exit", () => ok());
    });
  }
  await writeFile(
    join(root, ".foundation-f3", `evidence-${id}.json`),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
  if (succeeded && !reuse) await stopAuthTarget(id);
  else console.log(`F3 target retained for explicit inspection/cleanup: ${id}`);
}
