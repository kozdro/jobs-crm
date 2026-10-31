import { describe, expect, it } from "vitest";
import {
  normalizedCatalogName,
  normalizedCatalogEmail,
  parseCatalogCommand,
} from "@/modules/companies-contacts/domain/catalog";
const requestId = "11111111-1111-4111-8111-111111111111";
const profileId = "22222222-2222-4222-8222-222222222222";
const create = {
  requestId,
  operation: "create-profile",
  profileType: "contact",
  name: "  Osoba A  ",
  email: "  A.Example+tag@example.test  ",
};
describe("DEC-058 catalog validation and uncertain identity", () => {
  it("normalizes NFC and whitespace without erasing Polish identity or legal suffixes", () => {
    expect(normalizedCatalogName("  Z\u0307ółć\u00a0\n Sp. z o.o. ")).toBe(
      "żółć sp. z o.o.",
    );
    expect(normalizedCatalogName("Żółć")).not.toBe(
      normalizedCatalogName("Zolc"),
    );
    expect(normalizedCatalogEmail(" A.Example+tag@EXAMPLE.TEST ")).toBe(
      "a.example+tag@example.test",
    );
  });
  it("preserves display values and optional absence", () => {
    expect(parseCatalogCommand(create)).toEqual({
      ...create,
      name: "Osoba A",
      email: "A.Example+tag@example.test",
    });
    expect(parseCatalogCommand({ ...create, email: " " })?.email).toBeNull();
    expect(
      parseCatalogCommand({ ...create, email: undefined })?.email,
    ).toBeNull();
  });
  it("checks code points instead of UTF16 units and exact approved lengths", () => {
    expect(
      parseCatalogCommand({ ...create, name: "😀".repeat(160) }),
    ).not.toBeNull();
    expect(
      parseCatalogCommand({ ...create, name: "😀".repeat(161) }),
    ).toBeNull();
    expect(parseCatalogCommand({ ...create, name: " \n " })).toBeNull();
    expect(
      parseCatalogCommand({
        ...create,
        email: "x".repeat(242) + "@example.test",
      }),
    ).toBeNull();
  });
  it.each([
    "bad",
    "a@@example.test",
    "a@b",
    "a b@example.test",
    "a\u00a0b@example.test",
  ])("rejects invalid address %s", (email) =>
    expect(parseCatalogCommand({ ...create, email })).toBeNull(),
  );
  it("does not permit email on organizations or client authority fields", () => {
    expect(
      parseCatalogCommand({ ...create, profileType: "organization" }),
    ).toBeNull();
    expect(parseCatalogCommand({ ...create, owner_id: profileId })).toBeNull();
    expect(
      parseCatalogCommand({ ...create, result: { kind: "saved" } }),
    ).toBeNull();
  });
  it("requires expected versions for corrections and checks operation-specific shape", () => {
    expect(
      parseCatalogCommand({ ...create, operation: "edit-profile", profileId }),
    ).toBeNull();
    expect(
      parseCatalogCommand({
        ...create,
        operation: "edit-profile",
        profileId,
        expectedRevision: 0,
      }),
    ).not.toBeNull();
    expect(parseCatalogCommand({ ...create, profileId })).toBeNull();
    expect(
      parseCatalogCommand({
        requestId,
        operation: "detach",
        relationId: profileId,
        expectedRevision: 0,
        name: "x",
      }),
    ).toBeNull();
    expect(
      parseCatalogCommand({
        requestId,
        operation: "detach",
        relationId: profileId,
        expectedRevision: 0,
      }),
    ).not.toBeNull();
  });
  it("keeps contextual role only on case-organization and all relation ends explicit", () => {
    const relation = {
      requestId,
      operation: "attach",
      relationType: "case-organization",
      leftId: requestId,
      rightId: profileId,
    };
    expect(parseCatalogCommand(relation)).toBeNull();
    expect(parseCatalogCommand({ ...relation, role: "agency" })).not.toBeNull();
    expect(
      parseCatalogCommand({
        ...relation,
        relationType: "organization-contact",
        role: "agency",
      }),
    ).toBeNull();
    expect(
      parseCatalogCommand({
        ...relation,
        relationType: "organization-contact",
      }),
    ).not.toBeNull();
    expect(
      parseCatalogCommand({
        ...relation,
        relationType: "case-contact",
        rightId: "bad",
      }),
    ).toBeNull();
  });
  it("accepts explicit duplicate version acknowledgments without using them as identity", () => {
    expect(
      parseCatalogCommand({
        ...create,
        acknowledgedMatches: [`${profileId}:2`],
      }),
    ).not.toBeNull();
    expect(
      parseCatalogCommand({ ...create, acknowledgedMatches: [profileId] }),
    ).toBeNull();
  });
});
