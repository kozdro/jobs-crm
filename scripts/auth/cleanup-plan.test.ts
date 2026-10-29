import assert from "node:assert/strict";
import test from "node:test";
import { planAuthCleanup } from "./cleanup-plan.ts";
import type { CleanupContainer, CleanupInventory } from "./cleanup-plan.ts";
const projectId = "jobs-crm-f3-partial-aabbccddeeff";
const networkId = `network-${projectId}`;
const scope = { projectId, networkId };
function db(): CleanupContainer {
  return {
    Id: "db-id",
    Name: `/supabase_db_${projectId}`,
    Image: "sha256:owned-image",
    Config: { Labels: { "com.supabase.cli.project": projectId } },
    HostConfig: {
      NetworkMode: networkId,
      PortBindings: {
        "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "56522" }],
      },
    },
    NetworkSettings: { Networks: { [networkId]: {} }, Ports: {} },
  };
}
function network(): NonNullable<CleanupInventory["network"]> {
  return {
    Id: "network-id",
    Name: networkId,
    Labels: { "jobs-crm.foundation-f3": projectId },
    Options: { "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1" },
    Containers: {},
  };
}
function volume() {
  return {
    Name: `supabase_db_${projectId}`,
    Labels: { "com.supabase.cli.project": projectId },
  };
}
test("interrupted db-only startup plans exact owned resources without requiring Auth/API/mail", () => {
  const n = network();
  n.Containers = { "db-id": {} };
  assert.deepEqual(
    planAuthCleanup(scope, {
      containers: [db()],
      volumes: [volume()],
      network: n,
    }),
    {
      containerIds: ["db-id"],
      volumeNames: [`supabase_db_${projectId}`],
      networkIds: ["network-id"],
    },
  );
});
test("network-only startup and repeated cleanup with all resources absent are accepted", () => {
  assert.deepEqual(
    planAuthCleanup(scope, { containers: [], volumes: [], network: network() }),
    {
      containerIds: [],
      volumeNames: [],
      networkIds: ["network-id"],
    },
  );
  for (let repeat = 0; repeat < 2; repeat++)
    assert.deepEqual(planAuthCleanup(scope, { containers: [], volumes: [] }), {
      containerIds: [],
      volumeNames: [],
      networkIds: [],
    });
});
test("stopped or not-yet-started owned container may have no effective network/ports", () => {
  const c = db();
  c.NetworkSettings = {};
  assert.deepEqual(
    planAuthCleanup(scope, { containers: [c], volumes: [] }).containerIds,
    ["db-id"],
  );
});
test("partial inventory must match every recorded immutable container identity", () => {
  const known = {
    ...scope,
    containers: [
      { id: "db-id", name: db().Name, imageId: db().Image },
      {
        id: "auth-id",
        name: `/supabase_auth_${projectId}`,
        imageId: "sha256:auth",
      },
    ],
  };
  assert.deepEqual(
    planAuthCleanup(known, { containers: [db()], volumes: [] }).containerIds,
    ["db-id"],
  );
  const replaced = db();
  replaced.Id = "replacement-id";
  assert.throws(
    () => planAuthCleanup(known, { containers: [replaced], volumes: [] }),
    /identity/,
  );
  const drifted = db();
  drifted.Image = "sha256:unexpected";
  assert.throws(
    () => planAuthCleanup(known, { containers: [drifted], volumes: [] }),
    /identity/,
  );
});
test("foreign labels, extra networks, unsafe binds and unexpected ports never produce a deletion plan", () => {
  for (const mutate of [
    (c: CleanupContainer) => {
      c.Config.Labels = { "com.supabase.cli.project": "foreign" };
    },
    (c: CleanupContainer) => {
      c.Name = "/supabase_db_foreign";
    },
    (c: CleanupContainer) => {
      c.HostConfig.NetworkMode = "host";
    },
    (c: CleanupContainer) => {
      c.NetworkSettings.Networks = { foreign: {} };
    },
    (c: CleanupContainer) => {
      c.HostConfig.PortBindings = {
        "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "56522" }],
      };
    },
    (c: CleanupContainer) => {
      c.NetworkSettings.Ports = {
        "8025/tcp": [{ HostIp: "127.0.0.1", HostPort: "54324" }],
      };
    },
  ]) {
    const c = db();
    mutate(c);
    assert.throws(() =>
      planAuthCleanup(scope, { containers: [c], volumes: [] }),
    );
  }
});
test("similar volume names or missing ownership labels cannot authorize volume removal", () => {
  const v = volume();
  v.Labels = { "com.supabase.cli.project": "foreign" };
  assert.throws(
    () => planAuthCleanup(scope, { containers: [], volumes: [v] }),
    /volume/,
  );
  assert.throws(
    () =>
      planAuthCleanup(scope, {
        containers: [],
        volumes: [{ Name: `supabase_db_${projectId}` }],
      }),
    /volume/,
  );
});
test("unowned network, wildcard binding or foreign endpoint blocks entire cleanup plan", () => {
  for (const mutate of [
    (n: NonNullable<CleanupInventory["network"]>) => {
      n.Labels = {};
    },
    (n: NonNullable<CleanupInventory["network"]>) => {
      n.Options = { "com.docker.network.bridge.host_binding_ipv4": "0.0.0.0" };
    },
    (n: NonNullable<CleanupInventory["network"]>) => {
      n.Containers = { "foreign-id": {} };
    },
  ]) {
    const n = network();
    mutate(n);
    assert.throws(
      () =>
        planAuthCleanup(scope, { containers: [db()], volumes: [], network: n }),
      /network/,
    );
  }
});
