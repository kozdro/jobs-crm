import { createServer, request } from "node:http";
const kong = process.env.QA_KONG_HOST;
const validator = process.env.QA_VALIDATOR_HOST;
if (
  !/^supabase_kong_jobs-crm-recruitment-[a-f0-9]{6}-[a-f0-9]{12}$/.test(
    kong ?? "",
  ) ||
  !/^documents-validator-proxy-[a-f0-9]{12}$/.test(validator ?? "")
)
  throw new Error("Invalid QA endpoints");
function forward(req, res, host, port) {
  const headers = { ...req.headers, host: req.headers.host };
  const out = request(
    { host, port, path: req.url, method: req.method, headers, timeout: 60000 },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
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
createServer((req, res) => forward(req, res, "bff", 3172)).listen(
  8080,
  "0.0.0.0",
);
createServer((req, res) => forward(req, res, kong, 8000)).listen(
  8081,
  "0.0.0.0",
);
createServer((req, res) => {
  if (!(
    (req.method === "POST" && req.url === "/validate") ||
    (req.method === "GET" && req.url === "/health")
  )) {
    res.writeHead(403).end();
    return;
  }
  forward(req, res, validator, 8080);
}).listen(8082, "0.0.0.0");
