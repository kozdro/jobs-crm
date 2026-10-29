import { describe, expect, it } from "vitest";
import {
  parseCreateCaseInput,
  recruitmentStatuses,
  unicodeLength,
} from "@/modules/recruitment/domain/recruitment-case";

const requestId = "00000000-0000-4000-8000-000000000001";
const create = (extra: Record<string, unknown> = {}) =>
  parseCreateCaseInput({ requestId, title: "Kontakt z rekruterem", ...extra });

describe("DEC-052 minimal case input", () => {
  it("requires only title and technical request ID, with saved status owned by DB", () => {
    expect(create()).toEqual({
      success: true,
      data: {
        requestId,
        title: "Kontakt z rekruterem",
        description: null,
        sourceUrl: null,
        allowDuplicate: false,
      },
    });
    expect(recruitmentStatuses).toEqual([
      "Zapisane",
      "Kontakt rozpoczęty",
      "W rekrutacji",
      "Zakończone",
    ]);
  });
  it.each([
    null,
    undefined,
    "",
    "  \t\n",
    "\u00a0\u2003\ufeff",
    "ą".repeat(161),
    1,
  ])("rejects missing/blank/oversized title: %s", (title) => {
    expect(create({ title })).toMatchObject({
      success: false,
      errors: { title: expect.any(String) },
    });
  });
  it("counts Polish and supplementary Unicode as PostgreSQL codepoints, preserving case/NFD", () => {
    const title = "ą😀".repeat(80);
    expect(unicodeLength(title)).toBe(160);
    expect(title.length).toBe(240);
    expect(create({ title })).toMatchObject({ success: true, data: { title } });
    expect(create({ title: `${title}ż` })).toMatchObject({ success: false });
    expect(
      create({ title: "\u00a0\tPraca e\u0301\u2003\ufeff" }),
    ).toMatchObject({ success: true, data: { title: "Praca e\u0301" } });
  });
  it("trims optional descriptions to absence and enforces 2000 codepoints", () => {
    for (const description of [undefined, null, "", " \u00a0\ufeff"])
      expect(create({ description })).toMatchObject({
        success: true,
        data: { description: null },
      });
    const description = "ł🚀".repeat(1000);
    expect(create({ description })).toMatchObject({
      success: true,
      data: { description },
    });
    expect(create({ description: description + "ć" })).toMatchObject({
      success: false,
    });
    expect(create({ description: 22 })).toMatchObject({ success: false });
  });
  it.each(["\0", "\ud800", "\udfff"])(
    "rejects text PostgreSQL cannot store",
    (bad) => {
      expect(create({ title: `test${bad}` })).toMatchObject({ success: false });
      expect(create({ description: `test${bad}` })).toMatchObject({
        success: false,
      });
    },
  );
  it("normalizes HTTP URLs without dropping query identifiers or fragment", () => {
    expect(
      create({
        sourceUrl:
          "  HTTPS://EXAMPLE.INVALID:443/jobs?id=42&source=keep#publication  ",
      }),
    ).toMatchObject({
      success: true,
      data: {
        sourceUrl: "https://example.invalid/jobs?id=42&source=keep#publication",
      },
    });
    expect(create({ sourceUrl: "http://example.invalid" })).toMatchObject({
      success: true,
      data: { sourceUrl: "http://example.invalid/" },
    });
    expect(
      create({ sourceUrl: "https://example.invalid/oferta żółć" }),
    ).toMatchObject({
      success: true,
      data: { sourceUrl: new URL("https://example.invalid/oferta żółć").href },
    });
    expect(
      create({ sourceUrl: "https://[2001:db8::1]:65535/path" }),
    ).toMatchObject({ success: true });
    expect(
      create({ sourceUrl: "https://example.invalid/" + "a".repeat(10000) }),
    ).toMatchObject({ success: true });
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///tmp/x",
    "ftp://example.invalid",
    "/relative",
    "https://",
    "https:example.invalid",
    "https:\\example.invalid",
    "https://example.invalid\\foo",
    "https://example.invalid/with\nline",
    "https://[:::]/",
    "https://example.invalid:65536/",
    "https://bad host/",
    "https://foo:port/",
  ])("rejects unsafe or malformed URL %s", (sourceUrl) => {
    expect(create({ sourceUrl })).toMatchObject({
      success: false,
      errors: { sourceUrl: expect.any(String) },
    });
  });
  it("accepts absent URL and explicit duplicate decision, rejecting authority injection", () => {
    for (const sourceUrl of [undefined, null, "", "  "])
      expect(create({ sourceUrl })).toMatchObject({
        success: true,
        data: { sourceUrl: null },
      });
    expect(create({ allowDuplicate: true })).toMatchObject({
      success: true,
      data: { allowDuplicate: true },
    });
    for (const extra of [
      { owner_id: requestId },
      { status: "W rekrutacji" },
      { created_at: "2000-01-01" },
      { expectedUserId: requestId },
      { allowDuplicate: "true" },
      { requestId: "bad" },
    ])
      expect(create(extra)).toMatchObject({ success: false });
  });
});
