import { z } from "zod";

import { normalizeAppOrigin } from "./origin";

const envSchema = z
  .object({
    APP_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_ORIGIN: z
      .string()
      .transform((value, ctx) => {
        try {
          return normalizeAppOrigin(value);
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid APP_ORIGIN" });
          return z.NEVER;
        }
      })
      .optional(),
  })
  .refine(
    (env) => env.APP_ENV !== "production" || env.APP_ORIGIN !== undefined,
    {
      path: ["APP_ORIGIN"],
    },
  );

export type AppEnv = z.infer<typeof envSchema>;

/** Parses only technical scaffold configuration; errors never retain input values. */
export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  const result = envSchema.safeParse({
    APP_ENV: input.APP_ENV,
    APP_ORIGIN: input.APP_ORIGIN,
  });

  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path[0])),
    ];
    throw new Error(`Invalid environment configuration: ${fields.join(", ")}`);
  }

  return result.data;
}
