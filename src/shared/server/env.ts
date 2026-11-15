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

/** Documents credentials are server-only and never part of the public config. */
export function getDocumentsSecrets() {
  return {
    permit: process.env.DOCUMENTS_PERMIT_SECRET,
    uploader: process.env.DOCUMENTS_UPLOADER_JWT,
    deleteAuthorizer: process.env.DOCUMENTS_DELETE_AUTHORIZER_JWT,
    validatorUrl: process.env.DOCUMENTS_VALIDATOR_URL,
    validatorServiceSecret: process.env.DOCUMENTS_VALIDATOR_SERVICE_SECRET,
  };
}
