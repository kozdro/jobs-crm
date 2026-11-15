import { createHash, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Worker } from "node:worker_threads";
import { createClient } from "@supabase/supabase-js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest = /^[0-9a-f]{64}$/;
const maxBytes = 20 * 1024 * 1024;

async function body(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const item = Buffer.from(chunk);
    size += item.length;
    if (size > 4096) throw new Error("Invalid request");
    chunks.push(item);
  }
  const raw: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid request");
  const payload = raw as Record<string, unknown>;
  if (
    Object.keys(payload).length !== 1 ||
    typeof payload.versionId !== "string" ||
    !uuid.test(payload.versionId)
  )
    throw new Error("Invalid request");
  return payload.versionId;
}

async function inspect(
  bytes: Uint8Array,
  filename: string,
  mime: string,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./inspect.ts", import.meta.url), {
      env: {},
      execArgv: [],
      workerData: { bytes, filename, mime },
      resourceLimits: {
        maxOldGenerationSizeMb: 256,
        maxYoungGenerationSizeMb: 32,
        stackSizeMb: 4,
      },
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("Validation timed out"));
    }, 30000);
    worker.once("message", (message: unknown) => {
      clearTimeout(timer);
      if (
        !message ||
        typeof message !== "object" ||
        typeof (message as { valid?: unknown }).valid !== "boolean"
      ) {
        reject(new Error("Validator unavailable"));
        return;
      }
      resolve((message as { valid: boolean }).valid);
    });
    worker.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Validator unavailable"));
    });
    worker.once("exit", (code) => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(new Error("Validator unavailable"));
      }
    });
  });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = process.env.DOCUMENTS_VALIDATOR_JWT;
  const secret = process.env.DOCUMENTS_VALIDATOR_SERVICE_SECRET;
  const port = Number(process.env.DOCUMENTS_VALIDATOR_PORT);
  const host = process.env.DOCUMENTS_VALIDATOR_HOST ?? "127.0.0.1";
  if (
    !url ||
    !key ||
    !token ||
    !secret ||
    Buffer.byteLength(secret) < 32 ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !["127.0.0.1", "::1", "0.0.0.0"].includes(host)
  )
    throw new Error("Validator configuration unavailable");
  const target = new URL(url);
  if (
    target.username ||
    target.password ||
    (target.protocol !== "https:" &&
      !(
        target.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
      ))
  )
    throw new Error("Validator transport unavailable");
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  let active = 0;
  const waiting: Array<() => void> = [];
  async function acquire() {
    if (active < 2) {
      active++;
      return;
    }
    if (waiting.length >= 100) throw new Error("Validator busy");
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  function release() {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
  function reply(response: ServerResponse, status: number, value: unknown) {
    response.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(JSON.stringify(value));
  }
  const server = createServer((request, response) => {
    void (async () => {
      if (!(
        (request.method === "POST" && request.url === "/validate") ||
        (request.method === "GET" && request.url === "/health")
      ))
        return reply(response, 404, { kind: "not-found" });
      const authorization = request.headers.authorization ?? "";
      const expected = Buffer.from(`Bearer ${secret}`),
        actual = Buffer.from(authorization);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        return reply(response, 403, { kind: "forbidden" });
      if (request.method === "GET") {
        const probe = await client.rpc("document_validator_target", {
          p_version_id: "00000000-0000-4000-8000-000000000000",
        });
        return probe.error
          ? reply(response, 503, { kind: "unavailable" })
          : reply(response, 200, { kind: "ready" });
      }
      const versionId = await body(request);
      await acquire();
      try {
        const target = await client.rpc("document_validator_target", {
          p_version_id: versionId,
        });
        const row = target.data;
        if (
          target.error ||
          !row ||
          row.versionId !== versionId ||
          typeof row.objectKey !== "string" ||
          !uuid.test(row.objectKey) ||
          typeof row.filename !== "string" ||
          typeof row.mime !== "string" ||
          !Number.isSafeInteger(row.bytes) ||
          row.bytes < 1 ||
          row.bytes > maxBytes ||
          typeof row.sha256 !== "string" ||
          !digest.test(row.sha256)
        )
          return reply(response, 503, { kind: "unavailable" });
        const downloaded = await client.storage
          .from("documents")
          .download(row.objectKey);
        if (downloaded.error || !downloaded.data)
          return reply(response, 503, { kind: "unavailable" });
        if (downloaded.data.size < 1 || downloaded.data.size > maxBytes) {
          const rejected = await client.rpc("reject_document_upload", {
            p_version_id: versionId,
          });
          return rejected.error || rejected.data?.kind !== "queued"
            ? reply(response, 503, { kind: "unavailable" })
            : reply(response, 422, { kind: "invalid" });
        }
        const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
        const matches =
          bytes.byteLength === row.bytes &&
          createHash("sha256").update(bytes).digest("hex") === row.sha256;
        const valid = matches && (await inspect(bytes, row.filename, row.mime));
        if (!valid) {
          const rejected = await client.rpc("reject_document_upload", {
            p_version_id: versionId,
          });
          if (rejected.error || rejected.data?.kind !== "queued")
            return reply(response, 503, { kind: "unavailable" });
          return reply(response, 422, { kind: "invalid" });
        }
        const result = await client.rpc("finalize_document_upload", {
          p_version_id: versionId,
          p_bytes: bytes.byteLength,
          p_mime: row.mime,
          p_sha256: row.sha256,
        });
        if (
          result.error ||
          result.data?.kind !== "ready" ||
          result.data.versionId !== versionId
        )
          return reply(response, 503, { kind: "unavailable" });
        return reply(response, 200, { kind: "ready", versionId });
      } finally {
        release();
      }
    })().catch(() => {
      if (!response.headersSent) reply(response, 503, { kind: "unavailable" });
      else response.destroy();
    });
  });
  server.listen(port, host);
  const stop = () => server.close();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
main().catch(() => {
  process.stderr.write("Documents validator unavailable.\n");
  process.exitCode = 1;
});
