import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { resolve } from "node:path";
import type { TestCase, TestResult, TestStep } from "@playwright/test/reporter";
import { MOVE_LINK_PHASES } from "./output-safety.ts";
import SafeBrowserReporter from "./safe-browser-reporter.ts";

test("failed browser result reports only allowlisted metadata", () => {
  const messages: string[] = [];
  const original = console.log;
  console.log = (message: string) => messages.push(message);
  try {
    const reporter = new SafeBrowserReporter();
    const testCase = {
      location: { file: "/synthetic/secret@example.test.spec.ts", line: 42 },
      title: "private@example.test",
    } as TestCase;
    reporter.onTestEnd(testCase, {
      status: "failed",
      retry: 0,
      errors: [{ message: "expect(private@example.test) failed" }],
    } as TestResult);
    reporter.onTestEnd(testCase, { status: "passed" } as TestResult);
  } finally {
    console.log = original;
  }
  assert.equal(messages.length, 1);
  assert.ok(!messages[0].includes("private@example.test"));
  const value = JSON.parse(messages[0].slice("F3_BROWSER_FAILURE ".length));
  assert.deepEqual(Object.keys(value).sort(), [
    "category",
    "fileHash",
    "line",
    "retry",
    "status",
  ]);
  assert.equal(value.category, "assertion");
  assert.match(value.fileHash, /^[a-f0-9]{64}$/);
});

test("both browser runner configs enable safe diagnostics locally and in CI", () => {
  for (const ci of [false, true]) {
    const env = { ...process.env };
    if (ci) env.CI = "true";
    else delete env.CI;
    for (const config of ["auth", "recruitment"]) {
      const result = execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import config from './playwright.${config}.config.ts'; process.stdout.write(JSON.stringify(config.reporter));`,
        ],
        { cwd: process.cwd(), env, encoding: "utf8" },
      );
      const reporters = JSON.parse(result) as string[][];
      assert.ok(
        reporters.some(
          ([name]) => name === "./scripts/auth/safe-browser-reporter.ts",
        ),
      );
      assert.equal(
        reporters.some(([name]) => name === "github"),
        ci,
      );
    }
  }
});

test("move-link timeout reports only the last allowlisted static phase", () => {
  const messages: string[] = [];
  const original = console.log;
  console.log = (message: string) => messages.push(message);
  const target = {
    location: {
      file: resolve("tests/e2e/recruitment-global-search.spec.ts"),
      line: 1346,
    },
    title:
      "moving link 26 across a page boundary preserves target, focus and status",
  } as TestCase;
  const makeResult = (
    status: "failed" | "timedOut",
    message: string,
    retry = 0,
  ) => ({ status, retry, errors: [{ message }] }) as TestResult;
  const step = (title: string, category = "test.step") =>
    ({ title, category }) as TestStep;
  try {
    const reporter = new SafeBrowserReporter();
    const initial = makeResult("timedOut", "private@example.test");
    reporter.onTestEnd(target, initial);
    for (const phase of MOVE_LINK_PHASES.filter(
      (x) => x !== "unknown" && x !== "not_entered",
    )) {
      const result = makeResult("timedOut", "private@example.test", 1);
      reporter.onStepBegin(target, result, step(`F3_MOVE_PHASE:${phase}`));
      reporter.onStepBegin(
        target,
        result,
        step("private@example.test", "pw:api"),
      );
      reporter.onTestEnd(target, result);
    }
    const unsafe = makeResult("failed", "timeout private@example.test");
    reporter.onStepBegin(
      target,
      unsafe,
      step("F3_MOVE_PHASE:private@example.test"),
    );
    reporter.onTestEnd(target, unsafe);
    const unrelated = makeResult("timedOut", "private@example.test");
    reporter.onStepBegin(
      { ...target, title: "private@example.test" } as TestCase,
      unrelated,
      step("F3_MOVE_PHASE:move_up"),
    );
    reporter.onTestEnd(
      { ...target, title: "private@example.test" } as TestCase,
      unrelated,
    );
    const assertion = makeResult(
      "failed",
      "expect(private@example.test) failed",
    );
    reporter.onStepBegin(target, assertion, step("F3_MOVE_PHASE:move_up"));
    reporter.onTestEnd(target, assertion);
  } finally {
    console.log = original;
  }
  assert.ok(
    messages.every((message) => !message.includes("private@example.test")),
  );
  const parsed = messages.map((message) =>
    JSON.parse(message.slice("F3_BROWSER_FAILURE ".length)),
  );
  assert.equal(parsed[0].phase, "not_entered");
  assert.deepEqual(
    parsed.slice(1, -3).map((value) => value.phase),
    MOVE_LINK_PHASES.filter((x) => x !== "unknown" && x !== "not_entered"),
  );
  assert.equal(parsed.at(-3).phase, "unknown");
  assert.equal("phase" in parsed.at(-2), false);
  assert.equal("phase" in parsed.at(-1), false);
  assert.equal(parsed[1].retry, 1);
});

test("real Playwright step timeout reaches the allowlisted reporter phase", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "jobs-crm-safe-phase-"));
  try {
    mkdirSync(resolve(dir, "tests/e2e"), { recursive: true });
    const testModule = resolve("node_modules/@playwright/test");
    // The reporter scopes its allowlist to the real, fixed filename.
    const fixture = resolve(dir, "tests/e2e/recruitment-global-search.spec.ts");
    writeFileSync(
      fixture,
      `const { test } = require(${JSON.stringify(testModule)});
test('moving link 26 across a page boundary preserves target, focus and status', async () => { test.setTimeout(500); await test.step('F3_MOVE_PHASE:next_page', () => new Promise(() => {})); });
`,
    );
    writeFileSync(
      resolve(dir, "playwright.config.cjs"),
      `module.exports = { testDir: './tests/e2e', testMatch: '**/*.spec.ts', workers: 1, reporter: [[${JSON.stringify(resolve("scripts/auth/safe-browser-reporter.ts"))}]] };
`,
    );
    const result = spawnSync(
      process.execPath,
      [
        resolve("node_modules/@playwright/test/cli.js"),
        "test",
        "--config",
        resolve(dir, "playwright.config.cjs"),
      ],
      { cwd: dir, encoding: "utf8", timeout: 30000 },
    );
    assert.equal(result.status, 1);
    const line = result.stdout
      .split("\n")
      .find((value) => value.startsWith("F3_BROWSER_FAILURE "));
    assert.ok(line, "real reporter observation must be present");
    const value = JSON.parse(line.slice("F3_BROWSER_FAILURE ".length));
    assert.equal(value.category, "timeout");
    assert.equal(value.phase, "next_page");
    assert.equal("error" in value, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
