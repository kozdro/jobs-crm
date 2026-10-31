import type { OutputSummary } from "../auth/output-safety.ts";
/** Test the actual product app against its own guarded disposable local stack. */
import { spawn, execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createServer as createHttpsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { createServer as createPortProbe } from "node:net";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  captureAuthOutput,
  assertPrivateValuesAbsent,
} from "../auth/output-safety.ts";
import {
  startRecruitmentTarget,
  readRecruitmentTarget,
  migrateRecruitmentTarget,
  stopRecruitmentTarget,
  recruitmentTargetEvidence,
} from "./target.ts";
function requireSuccessfulTests(summary: OutputSummary) {
  if (
    !(summary.counts.passed && summary.counts.passed > 0) ||
    (summary.counts.failed ?? 0) !== 0 ||
    (summary.counts.skipped ?? 0) !== 0 ||
    (summary.counts.cancelled ?? 0) !== 0
  )
    throw new Error("Recruitment required successful test counts missing");
}
const root = resolve(import.meta.dirname, "../..");
const exec = promisify(execFile);
const node = process.execPath;
if (process.version !== "v24.22.2")
  throw new Error("Pinned Node 24.22.2 required");
// Refuse an existing application before creating the disposable database target.
for (const port of [3152, 3153])
  await new Promise<void>((ok, no) => {
    const probe = createPortProbe();
    probe.once("error", () =>
      no(new Error(`Recruitment application port occupied: ${port}`)),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(() => ok()));
  });
const id =
  process.env.RECRUITMENT_TARGET_ID ?? `run-${randomUUID().slice(0, 8)}`;
const reuse = Boolean(process.env.RECRUITMENT_TARGET_ID);
const target = reuse
  ? await readRecruitmentTarget(id)
  : await startRecruitmentTarget(id);
const directory = join(root, ".recruitment-local", id);
const evidence = {
  id,
  projectId: target.projectId,
  startedAt: new Date().toISOString(),
  node: process.version,
  status: "FAIL",
  migrations: null as null | {
    applied: number;
    total: number;
    checkpoint: string;
  },
  stages: [] as string[],
  outputChecks: [] as (OutputSummary & { stage: string })[],
  scannedBrowserFiles: 0,
  scannedGeneratedResponseFiles: 0,
};
const children: ChildProcess[] = [];
const childClosed: Promise<void>[] = [];
const proxies: ReturnType<typeof createHttpsServer>[] = [];
let succeeded = false;
const serverCanary = `synthetic-recruitment-server-${randomUUID()}`;
const privateValues = [target.serviceRoleKey, serverCanary];
const serverOutputs: ReturnType<typeof captureAuthOutput>[] = [];
function captured() {
  return captureAuthOutput({ publicKey: target.anonKey, privateValues });
}
async function run(args: string[], env: NodeJS.ProcessEnv, stage: string) {
  const output = captured();
  let code: number | null = null;
  await new Promise<void>((ok, no) => {
    const p = spawn(node, args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    p.stdout?.on("data", (chunk) => output.push(chunk));
    p.stderr?.on("data", (chunk) => output.push(chunk));
    p.once("error", () =>
      no(new Error("Recruitment test process failed to start")),
    );
    p.once("close", (exit) => {
      code = exit;
      ok();
    });
  });
  const summary = output.verify();
  evidence.outputChecks.push({ stage, ...summary });
  console.log(
    `Recruitment ${stage}: ${JSON.stringify({ exit: code, ...summary })}`,
  );
  if (code !== 0)
    throw new Error(
      `Recruitment stage ${stage} exited ${code} (raw output withheld)`,
    );
  if (["business-integration", "business-HTTPS-browser"].includes(stage))
    requireSuccessfulTests(summary);
}
async function scanBuildAssets(
  directory: string,
  responseFilesOnly = false,
): Promise<number> {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory())
      count += await scanBuildAssets(file, responseFilesOnly);
    else if (!responseFilesOnly || /\.(html|rsc)$/.test(entry.name)) {
      assertPrivateValuesAbsent(
        (await readFile(file)).toString(),
        privateValues,
      );
      count++;
    }
  }
  return count;
}

try {
  const migrations = await migrateRecruitmentTarget(id);
  evidence.migrations = migrations;
  await writeFile(
    join(root, ".recruitment-local", `runtime-${id}.json`),
    JSON.stringify(await recruitmentTargetEvidence(id), null, 2),
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
    NEXT_PUBLIC_SUPABASE_URL: target.apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: target.anonKey,
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "false",
    RECRUITMENT_TARGET_ID: id,
    NODE_EXTRA_CA_CERTS: certPath,
    NEXT_TELEMETRY_DISABLED: "1",
    RECRUITMENT_TEST_SECRET: serverCanary,
  };
  await run(
    ["node_modules/next/dist/bin/next", "build"],
    env,
    "production-build",
  );
  evidence.scannedBrowserFiles = await scanBuildAssets(
    join(root, ".next/static"),
  );
  if (!evidence.scannedBrowserFiles)
    throw new Error("Recruitment browser artifact scan found no files");
  evidence.scannedGeneratedResponseFiles = await scanBuildAssets(
    join(root, ".next/server/app"),
    true,
  );
  if (!evidence.scannedGeneratedResponseFiles)
    throw new Error("Recruitment generated HTML/RSC scan found no files");
  evidence.stages.push("production-build");
  for (const [upstreamPort, publicPort] of [[3152, 3153]] as const) {
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
      { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    const output = captured();
    child.stdout?.on("data", (chunk) => output.push(chunk));
    child.stderr?.on("data", (chunk) => output.push(chunk));
    serverOutputs.push(output);
    childClosed.push(
      new Promise<void>((ok) => child.once("close", () => ok())),
    );
    children.push(child);
    child.once("error", () => {});
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null)
        throw new Error(
          "Recruitment application process exited before readiness",
        );
      try {
        if ((await fetch(`http://127.0.0.1:${upstreamPort}/health/ready`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((ok) => setTimeout(ok, 100));
    }
    if (!ready) throw new Error("Recruitment app readiness timeout");
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
  await run(
    [
      "--test",
      "--test-concurrency=1",
      "tests/integration/recruitment/recruitment.test.ts",
      "tests/integration/recruitment/lifecycle.test.ts",
      "tests/integration/recruitment/stages.test.ts",
      "tests/integration/recruitment/history-corrections.test.ts",
      "tests/integration/recruitment/closure-reopening.test.ts",
    ],
    env,
    "business-integration",
  );
  evidence.stages.push("real-business-auth-data-api");
  await run(
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config=playwright.recruitment.config.ts",
    ],
    env,
    "business-HTTPS-browser",
  );
  evidence.stages.push("production-HTTPS-browser");
  evidence.status = "PASS";
  succeeded = true;
} finally {
  for (const proxy of proxies) {
    proxy.closeAllConnections();
    await new Promise<void>((ok) => proxy.close(() => ok()));
  }
  for (const child of children) child.kill("SIGTERM");
  await Promise.all(childClosed);
  let outputError: unknown;
  try {
    serverOutputs.forEach((output, index) => {
      const summary = output.verify();
      evidence.outputChecks.push({
        stage: `app-process-${index + 1}`,
        ...summary,
      });
    });
    evidence.stages.push("build-server-logs-and-browser-artifacts-redacted");
  } catch (error) {
    outputError = error;
    succeeded = false;
    evidence.status = "FAIL";
  }
  await writeFile(
    join(root, ".recruitment-local", `evidence-${id}.json`),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
  if (succeeded && !reuse) await stopRecruitmentTarget(id);
  else
    console.log(
      `Recruitment target retained for explicit inspection/cleanup: ${id}`,
    );
  if (outputError) throw outputError;
}
