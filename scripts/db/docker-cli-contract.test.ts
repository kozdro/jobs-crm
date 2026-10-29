/** Requires the F2 Docker CLI, never its daemon: every command targets this mock Unix socket. */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bootstrapName, guardCreate } from "./docker-guard.ts";
const exec = promisify(execFile);
const scope = {
  projectId: "jobs-crm-f2-contract-aabbccddeeff",
  networkId: "network-contract",
  workdir: "/tmp/contract",
};
test("actual Docker CLI serialization for all four pinned services and Auth-only bootstrap", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jobs-f2-client-"));
  const socket = join(dir, "docker.sock");
  const observations: { name: string; body: Record<string, unknown> }[] = [];
  const failures: string[] = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === "/_ping") {
      res.setHeader("Api-Version", "1.51");
      res.end("OK");
      return;
    }
    if (req.url === "/version") {
      res.end(JSON.stringify({ ApiVersion: "1.51", MinAPIVersion: "1.24" }));
      return;
    }
    if (req.url?.includes("/containers/create")) {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<
        string,
        unknown
      >;
      try {
        const requested = new URL(req.url, "http://mock").searchParams.get(
          "name",
        );
        const name = requested || bootstrapName(body, scope);
        guardCreate(body, name, scope);
        observations.push({ name, body });
      } catch (error) {
        failures.push((error as Error).message);
      }
    }
    // Refuse every create deliberately. No Docker daemon or container ever receives these requests.
    res.writeHead(403, { "content-type": "application/json" });
    res.end('{"message":"Non-mutating client contract probe"}');
  });
  await new Promise<void>((ok) => server.listen(socket, ok));
  const common = [
    "--network",
    scope.networkId,
    "--label",
    "com.supabase.cli.project=" + scope.projectId,
    "--label",
    "com.docker.compose.project=" + scope.projectId,
  ];
  const services = [
    {
      kind: "db",
      image: "public.ecr.aws/supabase/postgres:17.11.0.006",
      flags: [
        "-p",
        "56422:5432",
        "-v",
        `supabase_db_${scope.projectId}:/var/lib/postgresql/data`,
      ],
    },
    {
      kind: "kong",
      image: "public.ecr.aws/supabase/kong:2.8.1",
      flags: ["-p", "56421:8000"],
    },
    {
      kind: "auth",
      image: "public.ecr.aws/supabase/gotrue:v2.197.0",
      flags: [],
    },
    {
      kind: "rest",
      image: "public.ecr.aws/supabase/postgrest:v16.5",
      flags: [],
    },
  ];
  try {
    for (const service of services) {
      await assert.rejects(
        exec(
          "docker",
          [
            "create",
            "--name",
            `supabase_${service.kind}_${scope.projectId}`,
            ...common,
            ...service.flags,
            service.image,
          ],
          {
            env: {
              ...process.env,
              DOCKER_HOST: `unix://${socket}`,
              DOCKER_CONTEXT: undefined,
            },
            timeout: 10000,
          },
        ),
      );
    }
    for (const image of [
      "public.ecr.aws/supabase/gotrue:v2.197.0",
      "ghcr.io/supabase/gotrue:v2.197.0",
      "supabase/gotrue:v2.197.0",
    ]) {
      await assert.rejects(
        exec("docker", ["run", "--rm", ...common, image, "gotrue", "migrate"], {
          env: {
            ...process.env,
            DOCKER_HOST: `unix://${socket}`,
            DOCKER_CONTEXT: undefined,
          },
          timeout: 10000,
        }),
      );
    }
    assert.deepEqual(failures, []);
    assert.equal(observations.length, 7);
    assert.deepEqual(
      observations.slice(4).map((o) => o.body.Image),
      [
        "public.ecr.aws/supabase/gotrue:v2.197.0",
        "ghcr.io/supabase/gotrue:v2.197.0",
        "supabase/gotrue:v2.197.0",
      ],
    );
    assert.match(
      observations[4].name,
      new RegExp(`^supabase_auth_migrate_[a-f0-9]{12}_${scope.projectId}$`),
    );
    for (const observation of observations) {
      const host = observation.body.HostConfig as {
        PortBindings?: Record<string, { HostIp: string }[]>;
      };
      for (const bindings of Object.values(host.PortBindings ?? {}))
        for (const b of bindings) assert.equal(b.HostIp, "127.0.0.1");
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
    await rm(dir, { recursive: true, force: true });
  }
});
test("unnamed bootstrap contract denies other image/command/identity/lifetime/ports", () => {
  const good = {
    Image: "public.ecr.aws/supabase/gotrue:v2.197.0",
    Cmd: ["gotrue", "migrate"],
    Labels: {
      "com.supabase.cli.project": scope.projectId,
      "com.docker.compose.project": scope.projectId,
    },
    HostConfig: {
      AutoRemove: true,
      NetworkMode: scope.networkId,
      PortBindings: {},
      Binds: [],
    },
  };
  const name = bootstrapName(good, scope);
  assert.doesNotThrow(() => guardCreate(good, name, scope));
  for (const change of [
    { Image: "public.ecr.aws/supabase/storage-api:v1" },
    { Cmd: ["sh"] },
    { Labels: { "com.supabase.cli.project": "foreign" } },
    { HostConfig: { ...good.HostConfig, AutoRemove: false } },
    {
      HostConfig: {
        ...good.HostConfig,
        PortBindings: { "9999/tcp": [{ HostPort: "9999" }] },
      },
    },
  ])
    assert.throws(() => bootstrapName({ ...good, ...change }, scope));
});

// Docker waits for /wait response headers before issuing /start; its body waits for process exit.
// This reproduces the real CLI handshake without contacting any Docker daemon.
test(
  "actual Docker run lifecycle receives wait headers before start and finishes owned Auth bootstrap",
  { timeout: 10000 },
  async () => {
    const { createDockerGuard } = await import("./docker-guard.ts");
    const dir = await mkdtemp(join(tmpdir(), "jobs-f2-lifecycle-"));
    const original = join(dir, "docker.sock");
    const events: string[] = [];
    let helperName = "";
    let attach: import("node:stream").Duplex | undefined;
    const waiters: http.ServerResponse[] = [];
    const server = http.createServer(async (req, res) => {
      const route = new URL(req.url ?? "/", "http://mock").pathname.replace(
        /^\/v[0-9.]+/,
        "",
      );
      events.push(`${req.method} ${route}`);
      if (route === "/_ping") {
        res.setHeader("Api-Version", "1.51");
        res.end("OK");
        return;
      }
      if (route === "/version") {
        res.end(JSON.stringify({ ApiVersion: "1.51", MinAPIVersion: "1.24" }));
        return;
      }
      if (route === "/containers/create") {
        helperName =
          new URL(req.url ?? "/", "http://mock").searchParams.get("name") ?? "";
        for await (const chunk of req) {
          void chunk;
        }
        res.writeHead(201);
        res.end('{"Id":"lifecycle-helper","Warnings":[]}');
        return;
      }
      if (route === "/containers/lifecycle-helper/json") {
        res.end(
          JSON.stringify({
            Id: "lifecycle-helper",
            Name: "/" + helperName,
            Config: { Labels: { "com.supabase.cli.project": scope.projectId } },
            State: { Status: "created" },
          }),
        );
        return;
      }
      if (route === "/containers/lifecycle-helper/wait") {
        res.writeHead(200, { "content-type": "application/json" });
        res.flushHeaders();
        waiters.push(res);
        return;
      }
      if (route === "/containers/lifecycle-helper/start") {
        res.writeHead(204);
        res.end();
        for (const waiter of waiters) waiter.end('{"StatusCode":0}');
        attach?.end();
        return;
      }
      res.writeHead(404);
      res.end('{"message":"No other mock action is allowed"}');
    });
    server.on("upgrade", (req, socket) => {
      events.push(
        `UPGRADE ${new URL(req.url ?? "/", "http://mock").pathname.replace(/^\/v[0-9.]+/, "")}`,
      );
      attach = socket;
      socket.write(
        "HTTP/1.1 101 UPGRADED\r\nContent-Type: application/vnd.docker.raw-stream\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n",
      );
    });
    await new Promise<void>((ok) => server.listen(original, ok));
    const guard = await createDockerGuard(original, scope);
    try {
      await exec(
        "docker",
        [
          "run",
          "--rm",
          "--network",
          scope.networkId,
          "--label",
          "com.supabase.cli.project=" + scope.projectId,
          "--label",
          "com.docker.compose.project=" + scope.projectId,
          "public.ecr.aws/supabase/gotrue:v2.197.0",
          "gotrue",
          "migrate",
        ],
        {
          env: {
            ...process.env,
            DOCKER_HOST: guard.dockerHost,
            DOCKER_CONTEXT: undefined,
          },
          timeout: 3000,
          killSignal: "SIGKILL",
        },
      );
      assert.deepEqual(guard.denials, []);
      assert.match(
        helperName,
        new RegExp(`^supabase_auth_migrate_[a-f0-9]{12}_${scope.projectId}$`),
      );
      assert.ok(
        events.indexOf("POST /containers/lifecycle-helper/wait") <
          events.indexOf("POST /containers/lifecycle-helper/start"),
      );
      assert.ok(events.includes("UPGRADE /containers/lifecycle-helper/attach"));
    } finally {
      attach?.destroy();
      for (const waiter of waiters) waiter.destroy();
      await guard.close();
      server.closeAllConnections();
      await new Promise<void>((ok) => server.close(() => ok()));
      await rm(dir, { recursive: true, force: true });
    }
  },
);

// A cold cache follows docker pull; Docker normalizes the official Hub shorthand before the API call.
test(
  "actual Docker cold-pull serialization permits only official Supabase registry aliases",
  { timeout: 15000 },
  async () => {
    const { createDockerGuard } = await import("./docker-guard.ts");
    const dir = await mkdtemp(join(tmpdir(), "jobs-f2-cold-pull-"));
    const original = join(dir, "docker.sock");
    const { mkdir, writeFile } = await import("node:fs/promises");
    const config = join(dir, "client-config");
    await mkdir(config);
    await writeFile(join(config, "config.json"), "{}", { mode: 0o600 });
    const pulls: { image: string; tag: string | null }[] = [];
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? "/", "http://mock");
      const route = u.pathname.replace(/^\/v[0-9.]+/, "");
      if (route === "/_ping") {
        res.setHeader("Api-Version", "1.48");
        res.end("OK");
        return;
      }
      if (route === "/version") {
        res.end(JSON.stringify({ ApiVersion: "1.48", MinAPIVersion: "1.24" }));
        return;
      }
      if (req.method === "POST" && route === "/images/create") {
        pulls.push({
          image: u.searchParams.get("fromImage") ?? "",
          tag: u.searchParams.get("tag"),
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"status":"Download complete"}\n');
        return;
      }
      res.writeHead(404);
      res.end('{"message":"No other mock action is allowed"}');
    });
    await new Promise<void>((ok) => server.listen(original, ok));
    const guard = await createDockerGuard(original, scope);
    const pull = (image: string, host: string) =>
      exec("docker", ["pull", image], {
        env: {
          ...process.env,
          DOCKER_CONFIG: config,
          DOCKER_HOST: host,
          DOCKER_CONTEXT: undefined,
        },
        timeout: 3000,
        killSignal: "SIGKILL",
      });
    const services = [
      ["postgres", "17.11.0.006"],
      ["gotrue", "v2.197.0"],
      ["postgrest", "v16.5"],
      ["kong", "2.8.1"],
    ];
    try {
      // Observe the real CLI's normalization directly against the mock; no image cache is touched.
      for (const [service, tag] of services) {
        await pull(`supabase/${service}:${tag}`, `unix://${original}`);
        assert.deepEqual(pulls.at(-1), {
          image: `docker.io/supabase/${service}`,
          tag,
        });
      }
      for (const registry of [
        "public.ecr.aws/supabase",
        "ghcr.io/supabase",
        "supabase",
        "docker.io/supabase",
      ])
        for (const [service, tag] of services) {
          const before = pulls.length;
          await pull(`${registry}/${service}:${tag}`, guard.dockerHost);
          assert.equal(pulls.length, before + 1);
          assert.equal(
            pulls.at(-1)?.image,
            `${registry === "supabase" ? "docker.io/supabase" : registry}/${service}`,
          );
          assert.equal(pulls.at(-1)?.tag, tag);
        }
      const accepted = pulls.length;
      for (const image of [
        "docker.io/library/postgres:17",
        "docker.io/other/postgres:17",
        "docker.io.evil.example/supabase/postgres:17",
        "evil.example/docker.io/supabase/postgres:17",
        "public.ecr.aws.evil.example/supabase/postgres:17",
        "public.ecr.aws/other/postgres:17",
        "ghcr.io/other/postgres:17",
        "supabase-evil/postgres:17",
      ])
        await assert.rejects(pull(image, guard.dockerHost));
      assert.equal(
        pulls.length,
        accepted,
        "untrusted namespaces and lookalike registries never reach the mock daemon",
      );
    } finally {
      await guard.close();
      server.closeAllConnections();
      await new Promise<void>((ok) => server.close(() => ok()));
      await rm(dir, { recursive: true, force: true });
    }
  },
);
