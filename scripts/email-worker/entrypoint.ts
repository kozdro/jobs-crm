import postgres from "postgres";
import { readWorkerConfig } from "./entrypoint-config.ts";
import { createResendTransport } from "./transport-resend.ts";
import { runWorker } from "./loop.ts";

async function main(): Promise<void> {
  const config = readWorkerConfig(process.env);
  const transport = createResendTransport({
    apiKey: config.apiKey,
    from: config.from,
  });
  // Startup role applies to every reconnection; the login itself must hold this role.
  const sql = postgres(config.databaseUrl, {
    max: 1,
    ssl: "verify-full",
    connection: {
      role: "jobs_email_worker",
      application_name: "jobs-email-worker",
    },
    onnotice: () => {},
  });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    const [identity] = await sql<
      { role: string }[]
    >`select current_user as role`;
    if (identity?.role !== "jobs_email_worker")
      throw new Error("Invalid worker role");
    await runWorker(sql, transport, config.applicationUrl, controller.signal);
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    await sql.end({ timeout: 20 });
  }
}

main().catch(() => {
  process.stderr.write(
    "Email worker stopped due to a configuration or runtime error.\n",
  );
  process.exitCode = 1;
});
