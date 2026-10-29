import { z } from "zod";

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

const envSchema = z
  .object({
    APP_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_ORIGIN: z.string().refine(isHttpOrigin).optional(),
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
