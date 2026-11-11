import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { planRecruitmentCleanup } from "./cleanup-plan.ts";
import {
  assertRecruitmentManifest,
  ledgerCheckpoint,
  recruitmentProjectId,
  recruitmentConfigForProfile,
  recruitmentPortProfiles,
  sha256,
} from "./validation.ts";
import type { RecruitmentManifest } from "./validation.ts";

const projectId = recruitmentProjectId("owned-test", "123456789abc");
const directory = "/checkout/.recruitment-local/owned-test";
const template = readFileSync(
  resolve(import.meta.dirname, "../../supabase/recruitment-config.toml"),
  "utf8",
);
const storageTemplate = readFileSync(
  resolve(
    import.meta.dirname,
    "../../supabase/recruitment-storage-config.toml",
  ),
  "utf8",
);

function manifest(
  portProfile?: RecruitmentManifest["portProfile"],
): RecruitmentManifest {
  const profile = portProfile ?? "legacy";
  const config = recruitmentConfigForProfile(template, projectId, profile);
  return {
    id: "owned-test",
    owner: "jobs-crm-recruitment-local",
    projectId,
    networkId: `network-${projectId}`,
    workdir: directory,
    configHash: sha256(config),
    ...(portProfile ? { portProfile } : {}),
    createdAt: "2026-11-01T00:00:00Z",
    migrationCheckpoint: ledgerCheckpoint([]),
  };
}

test("port profile renderer preserves legacy config and changes only known isolated listeners", () => {
  const legacy = recruitmentConfigForProfile(template, projectId, "legacy");
  const isolated = recruitmentConfigForProfile(template, projectId, "isolated");
  assert.equal(
    legacy,
    template.replace("jobs-crm-recruitment-local-template", projectId),
  );
  for (const key of ["api", "db", "shadow", "studio", "smtp"] as const)
    assert.notEqual(
      recruitmentPortProfiles.legacy[key],
      recruitmentPortProfiles.isolated[key],
    );
  assert.match(isolated, /^\[api\]\nenabled = true\nport = 57021$/m);
  assert.match(isolated, /^\[db\]\nport = 57022\nshadow_port = 57020$/m);
  assert.match(isolated, /^\[studio\]\nenabled = false\nport = 57023$/m);
  assert.match(isolated, /^\[local_smtp\]\nenabled = true\nport = 57024$/m);
  const normalized = isolated
    .replace("port = 57021", "port = 56621")
    .replace("port = 57022", "port = 56622")
    .replace("shadow_port = 57020", "shadow_port = 56620")
    .replace("port = 57023", "port = 56623")
    .replace("port = 57024", "port = 56624");
  assert.equal(normalized, legacy);
});

test("existing manifests without a profile still validate only the legacy config; fresh manifests bind isolated ports", () => {
  for (const m of [manifest(), manifest("isolated")]) {
    const profile = m.portProfile ?? "legacy";
    const config = recruitmentConfigForProfile(template, projectId, profile);
    assertRecruitmentManifest(m, m.id, directory, config, template);
  }
  const legacy = manifest();
  assert.throws(() =>
    assertRecruitmentManifest(
      { ...legacy, portProfile: "isolated" },
      legacy.id,
      directory,
      recruitmentConfigForProfile(template, projectId, "legacy"),
      template,
    ),
  );
  const isolated = manifest("isolated");
  assert.throws(() =>
    assertRecruitmentManifest(
      isolated,
      isolated.id,
      directory,
      recruitmentConfigForProfile(template, projectId, "legacy"),
      template,
    ),
  );
});

test("Storage manifest binds its own profile and exact template", () => {
  const config = recruitmentConfigForProfile(
    storageTemplate,
    projectId,
    "storage",
  );
  const m: RecruitmentManifest = {
    ...manifest("storage"),
    storage: true,
    configHash: sha256(config),
  };
  assertRecruitmentManifest(m, m.id, directory, config, storageTemplate);
  assert.throws(() =>
    assertRecruitmentManifest(
      { ...m, storage: undefined },
      m.id,
      directory,
      config,
      storageTemplate,
    ),
  );
  assert.throws(() =>
    assertRecruitmentManifest(
      { ...m, portProfile: "isolated" },
      m.id,
      directory,
      config,
      storageTemplate,
    ),
  );
  assert.throws(() =>
    assertRecruitmentManifest(m, m.id, directory, config, template),
  );
  assert.match(config, /\[storage\]\nenabled = true/);
  assert.match(config, /site_url = "https:\/\/127\.0\.0\.1:3173"/);
});

test("isolated cleanup accepts only its loopback binding profile and still rejects legacy or wildcard bindings", () => {
  const m = manifest("isolated");
  const network = {
    Id: "network-id",
    Name: m.networkId,
    Labels: { "jobs-crm.recruitment-local": m.projectId },
    Options: { "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1" },
    Containers: {},
  };
  const ports = recruitmentPortProfiles.isolated;
  const container = (hostIp = "127.0.0.1", hostPort = String(ports.db)) => ({
    Id: "db-id",
    Name: `/supabase_db_${m.projectId}`,
    Image: "sha256:owned-image",
    Config: { Labels: { "com.supabase.cli.project": m.projectId } },
    HostConfig: {
      NetworkMode: m.networkId,
      PortBindings: {
        "5432/tcp": [{ HostIp: hostIp, HostPort: hostPort }],
      },
    },
    NetworkSettings: { Networks: { [m.networkId]: {} }, Ports: {} },
  });
  const policy = {
    publishedPorts: {
      "5432/tcp": String(ports.db),
      "8000/tcp": String(ports.api),
      "8025/tcp": String(ports.smtp),
    },
    networkLabel: "jobs-crm.recruitment-local",
  };
  const inventory = (candidate: ReturnType<typeof container>) => ({
    containers: [candidate],
    volumes: [],
    network,
  });
  assert.deepEqual(
    planRecruitmentCleanup(m, inventory(container()), policy).containerIds,
    ["db-id"],
  );
  assert.throws(() =>
    planRecruitmentCleanup(
      m,
      inventory(container("127.0.0.1", "56622")),
      policy,
    ),
  );
  assert.throws(() =>
    planRecruitmentCleanup(m, inventory(container("0.0.0.0")), policy),
  );
});
