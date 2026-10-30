/** Independent QA: cross-project safety and restart invariants, no Docker daemon. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertDevInventory,
  assertDevManifest,
  assertResetConfirmation,
  publishedPorts,
  networkLabel,
  ports,
  type DevManifest,
} from "./validation.ts";
import { ledgerCheckpoint, sha256 } from "../recruitment/validation.ts";
import type { CleanupInventory } from "../recruitment/cleanup-plan.ts";
import { createServer } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertFreePort } from "./target.ts";

const projectId = "jobs-crm-dev-aabbccddeeff";
const workdir = "/synthetic/checkout/.local-dev";
const template = 'project_id = "jobs-crm-dev-template"\n';
const config = template.replace("jobs-crm-dev-template", projectId);
const volume = `supabase_db_${projectId}`;
function fixture() {
  const m: DevManifest = {
    owner: "jobs-crm-local-dev",
    projectId,
    networkId: `network-${projectId}`,
    workdir,
    configHash: sha256(config),
    migrationCheckpoint: ledgerCheckpoint([]),
    createdAt: "2026-10-30T00:00:00.000Z",
    volumes: [volume],
  };
  const servicePorts: Record<string, string> = {
    db: "5432/tcp",
    kong: "8000/tcp",
    studio: "3000/tcp",
    inbucket: "8025/tcp",
  };
  const images: Record<string, string> = {
    db: "postgres:17.11.0.006",
    auth: "gotrue:v2.197.0",
    rest: "postgrest:v16.5",
    kong: "kong:2.8.1",
    inbucket: "mailpit:v1.31.3",
    studio: "studio:2026.10.19-sha-b375769",
    pg_meta: "postgres-meta:v0.100.0",
  };
  const inventory: CleanupInventory = {
    containers: [
      "db",
      "auth",
      "rest",
      "kong",
      "inbucket",
      "studio",
      "pg_meta",
    ].map((service) => {
      const port = servicePorts[service];
      const bindings = port
        ? {
            [port]: [
              {
                HostIp: "127.0.0.1",
                HostPort: publishedPorts[port as keyof typeof publishedPorts],
              },
            ],
          }
        : {};
      return {
        Id: `synthetic-${service}`,
        Name: `/supabase_${service}_${projectId}`,
        Image: `sha256:synthetic-${service}`,
        Config: {
          Labels: { "com.supabase.cli.project": projectId },
          Image: "public.ecr.aws/supabase/" + images[service],
        },
        State: { Running: true },
        HostConfig: { NetworkMode: m.networkId, PortBindings: bindings },
        NetworkSettings: {
          Networks: { [m.networkId]: {} },
          Ports: bindings,
        },
        Mounts:
          service === "db"
            ? [
                {
                  Type: "volume",
                  Name: volume,
                  Destination: "/var/lib/postgresql/data",
                },
              ]
            : [],
      };
    }),
    volumes: [
      { Name: volume, Labels: { "com.supabase.cli.project": projectId } },
    ],
    network: {
      Id: "synthetic-network-id",
      Name: m.networkId,
      Labels: { [networkLabel]: projectId },
      Options: { "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1" },
      Containers: {},
    },
  };
  m.containers = inventory.containers.map((c) => ({
    id: c.Id,
    name: c.Name,
    imageId: c.Image,
  }));
  return { m, inventory };
}
test("QA: DEV ports are disjoint from F2/F3/Recruitment test target ports", () => {
  const testPorts = new Set([
    3143, 3144, 3152, 3153, 56420, 56421, 56422, 56423, 56424, 56520, 56521,
    56522, 56523, 56524, 56620, 56621, 56622, 56623, 56624,
  ]);
  assert.equal(
    Object.values(ports).some((p) => testPorts.has(p)),
    false,
  );
});
test("QA: exact manifest accepts only matching checkout/config/target identity", () => {
  const { m } = fixture();
  assert.doesNotThrow(() => assertDevManifest(m, workdir, config, template));
  for (const bad of [
    { owner: "jobs-crm-recruitment-local" },
    { projectId: "jobs-crm-recruitment-manual-dev" },
    { projectId: "jobs-crm-dev-aabbccddeeff;rm" },
    { networkId: "network-foreign" },
    { workdir: "/another/checkout/.local-dev" },
    { configHash: sha256(config + "\n") },
    { migrationCheckpoint: "not-a-checkpoint" },
    { schemaCheckpoint: "bad" },
  ])
    assert.throws(() =>
      assertDevManifest(
        { ...m, ...bad } as DevManifest,
        workdir,
        config,
        template,
      ),
    );
  assert.throws(() => assertDevManifest(m, workdir, config + "\n", template));
});
test("QA: reset requires exact target and explains data loss", () => {
  const { m } = fixture();
  for (const confirmation of [
    undefined,
    "",
    "yes",
    "manual-dev",
    "production",
    projectId + " ",
  ])
    assert.throws(
      () => assertResetConfirmation(m, confirmation),
      /ALL Local DEV users, passwords, cases/,
    );
  assert.doesNotThrow(() => assertResetConfirmation(m, projectId));
});
test("QA: valid inventory generates only exact owned cleanup targets", () => {
  const { m, inventory } = fixture();
  const before = structuredClone(inventory);
  const plan = assertDevInventory(m, inventory, { complete: true });
  assert.deepEqual(
    plan.containerIds,
    inventory.containers.map((c) => c.Id),
  );
  assert.deepEqual(plan.volumeNames, [volume]);
  assert.deepEqual(plan.networkIds, ["synthetic-network-id"]);
  assert.deepEqual(inventory, before, "Validation must never mutate inventory");
});
test("QA: foreign identities, images, endpoints, volumes and attachments refuse full plan", () => {
  const mutations: ((inventory: CleanupInventory) => void)[] = [
    (i) => {
      i.containers[0].Config.Labels = { "com.supabase.cli.project": "foreign" };
    },
    (i) => {
      i.containers[0].Name = "/supabase_db_foreign";
    },
    (i) => {
      i.containers[0].Id = "replaced-container";
    },
    (i) => {
      i.containers[0].Image = "replaced-image";
    },
    (i) => {
      i.containers[0].HostConfig.NetworkMode = "foreign-network";
    },
    (i) => {
      i.containers[0].NetworkSettings.Networks = { "foreign-network": {} };
    },
    (i) => {
      i.containers[0].HostConfig.PortBindings = {
        "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "56722" }],
      };
    },
    (i) => {
      i.containers[0].NetworkSettings.Ports = {
        "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "56622" }],
      };
    },
    (i) => {
      i.volumes[0].Labels = { "com.supabase.cli.project": "foreign" };
    },
    (i) => {
      i.volumes[0].Name = "supabase_db_foreign";
    },
    (i) => {
      i.network!.Labels = { [networkLabel]: "foreign" };
    },
    (i) => {
      i.network!.Options = {
        "com.docker.network.bridge.host_binding_ipv4": "0.0.0.0",
      };
    },
    (i) => {
      i.network!.Containers = { "foreign-container": {} };
    },
  ];
  for (const mutate of mutations) {
    const { m, inventory } = fixture();
    mutate(inventory);
    assert.throws(() => assertDevInventory(m, inventory, { complete: true }));
    assert.throws(() => assertDevInventory(m, inventory));
  }
});
test("QA: missing services refuse reuse rather than creating an empty replacement", () => {
  const { m, inventory } = fixture();
  inventory.containers.pop();
  assert.throws(
    () => assertDevInventory(m, inventory, { complete: true }),
    /incomplete/,
  );
});
test("QA: complete target must retain actual PostgreSQL data volume mount", () => {
  const { m, inventory } = fixture();
  const db = inventory.containers[0] as (typeof inventory.containers)[0] & {
    Mounts: unknown[];
  };
  db.Mounts = [];
  assert.throws(() => assertDevInventory(m, inventory, { complete: true }));
});
test("QA: partial cleanup also refuses host binds and initial startup refuses unpinned images", () => {
  for (const complete of [false, true]) {
    const { m, inventory } = fixture();
    const c = inventory.containers[0] as (typeof inventory.containers)[0] & {
      Mounts: { Type: string; Source: string; Destination: string }[];
    };
    c.Mounts = [
      {
        Type: "bind",
        Source: "/private/foreign",
        Destination: "/var/lib/postgresql/data",
      },
    ];
    assert.throws(
      () => assertDevInventory(m, inventory, { complete }),
      /mount/,
    );
  }
  const { m, inventory } = fixture();
  delete m.containers;
  const c = inventory.containers[0] as (typeof inventory.containers)[0] & {
    Config: { Image: string };
  };
  c.Config.Image = "evil.invalid/postgres:17.11.0.006";
  assert.throws(
    () => assertDevInventory(m, inventory, { complete: true }),
    /image pin mismatch/,
  );
});
test("QA: complete target must publish required service endpoints", () => {
  for (const service of ["db", "kong", "studio", "inbucket"]) {
    const { m, inventory } = fixture();
    const c = inventory.containers.find(
      (c) => c.Name === `/supabase_${service}_${projectId}`,
    )!;
    c.HostConfig.PortBindings = {};
    c.NetworkSettings.Ports = {};
    assert.throws(() => assertDevInventory(m, inventory, { complete: true }));
  }
});
test("QA: DEV profile enables Studio/mail without changing test profiles", async () => {
  const dev = await readFile(
    new URL("../../supabase/local-dev-config.toml", import.meta.url),
    "utf8",
  );
  assert.match(dev, /\[studio\]\s+enabled\s*=\s*true/);
  assert.match(dev, /\[local_smtp\]\s+enabled\s*=\s*true/);
  assert.match(dev, /\[db\.migrations\]\s+enabled\s*=\s*false/);
  assert.match(dev, /\[db\.seed\]\s+enabled\s*=\s*false/);
  assert.match(dev, /site_url\s*=\s*"https:\/\/127\.0\.0\.1:3163"/);
  assert.doesNotMatch(dev, /smtp_host\s*=|smtp_user\s*=|smtp_pass\s*=/);
  for (const name of [
    "config.toml",
    "f3-config.toml",
    "recruitment-config.toml",
  ]) {
    const profile = await readFile(
      new URL(`../../supabase/${name}`, import.meta.url),
      "utf8",
    );
    assert.match(profile, /\[studio\]\s+enabled\s*=\s*false/);
  }
});
test("QA: occupied loopback port refuses without touching the listener", async () => {
  const listener = createServer((socket) =>
    socket.end("synthetic foreign service"),
  );
  await new Promise<void>((ok) => listener.listen(0, "127.0.0.1", ok));
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  try {
    await assert.rejects(
      assertFreePort(address.port),
      /occupied; no service was stopped or replaced/,
    );
    assert.equal(listener.listening, true);
  } finally {
    await new Promise<void>((ok) => listener.close(() => ok()));
  }
});
test("QA: missing Docker and remote daemon produce bounded actionable failures", async () => {
  const run = promisify(execFile);
  const program =
    "import {localEngine} from './scripts/local-dev/target.ts'; await localEngine().catch(e=>{console.error(e.message);process.exitCode=1;});";
  for (const [env, expected] of [
    [{ PATH: "", DOCKER_HOST: "", DOCKER_CONTEXT: "" }, /Start Docker Desktop/],
    [{ DOCKER_HOST: "tcp:\/\/remote.invalid:2375" }, /remote Docker refused/],
  ] as const) {
    await assert.rejects(
      run(process.execPath, ["--input-type=module", "-e", program], {
        cwd: new URL("../../", import.meta.url),
        env: { ...process.env, ...env },
        timeout: 10000,
      }),
      (error: unknown) => {
        assert.match((error as { stderr: string }).stderr, expected);
        return true;
      },
    );
  }
});
test("QA: CLI version guard rejects an incompatible process before touching Docker", async () => {
  // Inject the observed bad version into a child only; this tests the guard,
  // while real toolchain provenance is checked separately by the orchestrator.
  const run = promisify(execFile);
  const program =
    "Object.defineProperty(process,'version',{value:'v26.10.0'});process.argv=['node','cli','start'];await import('./scripts/local-dev/cli.ts');";
  await assert.rejects(
    run(process.execPath, ["--input-type=module", "-e", program], {
      cwd: new URL("../../", import.meta.url),
      env: {
        ...process.env,
        DOCKER_HOST: "tcp://must-never-connect.invalid:2375",
      },
      timeout: 10000,
    }),
    (error: unknown) => {
      const output = (error as { stderr: string }).stderr;
      assert.match(
        output,
        /requires Node24\.22\.2; this process uses v26\.10\.0/,
      );
      assert.doesNotMatch(
        output,
        /remote Docker refused|Local Docker unavailable/,
      );
      return true;
    },
  );
});
