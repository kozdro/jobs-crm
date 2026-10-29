import "server-only";

import { parseEnv } from "@/shared/validation/env";

export function getServerEnv() {
  return parseEnv({
    APP_ENV: process.env.APP_ENV,
    APP_ORIGIN: process.env.APP_ORIGIN,
  });
}

import { getPublicAuthConfig } from "../public/auth-config";

export function getAuthConfig() {
  const config = getPublicAuthConfig();
  if (config.enabled) {
    const env = getServerEnv();
    if (!env.APP_ORIGIN || env.APP_ORIGIN !== config.origin) {
      throw new Error("Auth APP_ORIGIN configuration mismatch");
    }
  }
  return config;
}
