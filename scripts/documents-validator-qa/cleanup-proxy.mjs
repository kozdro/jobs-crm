import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { request } from "node:http";

const upstream = process.env.QA_KONG_HOST;
if (
  !/^supabase_kong_jobs-crm-recruitment-[a-f0-9]{6}-[a-f0-9]{12}$/.test(
    upstream ?? "",
  )
)
  throw new Error("Invalid QA upstream");
const rpc = new Set([
  "/rest/v1/rpc/enqueue_abandoned_documents",
  "/rest/v1/rpc/list_document_cleanup",
  "/rest/v1/rpc/confirm_document_cleanup",
  "/rest/v1/rpc/purge_expired_document_ledgers",
]);
createServer(
  { key: readFileSync("/app/proxy.key"), cert: readFileSync("/app/proxy.crt") },
  (req, res) => {
    const path = req.url ?? "";
    if (!(
      (req.method === "POST" && rpc.has(path)) ||
      (req.method === "DELETE" && path === "/storage/v1/object/documents")
    )) {
      res.writeHead(403).end();
      return;
    }
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
      {
        host: upstream,
        port: 8000,
        method: req.method,
        path,
        headers,
        timeout: 30000,
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, {
          "content-type":
            response.headers["content-type"] ?? "application/json",
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
  },
).listen(8081, "0.0.0.0");
