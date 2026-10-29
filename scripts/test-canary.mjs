import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { root, run, snapshot } from "./test-fixture.mjs";

const fixture = snapshot();
const canary = `synthetic-f1-${randomBytes(24).toString("hex")}`;
let server;
let browser;
let logs = "";

function assertRedacted(content, label) {
  assert.ok(!content.includes(canary), `${label}: synthetic secret leaked`);
}

function scan(directory, label = "browser asset") {
  let files = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) files += scan(filename, label);
    else {
      assertRedacted(readFileSync(filename).toString(), label);
      files += 1;
    }
  }
  return files;
}

async function unusedPort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

try {
  // Instrument only the disposable copy: the private value must traverse the
  // actual server-only adapter during rendering, without becoming a UI prop.
  appendFileSync(
    join(fixture.directory, "src/shared/server/env.ts"),
    "\nexport function readCanaryProbe() { return process.env.FOUNDATION_TEST_SECRET; }\n",
  );
  const layout = join(fixture.directory, "src/app/layout.tsx");
  writeFileSync(
    layout,
    'import { readCanaryProbe } from "@/shared/server/env";\nif (!readCanaryProbe()) throw new Error("Synthetic fixture missing");\n' +
      readFileSync(layout, "utf8"),
  );
  const port = await unusedPort();
  const baseURL = `http://127.0.0.1:${port}`;
  const env = {
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    APP_ENV: "production",
    APP_ORIGIN: baseURL,
    FOUNDATION_TEST_SECRET: canary,
  };
  const build = run(fixture.directory, "next/dist/bin/next", ["build"], env);
  assertRedacted(build.output, "build logs");
  assert.equal(
    build.status,
    0,
    `instrumented production build must succeed:\n${build.output}`,
  );

  const assets = join(fixture.directory, ".next/static");
  assert.ok(scan(assets) > 0, "scan must inspect real browser assets");
  const generated = join(fixture.directory, ".next/server/app");
  assert.ok(
    scan(generated, "generated app output") > 0,
    "scan must inspect generated app outputs",
  );
  for (const output of [
    "index.html",
    "index.rsc",
    "index.segments/_full.segment.rsc",
  ]) {
    assertRedacted(
      readFileSync(join(generated, output), "utf8"),
      "generated HTML/RSC/segment",
    );
  }
  const sentinel = join(assets, "synthetic-leak-control.txt");
  writeFileSync(sentinel, canary);
  assert.throws(
    () => scan(assets),
    /synthetic secret leaked/,
    "scanner must detect a leak",
  );
  rmSync(sentinel);
  console.log(
    "PASS FQA-06 browser assets, generated HTML/RSC/segments and scanner positive control.",
  );

  server = spawn(
    process.execPath,
    [
      join(root, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: fixture.directory,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (data) => {
    logs += data.toString();
  });
  server.stderr.on("data", (data) => {
    logs += data.toString();
  });
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error("Production server exited before readiness");
    try {
      const response = await fetch(`${baseURL}/health/ready`);
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {
      /* The process has not started listening yet. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "production server must become ready");
  for (const path of ["/", "/health/ready"]) {
    const response = await fetch(`${baseURL}${path}`, { redirect: "manual" });
    assert.equal(response.status, 200);
    assertRedacted(await response.text(), "HTTP response");
  }
  const missing = await fetch(`${baseURL}/foundation-does-not-exist`, {
    redirect: "manual",
  });
  assert.equal(missing.status, 404, "nonexistent route must return 404");
  assertRedacted(await missing.text(), "404 response");
  const rsc = await fetch(`${baseURL}/?_rsc=foundation-canary`, {
    headers: { RSC: "1" },
  });
  assert.equal(rsc.status, 200);
  assert.ok(
    rsc.headers.get("content-type")?.includes("text/x-component"),
    "inspect an actual RSC payload",
  );
  assertRedacted(await rsc.text(), "RSC response");

  browser = await chromium.launch();
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("console", (message) => {
    logs += message.text();
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
    logs += error.message;
  });
  await page.goto(baseURL);
  assertRedacted(await page.content(), "browser DOM");
  assert.equal(
    browserErrors.length,
    0,
    "browser must not report client errors",
  );
  assertRedacted(logs, "runtime and browser logs");
  console.log(
    "PASS FQA-06 production HTML, RSC, DOM and captured process/browser logs.",
  );

  const invalid = run(fixture.directory, "next/dist/bin/next", ["build"], {
    ...env,
    APP_ENV: canary,
  });
  assert.notEqual(
    invalid.status,
    0,
    "bad environment must reject a production build",
  );
  assert.ok(
    invalid.output.includes("APP_ENV"),
    "bad configuration error must identify its field",
  );
  assertRedacted(invalid.output, "configuration error");
  console.log(
    "PASS FQA-05/06 invalid env build rejects without disclosing its value.",
  );
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const closed = new Promise((resolve) => server.once("close", resolve));
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 5_000);
    await closed;
    clearTimeout(timer);
  }
  fixture.cleanup();
}
