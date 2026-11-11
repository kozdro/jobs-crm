import { createServer, request } from "node:http";
import { spawn } from "node:child_process";
function bridge(local, remote) {
  createServer((req, res) => {
    const out = request(
      {
        host: "proxy",
        port: remote,
        path: req.url,
        method: req.method,
        headers: req.headers,
        timeout: 60000,
      },
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
  }).listen(local, "127.0.0.1");
}
bridge(57121, 8081);
bridge(3174, 8082);
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "0.0.0.0",
    "--port",
    "3172",
  ],
  { stdio: "inherit", env: process.env },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
