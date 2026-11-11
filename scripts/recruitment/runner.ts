import type { OutputSummary } from "../auth/output-safety.ts";
/** Test the actual product app against its own guarded disposable local stack. */
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer as createHttpsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { createServer as createPortProbe } from "node:net";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
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
import { verifyDocumentsUpgrade } from "./documents-upgrade.ts";
import { startValidatorQa } from "../documents-validator-qa/runtime.ts";
import { startCleanupQa } from "../documents-validator-qa/cleanup-runtime.ts";
import { startBffQa } from "../documents-validator-qa/bff-runtime.ts";
import { assertBffEnvironment, baseProcessEnvironment } from "./process-env.ts";
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
for (const port of [3172, 3173])
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
if (!target.storage || target.appOrigin !== "https://127.0.0.1:3173")
  throw new Error("Recruitment Storage runner requires its isolated profile");
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
const proxies: ReturnType<typeof createHttpsServer>[] = [];
let validatorRuntime: Awaited<ReturnType<typeof startValidatorQa>> | undefined;
let cleanupRuntime: Awaited<ReturnType<typeof startCleanupQa>> | undefined;
let bffRuntime: Awaited<ReturnType<typeof startBffQa>> | undefined;
let succeeded = false;
const serverCanary = `synthetic-recruitment-server-${randomUUID()}`;
// Local fixture credentials use the owned Storage container's signing key;
// no production key or service-role credential is supplied to the app.
const inspected = JSON.parse(
  (await exec("docker", ["inspect", `supabase_storage_${target.projectId}`]))
    .stdout,
);
const signingSecretValue = (inspected[0]?.Config?.Env as string[] | undefined)
  ?.find((value) => value.startsWith("AUTH_JWT_SECRET="))
  ?.slice("AUTH_JWT_SECRET=".length);
if (!signingSecretValue)
  throw new Error("Local Storage signing secret unavailable");
const signingSecret: string = signingSecretValue;
function operatorJwt(role: string) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      role,
      iss: "supabase",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 7200,
    }),
  ).toString("base64url");
  const value = `${header}.${payload}`;
  return `${value}.${createHmac("sha256", signingSecret).update(value).digest("base64url")}`;
}
const uploaderJwt = operatorJwt("documents_uploader");
const validatorJwt = operatorJwt("documents_validator");
const cleanupJwt = operatorJwt("documents_cleanup");
const deleteAuthorizerJwt = operatorJwt("documents_delete_authorizer");
const permitSecret = randomBytes(48).toString("hex");
const validatorServiceSecret = randomBytes(48).toString("hex");
const privateValues = [
  target.serviceRoleKey,
  serverCanary,
  signingSecret,
  uploaderJwt,
  validatorJwt,
  cleanupJwt,
  deleteAuthorizerJwt,
  permitSecret,
  validatorServiceSecret,
];
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
  const migrations = reuse
    ? await migrateRecruitmentTarget(id)
    : await verifyDocumentsUpgrade(id);
  evidence.migrations = migrations;
  if (!reuse) evidence.stages.push("documents-upgrade-from-0022");
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
    ...baseProcessEnvironment(process.env),
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
    DOCUMENTS_PERMIT_SECRET: permitSecret,
    DOCUMENTS_UPLOADER_JWT: uploaderJwt,
    DOCUMENTS_DELETE_AUTHORIZER_JWT: deleteAuthorizerJwt,
    DOCUMENTS_VALIDATOR_URL: "http://127.0.0.1:3174",
    DOCUMENTS_VALIDATOR_SERVICE_SECRET: validatorServiceSecret,
  };
  assertBffEnvironment(env);
  const integrationEnv = {
    ...env,
    DOCUMENTS_VALIDATOR_TEST_URL: env.DOCUMENTS_VALIDATOR_URL,
    DOCUMENTS_VALIDATOR_TEST_SECRET: validatorServiceSecret,
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
  validatorRuntime = await startValidatorQa(id, {
    validatorJwt,
    serviceSecret: validatorServiceSecret,
    anonKey: target.anonKey,
  });
  const bffKeys = [
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
  ];
  const bffEnv = Object.fromEntries(
    bffKeys.map((key) => [key, String(env[key as keyof typeof env] ?? "")]),
  );
  bffRuntime = await startBffQa(id, {
    env: bffEnv,
    validatorInternalUrl: validatorRuntime.internalUrl,
  });
  evidence.stages.push("isolated-bff-and-validator");
  for (const [upstreamPort, publicPort] of [[3172, 3173]] as const) {
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline) {
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
      "tests/integration/recruitment/storage-runtime.test.ts",
      "tests/integration/recruitment/documents-security.test.ts",
      "tests/integration/recruitment/documents-validator-ipc.test.ts",
      "tests/integration/recruitment/documents-delete.test.ts",
      "tests/integration/recruitment/documents-application.test.ts",
      "tests/integration/recruitment/documents-metadata.test.ts",
      "tests/integration/recruitment/documents-operators.test.ts",
      "tests/integration/recruitment/documents-owner-read.test.ts",
      "tests/integration/recruitment/documents-reservation.test.ts",
      "tests/integration/recruitment/documents-version-history.test.ts",
      "tests/integration/recruitment/documents-content.test.ts",
      "tests/integration/recruitment/recruitment.test.ts",
      "tests/integration/recruitment/lifecycle.test.ts",
      "tests/integration/recruitment/stages.test.ts",
      "tests/integration/recruitment/history-corrections.test.ts",
      "tests/integration/recruitment/closure-reopening.test.ts",
      "tests/integration/recruitment/companies-contacts.test.ts",
      "tests/integration/recruitment/global-search.test.ts",
      "tests/integration/recruitment/workspace.test.ts",
      "tests/integration/recruitment/tasks.test.ts",
      "tests/integration/recruitment/calendar.test.ts",
      "tests/integration/recruitment/reminders-follow-up.test.ts",
      "tests/integration/recruitment/optional-email-reminders.test.ts",
      "tests/integration/recruitment/optional-email-context.test.ts",
      "tests/integration/recruitment/optional-email-queue.test.ts",
      "tests/integration/recruitment/quick-capture-atomic-action.test.ts",
    ],
    integrationEnv,
    "business-integration",
  );
  evidence.stages.push("real-business-auth-data-api");
  cleanupRuntime = await startCleanupQa(id, {
    cleanupJwt,
    anonKey: target.anonKey,
  });
  evidence.stages.push("isolated-cleanup");
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
  let runtimeError: unknown;
  for (const runtime of [bffRuntime, cleanupRuntime, validatorRuntime]) {
    try {
      await runtime?.stop();
    } catch (error) {
      runtimeError ??= error;
      succeeded = false;
      evidence.status = "FAIL";
    }
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
  if (runtimeError) throw runtimeError;
}
