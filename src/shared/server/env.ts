import "server-only";

import { parseEnv } from "@/shared/validation/env";

export function getServerEnv() {
  return parseEnv({
    APP_ENV: process.env.APP_ENV,
    APP_ORIGIN: process.env.APP_ORIGIN,
  });
}
