import { defineConfig } from "drizzle-kit";

// Synthetic Foundation F2 only. No database credentials: apply via the guarded runner.
export default defineConfig({
  dialect: "postgresql",
  schema: "./experiments/foundation/rls/schema.ts",
  out: "./experiments/foundation/rls/migrations",
  schemaFilter: ["foundation_poc"],
  migrations: {
    schema: "foundation_migrations",
    table: "__drizzle_migrations",
  },
  strict: true,
  verbose: true,
});
