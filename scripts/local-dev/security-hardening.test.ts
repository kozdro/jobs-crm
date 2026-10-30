import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  symlink,
  rm,
  chmod,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { localAppEnvironment } from "./environment.ts";
import { writePrivateFile } from "./private-files.ts";
import { privateControlDirectory, assertControlSocket } from "./control.ts";
import { assertDevInventory, type DevManifest } from "./validation.ts";
import type { CleanupInventory } from "../recruitment/cleanup-plan.ts";
test("private Supabase env stays explicitly empty so Next dotenv cannot refill it", () => {
  const env = localAppEnvironment(
    {
      appOrigin: "https://127.0.0.1:3163",
      apiUrl: "http://127.0.0.1:56721",
      anonKey: "public",
    },
    {
      SUPABASE_SERVICE_ROLE_KEY: "private",
      SUPABASE_SECRET_KEY: "private",
      NODE_EXTRA_CA_CERTS: "private-ca",
    },
  );
  for (const key of [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
  ]) {
    assert.equal(env[key], "");
    assert.equal(typeof env[key], "string");
  }
  assert.equal(env.NODE_EXTRA_CA_CERTS, undefined);
  assert.equal(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "public");
});
test("diagnostic writes and appends never follow symlinks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jobs-dev-private-file-"));
  try {
    const protectedFile = join(dir, "protected"),
      file = join(dir, "next.log");
    await writeFile(protectedFile, "preserve");
    await symlink(protectedFile, file);
    await assert.rejects(writePrivateFile(file, "replace"));
    await assert.rejects(writePrivateFile(file, "append", true));
    assert.equal(await readFile(protectedFile, "utf8"), "preserve");
    const regular = join(dir, "regular");
    await writePrivateFile(regular, "one");
    await writePrivateFile(regular, "two", true);
    assert.equal(await readFile(regular, "utf8"), "onetwo");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("control endpoint requires private owned directory and an actual private socket", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jobs-dev-control-")),
    endpoint = join(dir, "control.sock");
  const server = createServer();
  try {
    assert.equal(await privateControlDirectory(dir), true);
    await chmod(dir, 0o755);
    await assert.rejects(privateControlDirectory(dir));
    await chmod(dir, 0o700);
    await writeFile(endpoint, "not a socket");
    await assert.rejects(assertControlSocket(endpoint));
    await rm(endpoint);
    await new Promise<void>((ok) => server.listen(endpoint, ok));
    await chmod(endpoint, 0o600);
    assert.equal(await assertControlSocket(endpoint), true);
    await chmod(endpoint, 0o644);
    await assert.rejects(assertControlSocket(endpoint));
  } finally {
    if (server.listening)
      await new Promise<void>((ok) => server.close(() => ok()));
    await rm(dir, { recursive: true, force: true });
  }
});
test("partial reset accepts only exact pinned AutoRemove gotrue migrate bootstrap", () => {
  const projectId = "jobs-crm-dev-0123456789ab",
    m = { projectId, networkId: `network-${projectId}` } as DevManifest;
  const c = {
    Id: "bootstrap",
    Name: `/supabase_auth_migrate_aabbccddeeff_${projectId}`,
    Image: "sha256:pinned",
    Config: {
      Image: "public.ecr.aws/supabase/gotrue:v2.197.0",
      Cmd: ["gotrue", "migrate"],
      Labels: { "com.supabase.cli.project": projectId },
    },
    HostConfig: {
      NetworkMode: m.networkId,
      AutoRemove: true,
      PortBindings: {},
    },
    NetworkSettings: { Networks: { [m.networkId]: {} }, Ports: {} },
    Mounts: [],
  };
  const inventory: CleanupInventory = { containers: [c], volumes: [] };
  assert.deepEqual(assertDevInventory(m, inventory).containerIds, [
    "bootstrap",
  ]);
  for (const bad of [
    { ...c, Config: { ...c.Config, Cmd: ["gotrue", "serve"] } },
    { ...c, HostConfig: { ...c.HostConfig, AutoRemove: false } },
    { ...c, Name: `/supabase_auth_migrate_other_${projectId}` },
  ])
    assert.throws(() =>
      assertDevInventory(m, { ...inventory, containers: [bad] }),
    );
  assert.throws(() => assertDevInventory(m, inventory, { complete: true }));
  assert.throws(() => assertDevInventory({ ...m, containers: [] }, inventory));
});
