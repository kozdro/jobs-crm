import { describe, expect, it } from "vitest";
import { parseDocumentApplicationIntent } from "@/modules/documents/domain/application";

const id = "d9ae7f3a-7420-4b54-a3b3-ac1f8f0bf937";
const otherId = "5608bc31-e28f-4809-977e-a82049332dae";
const input = {
  contractVersion: 1,
  requestId: id,
  caseId: otherId,
  occurredOn: null,
  sentVersionIds: [id, otherId],
};

describe("application document intent", () => {
  it("allows multiple distinct version IDs and an unknown date", () => {
    expect(parseDocumentApplicationIntent(input)).toEqual(input);
  });
  it("rejects duplicate versions, including alternate UUID casing", () => {
    expect(
      parseDocumentApplicationIntent({
        ...input,
        sentVersionIds: [id, id.toUpperCase()],
      }),
    ).toBeNull();
  });
  it("rejects unexpected fields, absent dates and future dates", () => {
    expect(
      parseDocumentApplicationIntent({ ...input, extra: true }),
    ).toBeNull();
    expect(
      parseDocumentApplicationIntent({ ...input, occurredOn: undefined }),
    ).toBeNull();
    expect(
      parseDocumentApplicationIntent({ ...input, occurredOn: "2999-01-01" }),
    ).toBeNull();
  });
});
