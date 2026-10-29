import { defineConfig } from "drizzle-kit";
// Product model only. No credentials: migrate exclusively through the guarded local runner.
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/recruitment/schema.ts",
  out: "./db/recruitment/migrations",
  schemaFilter: ["public"],
  migrations: {
    schema: "recruitment_migrations",
    table: "__drizzle_migrations",
  },
  strict: true,
  verbose: true,
});
