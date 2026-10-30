import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The repository harness owns AGENTS.md; local start must preserve that contract.
  agentRules: false,
  // Keep persistent manual DEV artifacts separate from disposable CI/test builds.
  distDir:
    process.env.JOBS_CRM_LOCAL_DEV === "true" ? ".local-dev/next" : ".next",
};

export default nextConfig;
