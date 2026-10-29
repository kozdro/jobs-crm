import { describe, expect, it } from "vitest";

import {
  callbackCode,
  callbackDestination,
  credentialsSchema,
  emailSchema,
  logoutScopeSchema,
} from "@/modules/identity/application/validation";

describe("AUTH-02/06 safe callback inputs", () => {
  it("accepts only the two exact app destinations", () => {
    expect(callbackDestination(null)).toBe("/account");
    expect(callbackDestination("/account")).toBe("/account");
    expect(callbackDestination("/reset-password")).toBe("/reset-password");
    for (const value of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "/account?next=https://evil.example",
      "/%2f%2fevil.example",
      "javascript:alert(1)",
      "/account#fragment",
      "/account/..",
      " /account",
      "\n/account",
    ])
      expect(callbackDestination(value)).toBeNull();
  });

  it("rejects absent or malformed codes without interpreting their contents", () => {
    for (const value of [null, "", "a b", "a\nb", "a\u0000b"])
      expect(callbackCode(value)).toBeNull();
    expect(callbackCode("opaque-provider-code_123")).toBe(
      "opaque-provider-code_123",
    );
  });
});

describe("AUTH-01/08/09/14 validation", () => {
  it("requires a valid email and nonempty password, without choosing a product password policy", () => {
    expect(
      credentialsSchema.safeParse({ email: "a@example.test", password: "x" })
        .success,
    ).toBe(true);
    expect(
      credentialsSchema.safeParse({ email: "broken", password: "x" }).success,
    ).toBe(false);
    expect(
      credentialsSchema.safeParse({ email: "a@example.test", password: "" })
        .success,
    ).toBe(false);
    expect(emailSchema.safeParse({ email: "broken" }).success).toBe(false);
  });
  it("requires an explicit native logout scope", () => {
    for (const scope of ["local", "global", "others"])
      expect(logoutScopeSchema.safeParse(scope).success).toBe(true);
    for (const scope of [undefined, "device-id", "all", ""])
      expect(logoutScopeSchema.safeParse(scope).success).toBe(false);
  });
});
