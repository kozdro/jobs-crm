import { describe, expect, it } from "vitest";
import { normalizeAppOrigin } from "../../src/shared/validation/origin";
import { parseAuthConfig } from "../../src/shared/validation/auth-config";

const valid = {
  NEXT_PUBLIC_AUTH_ENABLED: "true",
  NEXT_PUBLIC_APP_ORIGIN: "https://crm.example.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
};

describe("canonical Auth origins", () => {
  it("normalizes case, default ports and optional root slash", () => {
    expect(normalizeAppOrigin("https://CRM.example.test:443/")).toBe(
      "https://crm.example.test",
    );
  });
  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:4317",
    "http://[::1]:3000",
  ])("allows exact local HTTP origin %s", (value) => {
    expect(normalizeAppOrigin(value)).toBe(value);
  });
  it.each([
    "http://example.test",
    "https://user:pass@example.test",
    "https://example.test/a/..",
    "https://example.test//",
    "https://example.test?",
    "https://example.test#",
    " https://example.test",
    "https://example.test\n",
    "https://example.test\\evil",
    "https://*.example.test",
    "javascript:alert(1)",
    "//example.test",
    "https://例え.test",
    "http://localhost.example.test",
    "http://127.0.0.2",
    "http://2130706433",
    "http://127.1",
    "http://0x7f000001",
    "https://example.test/%2e%2e",
  ])("rejects ambiguous/unsafe origin %j", (value) => {
    expect(() => normalizeAppOrigin(value)).toThrow("APP_ORIGIN");
  });
});

describe("explicit public Auth configuration", () => {
  it("keeps F1 services optional", () =>
    expect(parseAuthConfig({}).enabled).toBe(false));
  it("accepts publishable configuration", () =>
    expect(parseAuthConfig(valid)).toMatchObject({
      enabled: true,
      googleEnabled: false,
      localFixture: false,
    }));
  it("accepts legacy anon key but rejects service role", () => {
    const jwt = (role: string) =>
      `e30.${btoa(JSON.stringify({ role }))}.signature`;
    expect(
      parseAuthConfig({
        ...valid,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt("anon"),
      }).enabled,
    ).toBe(true);
    expect(() =>
      parseAuthConfig({
        ...valid,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt("service_role"),
      }),
    ).toThrow("Invalid public Auth configuration");
  });
  it("restricts unresolved signup/recovery policies to explicit local fixture", () => {
    expect(() =>
      parseAuthConfig({ ...valid, NEXT_PUBLIC_AUTH_LOCAL_TEST: "true" }),
    ).toThrow();
    expect(
      parseAuthConfig({
        ...valid,
        NEXT_PUBLIC_APP_ORIGIN: "https://localhost:3143",
        NEXT_PUBLIC_AUTH_LOCAL_TEST: "true",
      }).localFixture,
    ).toBe(true);
  });
  it("redacts configuration errors", () => {
    const secret = "sb_secret_synthetic-sensitive";
    expect(() =>
      parseAuthConfig({
        ...valid,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret,
      }),
    ).toThrow(/^Invalid public Auth configuration$/);
  });
});
