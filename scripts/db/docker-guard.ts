/** Ephemeral CLI-only Docker transport: explicit loopback publishing, owned resources only. */
import http from "node:http";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Scope {
  projectId: string;
  networkId: string;
  workdir: string;
  publishedPorts?: Readonly<Record<string, string>>;
  networkLabel?: string;
}
class GuardRefusal extends Error {}
const nonEmpty = (value: unknown) =>
  value != null && (!Array.isArray(value) || value.length > 0);
const canonicalKeys = [
  "HostConfig",
  "NetworkingConfig",
  "Labels",
  "NetworkMode",
  "PortBindings",
  "HostIp",
  "HostPort",
  "EndpointsConfig",
  "Name",
  "Privileged",
  "PidMode",
  "IpcMode",
  "PublishAllPorts",
  "CapAdd",
  "Devices",
  "Mounts",
  "VolumesFrom",
  "Links",
  "Binds",
  "DriverOpts",
  "Driver",
];
function assertCanonicalKeys(value: unknown) {
  if (Array.isArray(value)) {
    for (const child of value) assertCanonicalKeys(child);
    return;
  }
  if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) {
      if (/[^\x00-\x7F]/.test(key))
        throw new GuardRefusal("Non-ASCII Docker object key refused");
      const canonical = canonicalKeys.find(
        (k) => k.toLowerCase() === key.toLowerCase(),
      );
      if (canonical && canonical !== key)
        throw new GuardRefusal("Docker field case alias refused");
      assertCanonicalKeys(child);
    }
}
/** CLI 2.122 Auth bootstrap is docker run --rm with no --name. No other unnamed job is allowed. */
export function bootstrapName(body: Record<string, unknown>, scope: Scope) {
  assertCanonicalKeys(body);
  const host = (body.HostConfig ?? {}) as Record<string, unknown>;
  const labels = body.Labels as Record<string, string> | undefined;
  if (
    ![
      "public.ecr.aws/supabase/gotrue:v2.197.0",
      "ghcr.io/supabase/gotrue:v2.197.0",
      "supabase/gotrue:v2.197.0",
    ].includes(String(body.Image)) ||
    JSON.stringify(body.Cmd) !== JSON.stringify(["gotrue", "migrate"]) ||
    host.AutoRemove !== true ||
    labels?.["com.supabase.cli.project"] !== scope.projectId ||
    labels?.["com.docker.compose.project"] !== scope.projectId ||
    Object.keys((host.PortBindings ?? {}) as object).length ||
    nonEmpty(host.Binds)
  )
    throw new GuardRefusal("Unknown unnamed Docker bootstrap refused");
  return `supabase_auth_migrate_${randomUUID().replaceAll("-", "").slice(0, 12)}_${scope.projectId}`;
}
export function guardCreate(
  body: Record<string, unknown>,
  name: string,
  scope: Scope,
) {
  assertCanonicalKeys(body);
  const labels = body.Labels as Record<string, string> | undefined;
  const config = (body.HostConfig ?? {}) as Record<string, unknown>;
  if (
    !name.startsWith("supabase_") ||
    !name.endsWith(`_${scope.projectId}`) ||
    labels?.["com.supabase.cli.project"] !== scope.projectId
  )
    throw new GuardRefusal("Unowned create refused");
  if (
    config.NetworkMode !== scope.networkId ||
    config.Privileged ||
    config.PidMode === "host" ||
    config.IpcMode === "host" ||
    config.PublishAllPorts ||
    nonEmpty(config.CapAdd) ||
    nonEmpty(config.Devices) ||
    nonEmpty(config.Mounts) ||
    nonEmpty(config.VolumesFrom) ||
    nonEmpty(config.Links)
  )
    throw new GuardRefusal("Unsafe container mode refused");
  const bindings = (config.PortBindings ?? {}) as Record<
    string,
    { HostIp?: string; HostPort?: string }[]
  >;
  for (const [port, values] of Object.entries(bindings)) {
    const allowedPorts = scope.publishedPorts ?? {
      "5432/tcp": "56422",
      "8000/tcp": "56421",
    };
    if (!Object.hasOwn(allowedPorts, port))
      throw new GuardRefusal("Unexpected published service refused");
    for (const value of values) {
      if (value.HostIp && value.HostIp !== "127.0.0.1")
        throw new GuardRefusal("Explicit non-loopback bind refused");
      if (value.HostPort !== allowedPorts[port])
        throw new GuardRefusal("Unexpected published port refused");
      value.HostIp = "127.0.0.1";
    }
  }
  for (const bind of (config.Binds ?? []) as string[]) {
    const source = bind.split(":")[0];
    if (!new RegExp(`^supabase_[a-z0-9_-]+_${scope.projectId}$`).test(source))
      throw new GuardRefusal("Only owned named volumes permitted");
  }
  const networking = body.NetworkingConfig as
    { EndpointsConfig?: Record<string, unknown> } | undefined;
  if (
    Object.keys(networking?.EndpointsConfig ?? {}).some(
      (name) => name !== scope.networkId,
    )
  )
    throw new GuardRefusal("Additional container networks refused");
  return body;
}

function upstreamRequest(
  socketPath: string,
  path: string,
  agent: http.Agent,
  trackSocket: (socket: net.Socket) => void,
  method = "GET",
  body?: Buffer,
) {
  return new Promise<{ status: number; body: Buffer }>((ok, no) => {
    const req = http.request(
      {
        socketPath,
        path,
        agent,
        method,
        headers: body
          ? {
              "content-type": "application/json",
              "content-length": body.length,
            }
          : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("error", no);
        res.on("aborted", () =>
          no(new GuardRefusal("Local Docker response aborted")),
        );
        res.on("end", () =>
          ok({ status: res.statusCode ?? 500, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on("socket", trackSocket);
    req.on("error", no);
    req.end(body);
  });
}
/** No query, resource identifier, image name or request body can enter diagnostics. */
export function dockerRouteClass(method: string, url: string) {
  const path = new URL(url, "http://docker").pathname.replace(
    /^\/v[0-9.]+/,
    "",
  );
  if (
    [
      "/containers/create",
      "/containers/prune",
      "/volumes/create",
      "/volumes/prune",
      "/networks/create",
      "/networks/prune",
      "/images/create",
    ].includes(path)
  )
    return `${method} ${path}`;
  const container = path.match(
    /^\/containers\/[^/]+(?:\/(start|stop|kill|wait|exec|archive|attach|restart|update|resize))?$/,
  );
  if (container)
    return `${method} /containers/:id${container[1] ? "/" + container[1] : ""}`;
  if (/^\/networks\/[^/]+$/.test(path)) return `${method} /networks/:id`;
  if (/^\/volumes\/[^/]+$/.test(path)) return `${method} /volumes/:name`;
  const execution = path.match(/^\/exec\/[^/]+\/(start|resize)$/);
  if (execution) return `${method} /exec/:id/${execution[1]}`;
  return `${method} /unsupported`;
}
export async function createDockerGuard(originalSocket: string, scope: Scope) {
  if (!originalSocket.startsWith("/"))
    throw new GuardRefusal("Local Docker socket required");
  const dir = await mkdtemp(join(tmpdir(), "jobs-f2-docker-"));
  await chmod(dir, 0o700);
  const socket = join(dir, "docker.sock");
  const execIds = new Set<string>();
  const createdIds = new Set<string>();
  const denials: string[] = [];
  const upstreamAgent = new http.Agent({ keepAlive: false });
  const upstreamSockets = new Set<net.Socket>();
  let closing = false;
  let closePromise: Promise<void> | undefined;
  const trackSocket = (socket: net.Socket) => {
    if (closing) {
      socket.destroy();
      return;
    }
    upstreamSockets.add(socket);
    socket.once("close", () => upstreamSockets.delete(socket));
  };
  const prefix = (path: string) => path.replace(/^\/v[0-9.]+/, "");
  async function assertOwnedContainer(id: string) {
    if (createdIds.has(id)) return;
    const response = await upstreamRequest(
      originalSocket,
      `/containers/${encodeURIComponent(id)}/json`,
      upstreamAgent,
      trackSocket,
    );
    if (response.status !== 200)
      throw new GuardRefusal("Unknown container refused");
    const c = JSON.parse(response.body.toString());
    if (
      c.Config?.Labels?.["com.supabase.cli.project"] !== scope.projectId ||
      !c.Name?.endsWith(`_${scope.projectId}`)
    )
      throw new GuardRefusal("Unowned container mutation refused");
  }
  async function authorize(method: string, path: string, body: Buffer) {
    const u = new URL(path, "http://docker");
    const route = prefix(u.pathname);
    if (method === "GET" || method === "HEAD") {
      const sensitive = route.match(
        /^\/containers\/([^/]+)\/(archive|export|logs)$/,
      );
      if (sensitive)
        await assertOwnedContainer(decodeURIComponent(sensitive[1]));
      return body;
    }
    if (method === "POST" && route === "/containers/create") {
      return Buffer.from(
        JSON.stringify(
          guardCreate(
            JSON.parse(body.toString()),
            u.searchParams.get("name") ?? "",
            scope,
          ),
        ),
      );
    }
    if (method === "POST" && route === "/images/create") {
      const image = u.searchParams.get("fromImage") ?? "";
      const tag = u.searchParams.get("tag");
      const mirroredSupabase =
        /^(public\.ecr\.aws\/supabase\/|ghcr\.io\/supabase\/|docker\.io\/supabase\/|supabase\/)/.test(
          image,
        );
      // CLI 2.122's Dockerfile pins these two upstream fallbacks outside the Supabase namespace.
      const pinnedUpstream =
        (["kong", "docker.io/library/kong"].includes(image) &&
          tag === "2.8.1") ||
        (["postgrest/postgrest", "docker.io/postgrest/postgrest"].includes(
          image,
        ) &&
          tag === "v16.5");
      if (!mirroredSupabase && !pinnedUpstream)
        throw new GuardRefusal("Unexpected image pull refused");
      return body;
    }
    const container = route.match(
      /^\/containers\/([^/]+)(?:\/(start|stop|kill|wait|exec|archive|attach))?$/,
    );
    if (
      container &&
      ((method === "POST" && container[2] !== undefined) ||
        method === "DELETE" ||
        (method === "PUT" && container[2] === "archive"))
    ) {
      await assertOwnedContainer(decodeURIComponent(container[1]));
      if (container[2] === "exec") {
        const execution = JSON.parse(body.toString());
        assertCanonicalKeys(execution);
        if (execution.Privileged)
          throw new GuardRefusal("Privileged exec refused");
      }
      return body;
    }
    const execution = route.match(/^\/exec\/([^/]+)\/start$/);
    if (method === "POST" && execution && execIds.has(execution[1]))
      return body;
    if (method === "POST" && route === "/volumes/create") {
      const v = JSON.parse(body.toString());
      assertCanonicalKeys(v);
      if (
        !v.Name?.endsWith(`_${scope.projectId}`) ||
        (v.DriverOpts && Object.keys(v.DriverOpts).length)
      )
        throw new GuardRefusal("Unowned volume create refused");
      return body;
    }
    const volume = route.match(/^\/volumes\/([^/]+)$/);
    if (
      method === "DELETE" &&
      volume &&
      decodeURIComponent(volume[1]).endsWith(`_${scope.projectId}`)
    )
      return body;
    // The wrapper creates/inspects/removes its owned network outside this CLI transport.
    throw new GuardRefusal("Unsupported Docker mutation refused");
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (closing) {
        res.destroy();
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16 * 1024 * 1024)
          throw new GuardRefusal("Oversized Docker request refused");
        chunks.push(Buffer.from(chunk));
      }
      const original = Buffer.concat(chunks);
      const route = prefix(new URL(req.url ?? "/", "http://docker").pathname);
      if (req.method === "POST" && route === "/networks/create") {
        const requested = JSON.parse(original.toString());
        assertCanonicalKeys(requested);
        if (requested.Name !== scope.networkId)
          throw new GuardRefusal("Unowned network create refused");
        const existing = await upstreamRequest(
          originalSocket,
          `/networks/${encodeURIComponent(scope.networkId)}`,
          upstreamAgent,
          trackSocket,
        );
        if (existing.status !== 200)
          throw new GuardRefusal("Precreated owned network missing");
        const network = JSON.parse(existing.body.toString());
        if (
          network.Name !== scope.networkId ||
          network.Labels?.[scope.networkLabel ?? "jobs-crm.foundation-f2"] !==
            scope.projectId ||
          network.Options?.["com.docker.network.bridge.host_binding_ipv4"] !==
            "127.0.0.1"
        )
          throw new GuardRefusal("Precreated network scope refused");
        // Pinned Go CLI treats Docker 409 as existing-network success. Never forward create.
        res.writeHead(409, { "content-type": "application/json" });
        res.end('{"message":"network already exists"}');
        return;
      }

      let requestPath = req.url ?? "/";
      if (req.method === "POST" && route === "/containers/create") {
        const u = new URL(requestPath, "http://docker");
        if (!u.searchParams.get("name")) {
          u.searchParams.set(
            "name",
            bootstrapName(JSON.parse(original.toString()), scope),
          );
          requestPath = u.pathname + u.search;
        }
      }
      const body = await authorize(req.method ?? "GET", requestPath, original);
      if (closing || req.socket.destroyed || res.destroyed) return;
      const headers = { ...req.headers };
      delete headers.host;
      delete headers["transfer-encoding"];
      if (body.length || original.length)
        headers["content-length"] = String(body.length);
      const upstream = http.request(
        {
          socketPath: originalSocket,
          agent: upstreamAgent,
          path: requestPath,
          method: req.method,
          headers,
        },
        (response) => {
          response.on("error", () => res.destroy());
          if (closing || res.destroyed) {
            response.destroy();
            return;
          }
          res.writeHead(response.statusCode ?? 500, response.headers);
          // Docker /wait exposes headers before exit; the CLI waits for them before /start.
          res.flushHeaders();
          const route = prefix(
            new URL(req.url ?? "/", "http://docker").pathname,
          );
          if (
            req.method === "POST" &&
            (/\/containers\/[^/]+\/exec$/.test(route) ||
              route === "/containers/create")
          ) {
            const result: Buffer[] = [];
            response.on("data", (c) => result.push(c));
            response.on("end", () => {
              const b = Buffer.concat(result);
              try {
                const id = JSON.parse(b.toString()).Id;
                if (id) {
                  if (route === "/containers/create") createdIds.add(id);
                  else execIds.add(id);
                }
              } catch {}
              res.end(b);
            });
          } else response.pipe(res);
        },
      );
      upstream.on("socket", trackSocket);
      req.once("aborted", () => upstream.destroy());
      res.once("close", () => {
        if (!res.writableFinished) upstream.destroy();
      });
      upstream.on("error", () => {
        if (closing || res.destroyed) return;
        if (!res.headersSent) res.writeHead(502);
        res.end('{"message":"Local Docker transport failed"}');
      });
      upstream.end(body);
    } catch (error) {
      if (closing || res.destroyed || req.socket.destroyed) return;
      if (denials.length < 20)
        denials.push(
          dockerRouteClass(req.method ?? "", req.url ?? "/") +
            ": " +
            (error instanceof GuardRefusal
              ? error.message
              : "Malformed Docker request refused"),
        );
      res.writeHead(403, { "content-type": "application/json" });
      res.end('{"message":"F2 Docker scope or binding refused"}');
    }
  });
  // CLI uses exec start with HTTP connection hijacking. Authorize known owned exec IDs first.
  const upgraded = new Set<net.Socket>();
  server.on("upgrade", async (req, client, head) => {
    let upstream: net.Socket | undefined;
    upgraded.add(client as net.Socket);
    client.on("error", () => upstream?.destroy());
    client.once("close", () => {
      upgraded.delete(client as net.Socket);
      upstream?.destroy();
    });
    try {
      if (closing || client.destroyed) {
        client.destroy();
        return;
      }
      const route = prefix(new URL(req.url ?? "/", "http://docker").pathname);
      const execution = route.match(/^\/exec\/([^/]+)\/start$/);
      const attach = route.match(/^\/containers\/([^/]+)\/attach$/);
      if (req.method !== "POST") {
        client.destroy();
        return;
      }
      if (execution && execIds.has(execution[1])) {
        /* exact owned exec registered above */
      } else if (attach)
        await assertOwnedContainer(decodeURIComponent(attach[1]));
      else {
        client.destroy();
        return;
      }
      if (closing || client.destroyed) return;
      upstream = net.createConnection({ path: originalSocket });
      trackSocket(upstream);
      const connected = upstream;
      connected.once("connect", () => {
        if (closing || client.destroyed) {
          connected.destroy();
          return;
        }
        connected.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
        for (const [key, value] of Object.entries(req.headers))
          if (value !== undefined)
            connected.write(
              `${key}: ${Array.isArray(value) ? value.join(", ") : value}\r\n`,
            );
        connected.write("\r\n");
        if (head.length) connected.write(head);
        client.pipe(connected).pipe(client);
      });
      connected.on("error", () => client.destroy());
    } catch {
      client.destroy();
    }
  });
  await new Promise<void>((ok, no) => {
    server.once("error", no);
    server.listen(socket, ok);
  });
  await chmod(socket, 0o600);
  return {
    dockerHost: `unix://${socket}`,
    denials,
    close: () =>
      (closePromise ??= (async () => {
        closing = true;
        const originalSocketsClosed = [...upstreamSockets].map((socket) =>
          socket.closed
            ? Promise.resolve()
            : new Promise<void>((ok) => socket.once("close", () => ok())),
        );
        const serverClosed = new Promise<void>((ok, no) =>
          server.close((error) => (error ? no(error) : ok())),
        );
        for (const socket of upgraded) socket.destroy();
        server.closeAllConnections();
        upstreamAgent.destroy();
        for (const socket of upstreamSockets) socket.destroy();
        await Promise.all([serverClosed, ...originalSocketsClosed]);
        await rm(dir, { recursive: true, force: true });
      })()),
  };
}
