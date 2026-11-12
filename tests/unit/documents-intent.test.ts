import { describe, expect, it } from "vitest";
import {
  documentIntentDigest,
  parseDocumentIntent,
} from "@/modules/documents/application/document-intent";
import { parseSentIntent } from "@/modules/documents/application/sent-intent";
const a = "d9ae7f3a-7420-4b54-a3b3-ac1f8f0bf937";
const b = "5608bc31-e28f-4809-977e-a82049332dae";
describe("document command intents", () => {
  it("normalizes metadata and binds each correction to its revision", () => {
    const first = parseDocumentIntent({
      action: "rename",
      documentId: a,
      revision: 0,
      name: " CV ",
      isCv: true,
    });
    const next = parseDocumentIntent({
      action: "rename",
      documentId: a,
      revision: 1,
      name: "CV",
      isCv: true,
    });
    expect(first?.name).toBe("CV");
    expect(first && next && documentIntentDigest(first)).not.toBe(
      next && documentIntentDigest(next),
    );
    expect(
      parseDocumentIntent({
        action: "rename",
        documentId: a,
        revision: 0,
        name: "CV",
        isCv: true,
        extra: 1,
      }),
    ).toBeNull();
  });
  it("rejects repeated sent versions irrespective of UUID case", () => {
    expect(
      parseSentIntent({
        action: "sent-add",
        caseId: a,
        eventId: b,
        eventRevision: 0,
        versionIds: [a, a.toUpperCase()],
      }),
    ).toBeNull();
    expect(
      parseSentIntent({
        action: "sent-add",
        caseId: a,
        eventId: b,
        eventRevision: 0,
        versionIds: [a, b],
      }),
    ).not.toBeNull();
  });
});
