export interface WorkerConfig {
  databaseUrl: string;
  apiKey: string;
  from: string;
  applicationUrl: URL;
}

/** Keep secrets in memory; failures never include environment values. */
export function readWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const databaseUrl = env.EMAIL_WORKER_DATABASE_URL;
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  const appOrigin = env.APP_ORIGIN;
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
    throw new Error("Invalid worker configuration");
  if (!databaseUrl || !apiKey || !from || !appOrigin)
    throw new Error("Missing worker configuration");
  let db: URL;
  let applicationUrl: URL;
  try {
    db = new URL(databaseUrl);
    applicationUrl = new URL(appOrigin);
  } catch {
    throw new Error("Invalid worker configuration");
  }
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    !db.hostname ||
    !db.username ||
    !db.password ||
    !db.pathname ||
    db.pathname === "/" ||
    db.search ||
    db.hash ||
    applicationUrl.protocol !== "https:" ||
    applicationUrl.username ||
    applicationUrl.password ||
    applicationUrl.pathname !== "/" ||
    applicationUrl.search ||
    applicationUrl.hash ||
    !/^re_[A-Za-z0-9_-]+$/.test(apiKey) ||
    !from.trim() ||
    /[\r\n]/.test(from)
  )
    throw new Error("Invalid worker configuration");
  return { databaseUrl, apiKey, from, applicationUrl };
}
