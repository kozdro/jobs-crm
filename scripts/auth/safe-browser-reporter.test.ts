import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import type { TestCase, TestResult } from "@playwright/test/reporter";
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
