import { spawnSync } from "node:child_process";
import { constants, cpSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

export const root = realpathSync(resolve(import.meta.dirname, ".."));

// Disposable copies never contain the checkout's env files or build output.
export function snapshot() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "jobs-crm-f1-")));
  const excluded = new Set([
    ".git",
    "node_modules",
    ".next",
    ".harness-runs",
    "test-results",
    "playwright-report",
  ]);
  cpSync(root, directory, {
    recursive: true,
    filter: (source) =>
      source === root ||
      (!excluded.has(basename(source)) &&
        !basename(source).startsWith(".env") &&
        !basename(source).endsWith(".tsbuildinfo")),
  });
  // Turbopack intentionally refuses dependencies symlinked outside its root.
  // Clone files where supported and retain pnpm's internal relative symlinks.
  cpSync(join(root, "node_modules"), join(directory, "node_modules"), {
    recursive: true,
    verbatimSymlinks: true,
    mode: constants.COPYFILE_FICLONE,
  });
  return {
    directory,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

export function run(directory, executable, args, env = {}) {
  const result = spawnSync(
    process.execPath,
    [join(directory, "node_modules", executable), ...args],
    {
      cwd: directory,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env },
      encoding: "utf8",
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

export function expectFailure(result, diagnostic, label) {
  if (result.status === 0 || !diagnostic.test(result.output)) {
    throw new Error(
      `${label}: expected failure diagnostic was absent (exit ${result.status}).\n${result.output}`,
    );
  }
  console.log(`PASS ${label}: rejected with expected diagnostic.`);
}
