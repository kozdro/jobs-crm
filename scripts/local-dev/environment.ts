/** Explicit empty private values prevent Next dotenv from refilling inherited keys. */
export function localAppEnvironment(
  target: { appOrigin: string; apiUrl: string; anonKey: string },
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...base,
    APP_ENV: "development",
    JOBS_CRM_LOCAL_DEV: "true",
    APP_ORIGIN: target.appOrigin,
    NEXT_PUBLIC_APP_ORIGIN: target.appOrigin,
    NEXT_PUBLIC_AUTH_ENABLED: "true",
    NEXT_PUBLIC_AUTH_LOCAL_TEST: "true",
    NEXT_PUBLIC_SUPABASE_URL: target.apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: target.anonKey,
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "false",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_EXTRA_CA_CERTS: undefined,
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_SECRET_KEY: "",
    SUPABASE_SERVICE_KEY: "",
    SUPABASE_ACCESS_TOKEN: "",
    SUPABASE_DB_PASSWORD: "",
  };
}
