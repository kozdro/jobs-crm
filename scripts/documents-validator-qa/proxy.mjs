// Narrow bridge between the validator-only network and the owned Supabase target.
import { createServer, request } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync } from "node:fs";

const upstream = process.env.QA_KONG_HOST;
if (
  !/^supabase_kong_jobs-crm-recruitment-[a-f0-9]{6}-[a-f0-9]{12}$/.test(
    upstream ?? "",
  )
)
  throw new Error("Invalid QA upstream");

function forward(req, res, host, port) {
  const headers = {};
  for (const name of [
    "authorization",
    "apikey",
    "content-type",
    "content-length",
    "accept",
  ])
    if (req.headers[name]) headers[name] = req.headers[name];
  const out = request(
    { host, port, method: req.method, path: req.url, headers, timeout: 30000 },
    (response) => {
      res.writeHead(response.statusCode ?? 502, {
        "content-type": response.headers["content-type"] ?? "application/json",
        "cache-control": "no-store",
      });
      response.pipe(res);
    },
  );
  out.on("timeout", () => out.destroy());
  out.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(out);
}

// Only the host loopback binding forwards the BFF's authenticated RPC.
createServer((req, res) => {
  if (!(
    (req.method === "POST" && req.url === "/validate") ||
    (req.method === "GET" && req.url === "/health")
  )) {
    res.writeHead(404).end();
    return;
  }
  forward(req, res, "validator", 8080);
}).listen(8080, "0.0.0.0");

// No generic forwarding, redirects, URLs, queries, or unapproved Storage operations.
const allowedRpc = new Set([
  "/rest/v1/rpc/document_validator_target",
  "/rest/v1/rpc/finalize_document_upload",
  "/rest/v1/rpc/reject_document_upload",
]);
createHttpsServer(
  { key: readFileSync("/app/proxy.key"), cert: readFileSync("/app/proxy.crt") },
  (req, res) => {
    const path = req.url ?? "";
    const storage = /^\/storage\/v1\/object\/documents\/[a-f0-9-]{36}$/.test(
      path,
    );
    if (!(
      (req.method === "POST" && allowedRpc.has(path)) ||
      (req.method === "GET" && storage)
    )) {
      res.writeHead(403).end();
      return;
    }
    forward(req, res, upstream, 8000);
  },
).listen(8081, "0.0.0.0");
