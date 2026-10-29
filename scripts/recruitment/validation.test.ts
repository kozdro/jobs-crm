import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMigrationLedger,
  assertRecruitmentManifest,
  ledgerCheckpoint,
  sha256,
  recruitmentProjectId,
} from "./validation.ts";
import type { RecruitmentManifest } from "./validation.ts";
import { guardCreate } from "../db/docker-guard.ts";
const id = "owned-test";
const directory = "/checkout/.recruitment-local/owned-test";
const template = 'project_id = "jobs-crm-recruitment-local-template"\n';
const projectId = recruitmentProjectId(id, "aabbccddeeff");
const config = template.replace(
  "jobs-crm-recruitment-local-template",
  projectId,
);
function manifest(): RecruitmentManifest {
  return {
    id,
    owner: "jobs-crm-recruitment-local",
    projectId,
    networkId: `network-${projectId}`,
    workdir: directory,
    configHash: sha256(config),
    createdAt: "2026-10-29T00:00:00Z",
    migrationCheckpoint: ledgerCheckpoint([]),
  };
}
test("project names stay within CLI limit even for the longest allowed target ID", () => {
  for (const targetId of ["a", "preflight-a", "a".repeat(31)]) {
    const name = recruitmentProjectId(targetId, "aabbccddeeff");
    assert.equal(name.length, 40);
    assert.equal(name.slice(0, 40), name);
    assert.ok(name.endsWith("-aabbccddeeff"));
  }
  assert.notEqual(
    recruitmentProjectId("a", "aabbccddeeff"),
    recruitmentProjectId("b", "aabbccddeeff"),
  );
  assert.throws(() => recruitmentProjectId("../a", "aabbccddeeff"));
  assert.throws(() => recruitmentProjectId("a", "invalid"));
});
test("oversized pre-start failure receipts are eligible only for guarded retirement", () => {
  const m = manifest();
  m.projectId = `jobs-crm-recruitment-${id}-aabbccddeeff`;
  m.networkId = `network-${m.projectId}`;
  const legacyConfig = template.replace(
    "jobs-crm-recruitment-local-template",
    m.projectId,
  );
  m.configHash = sha256(legacyConfig);
  assert.throws(() =>
    assertRecruitmentManifest(m, id, directory, legacyConfig, template),
  );
  assertRecruitmentManifest(m, id, directory, legacyConfig, template, true);
});
test("product manifest binds exact profile, owner, target and checkpoint", () => {
  assertRecruitmentManifest(manifest(), id, directory, config, template);
  for (const mutate of [
    (m: RecruitmentManifest) => {
      m.id = "other";
    },
    (m: RecruitmentManifest) => {
      m.owner = "foreign" as RecruitmentManifest["owner"];
    },
    (m: RecruitmentManifest) => {
      m.projectId = "jobs-crm-f3-owned-test-aabbccddeeff";
    },
    (m: RecruitmentManifest) => {
      m.networkId = "foreign";
    },
    (m: RecruitmentManifest) => {
      m.workdir = "/foreign";
    },
    (m: RecruitmentManifest) => {
      m.migrationCheckpoint = "invalid";
    },
    (m: RecruitmentManifest) => {
      m.configHash = sha256("drift");
    },
  ]) {
    const m = manifest();
    mutate(m);
    assert.throws(() =>
      assertRecruitmentManifest(m, id, directory, config, template),
    );
  }
  const tampered = config + "# changed profile\n";
  const m = manifest();
  m.configHash = sha256(tampered);
  assert.throws(() =>
    assertRecruitmentManifest(m, id, directory, tampered, template),
  );
  assert.throws(() =>
    assertRecruitmentManifest(
      manifest(),
      "../owned-test",
      directory,
      config,
      template,
    ),
  );
});
const history = [
  { hash: sha256("first migration"), folderMillis: 1 },
  { hash: sha256("second migration"), folderMillis: 2 },
];
const ledger = history.map((entry, index) => ({
  id: index + 1,
  hash: entry.hash,
  created_at: entry.folderMillis,
}));
test("fresh, upgrade prefix and exact repeated migration histories are allowed", () => {
  assertMigrationLedger([], history, ledgerCheckpoint([]));
  assertMigrationLedger(
    ledger.slice(0, 1),
    history,
    ledgerCheckpoint(ledger.slice(0, 1)),
  );
  assertMigrationLedger(ledger, history, ledgerCheckpoint(ledger), true);
  const gap = ledger.map((row, index) => ({ ...row, id: index + 9 }));
  assertMigrationLedger(gap, history, ledgerCheckpoint(gap), true);
});
test("deleted, reordered, altered or ahead ledgers and changed migration sources are refused", () => {
  for (const candidate of [
    ledger.slice(0, 1),
    [...ledger].reverse(),
    ledger.map((row, index) => ({ ...row, id: index + 10 })),
    ledger.map((row) => ({ ...row, hash: sha256("changed") })),
    ledger.map((row) => ({ ...row, created_at: 99 })),
  ])
    assert.throws(() =>
      assertMigrationLedger(candidate, history, ledgerCheckpoint(ledger)),
    );
  assert.throws(() =>
    assertMigrationLedger(
      ledger,
      history.slice(0, 1),
      ledgerCheckpoint(ledger),
    ),
  );
  assert.throws(() =>
    assertMigrationLedger(
      ledger,
      [history[0], { ...history[1], hash: sha256("edited source") }],
      ledgerCheckpoint(ledger),
    ),
  );
  assert.throws(() =>
    assertMigrationLedger(
      ledger.slice(0, 1),
      history,
      ledgerCheckpoint(ledger.slice(0, 1)),
      true,
    ),
  );
  assert.throws(() => assertMigrationLedger([], [], ledgerCheckpoint([])));
  assert.throws(() =>
    assertMigrationLedger([], [history[1], history[0]], ledgerCheckpoint([])),
  );
});
test("new product Docker profile allows only its own ports/network, preserving F2/F3 isolation", () => {
  const m = manifest();
  const scope = {
    ...m,
    publishedPorts: {
      "5432/tcp": "56622",
      "8000/tcp": "56621",
      "8025/tcp": "56624",
    },
    networkLabel: "jobs-crm.recruitment-local",
  };
  const body = (port = "56622") => ({
    Labels: { "com.supabase.cli.project": projectId },
    HostConfig: {
      NetworkMode: m.networkId,
      PortBindings: { "5432/tcp": [{ HostPort: port }] },
    },
    NetworkingConfig: { EndpointsConfig: { [m.networkId]: {} } },
  });
  const accepted = guardCreate(body(), `supabase_db_${projectId}`, scope);
  assert.equal(
    (
      accepted.HostConfig as {
        PortBindings: Record<string, { HostIp: string }[]>;
      }
    ).PortBindings["5432/tcp"][0].HostIp,
    "127.0.0.1",
  );
  for (const port of ["54322", "56422", "56522"])
    assert.throws(() =>
      guardCreate(body(port), `supabase_db_${projectId}`, scope),
    );
  assert.throws(() => guardCreate(body(), "supabase_db_other", scope));
});
