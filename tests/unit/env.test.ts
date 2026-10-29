import { describe, expect, it } from "vitest";

import { parseEnv } from "../../src/shared/validation/env";

describe("technical environment parser", () => {
  it("runs the scaffold without any service credentials or local env", () => {
    expect(parseEnv({})).toEqual({ APP_ENV: "development" });
  });

  it.each(["development", "test", "production"])(
    "accepts %s with an explicit origin",
    (APP_ENV) => {
      expect(
        parseEnv({ APP_ENV, APP_ORIGIN: "https://crm.example.test" }),
      ).toEqual({
        APP_ENV,
        APP_ORIGIN: "https://crm.example.test",
      });
    },
  );

  it("accepts a local custom port without choosing a production target", () => {
    expect(parseEnv({ APP_ORIGIN: "http://127.0.0.1:4317" }).APP_ORIGIN).toBe(
      "http://127.0.0.1:4317",
    );
  });

  it("requires an explicit origin for explicitly selected production configuration", () => {
    expect(() => parseEnv({ APP_ENV: "production" })).toThrow("APP_ORIGIN");
  });

  it.each(["", "staging", "Production"])(
    "rejects invalid APP_ENV %j",
    (APP_ENV) => {
      expect(() => parseEnv({ APP_ENV })).toThrow("APP_ENV");
    },
  );

  it.each([
    "",
    "not a url",
    "ftp://example.test",
    "https://user:password@example.test",
    "https://example.test/path",
    "https://example.test?secret=value",
    "https://example.test#fragment",
  ])("rejects invalid APP_ORIGIN %j", (APP_ORIGIN) => {
    expect(() => parseEnv({ APP_ORIGIN })).toThrow("APP_ORIGIN");
  });

  it("ignores unrelated variables and never returns secrets", () => {
    expect(
      parseEnv({
        DATABASE_URL: "synthetic-secret",
        NEXT_PUBLIC_SECRET: "synthetic-secret",
      }),
    ).toEqual({ APP_ENV: "development" });
  });

  it("reports invalid names without input, nested causes or a Zod error", () => {
    const secret = "synthetic-private-value";
    try {
      parseEnv({ APP_ENV: secret, APP_ORIGIN: secret });
      expect.fail("Invalid env must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        "Invalid environment configuration: APP_ENV, APP_ORIGIN",
      );
      expect(String(error)).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain(secret);
      expect((error as Error).cause).toBeUndefined();
    }
  });
});
