import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { once } from "node:events";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createDockerGuard,
  guardCreate,
  dockerRouteClass,
} from "./docker-guard.ts";

const scope = {
  projectId: "jobs-crm-f2-unit-aabbccddeeff",
  networkId: "network-unit",
  workdir: "/tmp/f2-unit",
};
const name = `supabase_db_${scope.projectId}`;
function payload() {
  return {
    Labels: { "com.supabase.cli.project": scope.projectId },
    HostConfig: {
      NetworkMode: scope.networkId,
      PortBindings: { "5432/tcp": [{ HostIp: "", HostPort: "56422" }] },
      Binds: [`supabase_db_${scope.projectId}:/var/lib/postgresql/data`],
    },
  };
}
test("guard explicitly rewrites blank IP before Docker container create", () => {
  const p = payload();
  assert.equal(guardCreate(p, name, scope), p);
  assert.equal(p.HostConfig.PortBindings["5432/tcp"][0].HostIp, "127.0.0.1");
});
test("guard refuses unowned create", () => {
  assert.throws(() => guardCreate(payload(), "supabase_db_foreign", scope));
  const p = payload();
  p.Labels["com.supabase.cli.project"] = "foreign";
  assert.throws(() => guardCreate(p, name, scope));
});
test("guard refuses explicit wildcard bind", () => {
  for (const ip of ["0.0.0.0", "::", "192.168.1.2"]) {
    const p = payload();
    p.HostConfig.PortBindings["5432/tcp"][0].HostIp = ip;
    assert.throws(() => guardCreate(p, name, scope));
  }
});
test("guard refuses wrong port and host binds", () => {
  const p = payload();
  p.HostConfig.PortBindings["5432/tcp"][0].HostPort = "5432";
  assert.throws(() => guardCreate(p, name, scope));
  const q = payload();
  q.HostConfig.Binds = ["/var/run/docker.sock:/docker.sock"];
  assert.throws(() => guardCreate(q, name, scope));
});
test("guard refuses privileged and foreign network modes", () => {
  for (const change of [
    { Privileged: true },
    { NetworkMode: "host" },
    { PublishAllPorts: true },
    { CapAdd: ["SYS_ADMIN"] },
    { Mounts: [{}] },
  ]) {
    const p = payload();
    Object.assign(p.HostConfig, change);
    assert.throws(() => guardCreate(p, name, scope));
  }
});
test("guard rejects hostbind traversal and additional networks/volume sharing", () => {
  for (const source of [
    "/tmp/f2-unit/file",
    "/tmp/f2-unit/../docker.sock",
    "/var/run/docker.sock",
  ]) {
    const p = payload();
    p.HostConfig.Binds = [source + ":/host"];
    assert.throws(() => guardCreate(p, name, scope));
  }
  for (const change of [{ VolumesFrom: ["foreign"] }, { Links: ["foreign"] }]) {
    const p = payload();
    Object.assign(p.HostConfig, change);
    assert.throws(() => guardCreate(p, name, scope));
  }
  const p = {
    ...payload(),
    NetworkingConfig: { EndpointsConfig: { foreign: {} } },
  };
  assert.throws(() => guardCreate(p, name, scope));
  assert.doesNotThrow(() =>
    guardCreate(
      {
        ...payload(),
        NetworkingConfig: { EndpointsConfig: { [scope.networkId]: {} } },
      },
      name,
      scope,
    ),
  );
});
test("guard rejects case aliases handled case-insensitively by Docker Go decoder", () => {
  assert.throws(() =>
    guardCreate(
      { ...payload(), hostconfig: { NetworkMode: "host" } },
      name,
      scope,
    ),
  );
  const p = payload();
  Object.assign(p.HostConfig.PortBindings["5432/tcp"][0], {
    hostip: "0.0.0.0",
  });
  assert.throws(() => guardCreate(p, name, scope));
});
test("guard rejects non-ASCII object keys before Docker Unicode case folding", () => {
  for (const [key, value] of [
    ["Mountſ", [{ Source: "/var/run/docker.sock", Target: "/host" }]],
    ["Bindſ", ["/var/run/docker.sock:/host"]],
    ["NetworKMode", "host"],
  ] as const) {
    const p = payload();
    Object.assign(p.HostConfig, { [key]: value });
    assert.throws(() => guardCreate(p, name, scope), {
      message: "Non-ASCII Docker object key refused",
    });
  }
  assert.doesNotThrow(() => guardCreate(payload(), name, scope));
});
test("real Docker CLI empty optional arrays are allowed; nonempty devices/caps remain denied", () => {
  const p = payload();
  Object.assign(p.HostConfig, {
    Devices: [],
    CapAdd: null,
    Mounts: [],
    VolumesFrom: null,
    Links: null,
  });
  assert.doesNotThrow(() => guardCreate(p, name, scope));
  for (const change of [
    { Devices: [{}] },
    { CapAdd: ["SYS_ADMIN"] },
    { Mounts: [{}] },
    { VolumesFrom: ["foreign"] },
    { Links: ["foreign"] },
  ]) {
    const p = payload();
    Object.assign(p.HostConfig, change);
    assert.throws(() => guardCreate(p, name, scope));
  }
});
test("private services have no published ports added", () => {
  const p = payload();
  p.HostConfig.PortBindings = {} as typeof p.HostConfig.PortBindings;
  guardCreate(p, `supabase_auth_${scope.projectId}`, scope);
  assert.deepEqual(p.HostConfig.PortBindings, {});
});
function request(
  socketPath: string,
  path: string,
  method = "GET",
  body?: object,
) {
  return new Promise<{ status: number; body: string }>((ok, no) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : undefined;
    const req = http.request(
      {
        socketPath,
        path,
        method,
        headers: data
          ? {
              "content-type": "application/json",
              "content-length": data.length,
            }
          : {},
      },
      (res) => {
        const c: Buffer[] = [];
        res.on("data", (b) => c.push(b));
        res.on("end", () =>
          ok({
            status: res.statusCode ?? 0,
            body: Buffer.concat(c).toString(),
          }),
        );
      },
    );
    req.on("error", no);
    req.end(data);
  });
}
test("real Unix transport rewrites request and forwards streaming response without logs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jobs-f2-mock-"));
  const original = join(dir, "docker.sock");
  let received: Record<string, unknown> | undefined;
  let creates = 0;
  let lastCreatePath = "";
  const server = http.createServer(async (req, res) => {
    if (req.url === `/networks/${scope.networkId}`) {
      res.end(
        JSON.stringify({
          Name: scope.networkId,
          Labels: { "jobs-crm.foundation-f2": scope.projectId },
          Options: {
            "com.docker.network.bridge.host_binding_ipv4": "127.0.0.1",
          },
        }),
      );
      return;
    }
    if (req.method === "POST" && req.url === "/networks/create")
      throw new Error("Guard must never forward network create");

    if (req.url?.startsWith("/containers/") && req.url.endsWith("/json")) {
      res.end(
        JSON.stringify({
          Name: `/${name}`,
          Config: { Labels: { "com.supabase.cli.project": scope.projectId } },
        }),
      );
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    if (req.method === "POST" && req.url?.includes("/containers/create")) {
      creates++;
      lastCreatePath = req.url ?? "";
      received = JSON.parse(Buffer.concat(chunks).toString());
      res.writeHead(201, { "content-type": "application/json" });
      res.end('{"Id":"owned-id"}');
    } else if (
      req.url ===
      "/images/create?fromImage=public.ecr.aws%2Fsupabase%2Fpostgres"
    ) {
      res.write('{"status":"pulling"}\n');
      setImmediate(() => res.end('{"status":"complete"}\n'));
    } else if (req.url?.endsWith("/exec")) {
      res.end('{"Id":"owned-exec"}');
    } else res.end("ok");
  });
  server.on("upgrade", (req, socket) => {
    assert.ok(
      req.url === "/exec/owned-exec/start" ||
        req.url === "/containers/owned-id/attach",
    );
    socket.end(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\nguard-upgrade-ok",
    );
  });
  await new Promise<void>((ok) => server.listen(original, ok));
  const guard = await createDockerGuard(original, scope);
  const socket = guard.dockerHost.replace("unix://", "");
  try {
    assert.equal((await stat(socket)).mode & 0o777, 0o600);
    const response = await request(
      socket,
      `/v1.51/containers/create?name=${name}`,
      "POST",
      payload(),
    );
    assert.equal(response.status, 201);
    assert.equal(
      (
        await request(socket, "/networks/create", "POST", {
          Name: scope.networkId,
        })
      ).status,
      409,
    );
    assert.equal(
      (await request(socket, "/networks/create", "POST", { Name: "foreign" }))
        .status,
      403,
    );
    assert.equal(creates, 1);
    const config = received?.HostConfig as {
      PortBindings: Record<string, { HostIp: string }[]>;
    };
    assert.equal(config.PortBindings["5432/tcp"][0].HostIp, "127.0.0.1");
    assert.equal(
      (
        await request(
          socket,
          "/containers/create?name=foreign",
          "POST",
          payload(),
        )
      ).status,
      403,
    );
    assert.equal(creates, 1);
    assert.equal(
      (await request(socket, "/containers/prune", "POST", {})).status,
      403,
    );
    assert.equal(
      (
        await request(
          socket,
          "/images/create?fromImage=public.ecr.aws%2Fsupabase%2Fpostgres",
          "POST",
        )
      ).body,
      '{"status":"pulling"}\n{"status":"complete"}\n',
    );
    assert.equal(
      (
        await request(socket, `/containers/${name}/exec`, "POST", {
          Cmd: ["true"],
        })
      ).status,
      200,
    );
    const upgraded = await new Promise<string>((ok, no) => {
      const req = http.request({
        socketPath: socket,
        path: "/exec/owned-exec/start",
        method: "POST",
        headers: {
          Connection: "Upgrade",
          Upgrade: "tcp",
          "content-length": "2",
        },
      });
      req.on("upgrade", (_res, conn, head) => {
        if (head.length) {
          ok(head.toString());
          conn.destroy();
        } else
          conn.once("data", (b) => {
            ok(b.toString());
            conn.destroy();
          });
      });
      req.on("error", no);
      req.end("{}");
    });
    assert.equal(upgraded, "guard-upgrade-ok");
    const helper = {
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
    assert.equal(
      (await request(socket, "/containers/create", "POST", helper)).status,
      201,
    );
    assert.match(
      new URL(lastCreatePath, "http://mock").searchParams.get("name") ?? "",
      new RegExp(`^supabase_auth_migrate_[a-f0-9]{12}_${scope.projectId}$`),
    );
    const attached = await new Promise<string>((ok, no) => {
      const req = http.request({
        socketPath: socket,
        path: "/containers/owned-id/attach",
        method: "POST",
        headers: {
          Connection: "Upgrade",
          Upgrade: "tcp",
          "content-length": "0",
        },
      });
      req.on("upgrade", (_res, conn, head) => {
        if (head.length) {
          ok(head.toString());
          conn.destroy();
        } else
          conn.once("data", (b) => {
            ok(b.toString());
            conn.destroy();
          });
      });
      req.on("error", no);
      req.end();
    });
    assert.equal(attached, "guard-upgrade-ok");
  } finally {
    await guard.close();
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("guard diagnostics contain only method and canonical route without query or IDs", () => {
  assert.equal(
    dockerRouteClass("DELETE", "/v1.51/networks/secret-id?token=synthetic"),
    "DELETE /networks/:id",
  );
  assert.equal(
    dockerRouteClass(
      "POST",
      "/v1.51/containers/private-id/restart?password=synthetic",
    ),
    "POST /containers/:id/restart",
  );
  assert.equal(
    dockerRouteClass("POST", "/v1.51/volumes/prune?filters=private"),
    "POST /volumes/prune",
  );
  assert.equal(
    dockerRouteClass("POST", "/unknown/private?key=synthetic"),
    "POST /unsupported",
  );
});

test("exec privilege aliases and sensitive reads enforce exact owned-container scope", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jobs-f2-access-"));
  const original = join(dir, "docker.sock");
  let executions = 0;
  const sensitiveReads: string[] = [];
  const server = http.createServer(async (req, res) => {
    const route = new URL(req.url ?? "/", "http://mock").pathname.replace(
      /^\/v[0-9.]+/,
      "",
    );
    if (route.endsWith("/json")) {
      const own = route === "/containers/owned/json";
      res.end(
        JSON.stringify({
          Name: own ? `/supabase_db_${scope.projectId}` : "/foreign",
          Config: {
            Labels: {
              "com.supabase.cli.project": own ? scope.projectId : "foreign",
            },
          },
        }),
      );
      return;
    }
    if (route === "/containers/owned/exec") {
      executions++;
      for await (const chunk of req) {
        void chunk;
      }
      res.end('{"Id":"owned-exec"}');
      return;
    }
    if (/^\/containers\/[^/]+\/(archive|export|logs)$/.test(route)) {
      sensitiveReads.push(`${req.method} ${route}`);
      res.end("synthetic-owned-response");
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((ok) => server.listen(original, ok));
  const guard = await createDockerGuard(original, scope);
  const socket = guard.dockerHost.replace("unix://", "");
  try {
    assert.equal(
      (
        await request(socket, "/containers/owned/exec", "POST", {
          Cmd: ["true"],
          Privileged: true,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(socket, "/containers/owned/exec", "POST", {
          Cmd: ["true"],
          privileged: true,
        })
      ).status,
      403,
    );
    assert.equal(executions, 0);
    assert.equal(
      (
        await request(socket, "/containers/owned/exec", "POST", {
          Cmd: ["true"],
          Privileged: false,
        })
      ).status,
      200,
    );
    assert.equal(executions, 1);
    for (const method of ["GET", "HEAD"])
      for (const surface of ["archive", "export", "logs"]) {
        assert.equal(
          (
            await request(
              socket,
              `/v1.51/containers/foreign/${surface}?path=synthetic`,
              method,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              socket,
              `/v1.51/containers/owned/${surface}?path=synthetic`,
              method,
            )
          ).status,
          200,
        );
      }
    assert.equal(sensitiveReads.length, 6);
    assert.ok(
      sensitiveReads.every((path) => path.includes("/containers/owned/")),
    );
  } finally {
    await guard.close();
    server.closeAllConnections();
    await new Promise<void>((ok) => server.close(() => ok()));
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  "guard close destroys an original Docker stream after its downstream client aborts",
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "jobs-f2-stream-close-"));
    const original = join(dir, "docker.sock");
    const connections = new Set<net.Socket>();
    const server = http.createServer((req, res) => {
      if (req.url === "/containers/owned/json") {
        res.end(
          JSON.stringify({
            Name: `/supabase_db_${scope.projectId}`,
            Config: { Labels: { "com.supabase.cli.project": scope.projectId } },
          }),
        );
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.flushHeaders(); // Deliberately never end Docker's stream.
    });
    server.on("connection", (socket) => {
      connections.add(socket);
      socket.once("close", () => connections.delete(socket));
    });
    await new Promise<void>((ok) => server.listen(original, ok));
    const guard = await createDockerGuard(original, scope);
    let closed = false;
    try {
      const client = http.get({
        socketPath: guard.dockerHost.replace("unix://", ""),
        path: "/containers/owned/logs?follow=1",
      });
      client.on("error", () => {});
      await once(client, "response");
      const disconnected = once(client, "close");
      client.destroy();
      await disconnected;
      await guard.close();
      closed = true;
      await new Promise((ok) => setTimeout(ok, 100));
      assert.equal(
        connections.size,
        0,
        "guard-owned original Docker stream must not survive close",
      );
    } finally {
      if (!closed) await guard.close();
      for (const socket of connections) socket.destroy();
      server.closeAllConnections();
      await new Promise<void>((ok) => server.close(() => ok()));
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  "client abort and guard close during delayed ownership cannot create a late Docker upgrade socket",
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "jobs-f2-late-upgrade-"));
    const original = join(dir, "docker.sock");
    const connections = new Set<net.Socket>();
    let inspection: http.ServerResponse | undefined;
    let inspected = () => {};
    const inspectionStarted = new Promise<void>((ok) => {
      inspected = ok;
    });
    let upgrades = 0;
    const server = http.createServer((_req, res) => {
      inspection = res;
      inspected();
    });
    server.on("connection", (socket) => {
      connections.add(socket);
      socket.once("close", () => connections.delete(socket));
    });
    server.on("upgrade", (_req, socket) => {
      upgrades++;
      socket.write(
        "HTTP/1.1 101 UPGRADED\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n",
      );
    });
    await new Promise<void>((ok) => server.listen(original, ok));
    const guard = await createDockerGuard(original, scope);
    let closed = false;
    const client = net.createConnection({
      path: guard.dockerHost.replace("unix://", ""),
    });
    client.on("error", () => {});
    try {
      await once(client, "connect");
      client.write(
        "POST /containers/owned/attach HTTP/1.1\r\nHost: docker\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: 0\r\n\r\n",
      );
      await inspectionStarted;
      const disconnected = once(client, "close");
      client.destroy();
      await disconnected;
      await guard.close();
      closed = true;
      assert.ok(inspection);
      if (!inspection.destroyed)
        inspection.end(
          JSON.stringify({
            Name: `/supabase_db_${scope.projectId}`,
            Config: { Labels: { "com.supabase.cli.project": scope.projectId } },
          }),
        );
      await new Promise((ok) => setTimeout(ok, 100));
      assert.equal(
        upgrades,
        0,
        "authorization completing after close must not open a raw upstream",
      );
      assert.equal(
        connections.size,
        0,
        "all guard-owned original sockets must close",
      );
    } finally {
      client.destroy();
      if (!closed) await guard.close();
      for (const socket of connections) socket.destroy();
      server.closeAllConnections();
      await new Promise<void>((ok) => server.close(() => ok()));
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test("F3 opt-in port profile permits only its exact loopback mail/API/DB ports", () => {
  const f3 = {
    ...scope,
    publishedPorts: {
      "8025/tcp": "56524",
      "8000/tcp": "56521",
      "5432/tcp": "56522",
    },
  };
  const p = {
    ...payload(),
    HostConfig: {
      ...payload().HostConfig,
      PortBindings: {
        "8025/tcp": [{ HostIp: "", HostPort: "56524" }],
      },
    },
  };
  assert.equal(guardCreate(p, name, f3), p);
  assert.equal(p.HostConfig.PortBindings["8025/tcp"][0].HostIp, "127.0.0.1");
  assert.throws(() => guardCreate(payload(), name, f3));
  assert.throws(() => guardCreate(p, name, scope));
  p.HostConfig.PortBindings["8025/tcp"][0].HostPort = "56525";
  assert.throws(() => guardCreate(p, name, f3));
});
