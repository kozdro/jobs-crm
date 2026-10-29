import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assertManifest,
  assertEndpoints,
  assertPostgres,
  assertContainerIdentities,
  assertBindings,
  assertEmptyPublic,
} from "./preflight-validation.ts";
const projectId = "jobs-crm-f2-unit-aabbccddeeff";
const config = `project_id = "${projectId}"\n`;
const identity = {
  id: "unit",
  owner: "jobs-crm-foundation-f2",
  projectId,
  networkId: `network-${projectId}`,
  workdir: "/tmp/unit",
  configHash: createHash("sha256").update(config).digest("hex"),
  ports: { api: 56421, db: 56422 },
};
test("FQA10 manifest accepts exact owned target", () =>
  assert.doesNotThrow(() =>
    assertManifest(identity, "unit", "/tmp/unit", config),
  ));
test("FQA10 wrong project/path/owner/port/config hash refused", () => {
  for (const change of [
    { projectId: "foreign" },
    { workdir: "/tmp/foreign" },
    { owner: "foreign" },
    { ports: { api: 54321, db: 54322 } },
    { configHash: "tampered" },
  ])
    assert.throws(() =>
      assertManifest({ ...identity, ...change }, "unit", "/tmp/unit", config),
    );
  assert.throws(() =>
    assertManifest(identity, "unit", "/tmp/unit", config + "changed"),
  );
});
test("FQA10 only exact loopback PostgreSQL endpoint accepted", () => {
  const good = "postgresql://postgres@127.0.0.1:56422/postgres";
  assert.doesNotThrow(() =>
    assertEndpoints(good, "http://127.0.0.1:56421", identity.ports),
  );
  for (const bad of [
    good.replace("127.0.0.1", "localhost"),
    good.replace("127.0.0.1", "example.com"),
    good.replace(":56422", ":5432"),
    good.replace(/\/postgres$/, "/foreign"),
    good + "?host=example.com",
    good.replace("postgresql:", "https:"),
  ])
    assert.throws(() =>
      assertEndpoints(bad, "http://127.0.0.1:56421", identity.ports),
    );
});
test("FQA10 DB identity and patched PostgreSQL17 enforced", () => {
  const v = { db: "postgres", current_user: "postgres", version_num: 170011 };
  assert.doesNotThrow(() => assertPostgres(v));
  for (const change of [
    { db: "foreign" },
    { current_user: "authenticated" },
    { version_num: 170010 },
    { version_num: 160015 },
    { version_num: 180001 },
  ])
    assert.throws(() => assertPostgres({ ...v, ...change }));
});
test("FQA10 immutable container IDs and image IDs enforced", () => {
  const actual = [{ id: "one", name: "db", imageId: "sha256:good" }];
  assert.doesNotThrow(() => assertContainerIdentities(actual, actual));
  for (const change of [
    { id: "replacement" },
    { imageId: "sha256:changed" },
    { name: "foreign" },
  ])
    assert.throws(() =>
      assertContainerIdentities(actual, [{ ...actual[0], ...change }]),
    );
});
function bindings() {
  return [
    ["db", "5432/tcp", "56422"],
    ["kong", "8000/tcp", "56421"],
  ].map(([service, port, hostPort]) => ({
    Name: `/supabase_${service}_${projectId}`,
    HostConfig: {
      PortBindings: { [port]: [{ HostIp: "127.0.0.1", HostPort: hostPort }] },
    },
    NetworkSettings: {
      Ports: { [port]: [{ HostIp: "127.0.0.1", HostPort: hostPort }] },
    },
  }));
}
test("FQA10 effective wildcard rejected despite loopback requested/default network", () => {
  const c = bindings();
  assert.doesNotThrow(() => assertBindings(c, projectId, identity.ports));
  for (const ip of ["0.0.0.0", "::", ""]) {
    const bad = bindings();
    bad[0].NetworkSettings.Ports["5432/tcp"][0].HostIp = ip;
    assert.throws(() => assertBindings(bad, projectId, identity.ports));
  }
});
test("FQA10 wrong actual mapped DB/API port rejected", () => {
  const c = bindings();
  c[0].NetworkSettings.Ports["5432/tcp"][0].HostPort = "5432";
  assert.throws(() => assertBindings(c, projectId, identity.ports));
});

test("empty public bootstrap cannot expose objects or user CREATE", () => {
  const good = {
    relations: 0,
    functions: 0,
    anon_create: false,
    authenticated_create: false,
  };
  assert.doesNotThrow(() => assertEmptyPublic(good));
  for (const change of [
    { relations: 1 },
    { functions: 1 },
    { anon_create: true },
    { authenticated_create: true },
  ])
    assert.throws(() => assertEmptyPublic({ ...good, ...change }));
});
