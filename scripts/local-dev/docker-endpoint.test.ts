import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const program =
  "import {localEngine,inventoryFor} from './scripts/local-dev/target.ts'; await localEngine(); await inventoryFor({projectId:'synthetic',networkId:'synthetic'});";
test("ambiguous Docker environment refuses before invoking any Docker command", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jobs-dev-endpoint-"));
  try {
    await assert.rejects(
      run(process.execPath, ["--input-type=module", "-e", program], {
        cwd: new URL("../../", import.meta.url),
        env: {
          ...process.env,
          PATH: dir,
          DOCKER_HOST: "unix:///synthetic.sock",
          DOCKER_CONTEXT: "remote",
        },
      }),
      (e) => {
        assert.match(
          (e as { stderr: string }).stderr,
          /simultaneous DOCKER_HOST and DOCKER_CONTEXT/,
        );
        return true;
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("remote context is refused after local metadata lookup and before daemon info", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jobs-dev-endpoint-")),
    log = join(dir, "calls");
  try {
    await writeFile(
      join(dir, "docker"),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nprintf '%s' '[{"Endpoints":{"docker":{"Host":"tcp://remote.invalid:2375"}}}]'\n`,
      { mode: 0o700 },
    );
    await assert.rejects(
      run(process.execPath, ["--input-type=module", "-e", program], {
        cwd: new URL("../../", import.meta.url),
        env: {
          ...process.env,
          PATH: dir,
          DOCKER_HOST: "",
          DOCKER_CONTEXT: "remote",
        },
      }),
      (e) => {
        assert.match((e as { stderr: string }).stderr, /remote Docker refused/);
        return true;
      },
    );
    assert.equal(
      (await readFile(log, "utf8")).trim(),
      "context inspect remote",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("all daemon inspection commands use the verified Unix host with context cleared", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jobs-dev-endpoint-")),
    log = join(dir, "calls");
  try {
    await writeFile(
      join(dir, "docker"),
      `#!/bin/sh\nprintf '%s|%s|%s\\n' "$DOCKER_HOST" "$DOCKER_CONTEXT" "$*" >> '${log}'\nif [ "$1" = context ]; then printf '%s' '[{"Endpoints":{"docker":{"Host":"unix:///synthetic.sock"}}}]'; fi\nif [ "$1" = info ]; then printf '%s' '{"OSType":"linux"}'; fi\n`,
      { mode: 0o700 },
    );
    await run(process.execPath, ["--input-type=module", "-e", program], {
      cwd: new URL("../../", import.meta.url),
      env: {
        ...process.env,
        PATH: dir,
        DOCKER_HOST: "",
        DOCKER_CONTEXT: "local",
      },
    });
    const calls = (await readFile(log, "utf8")).trim().split("\n");
    assert.ok(
      calls.some((c) =>
        c.endsWith("|ps -a --no-trunc --format {{.ID}} {{.Names}}"),
      ),
    );
    for (const line of calls.filter((c) => !c.includes("context inspect")))
      assert.ok(line.startsWith("unix:///synthetic.sock||"), line);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
