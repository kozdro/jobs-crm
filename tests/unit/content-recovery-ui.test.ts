import { describe, expect, it } from "vitest";
import {
  contentReceiptMatches,
  sameContentIntent,
  type ContentCommand,
} from "@/components/recruitment/content-recovery";
const caseId = "00000000-0000-4000-8000-000000000001";
const noteId = "00000000-0000-4000-8000-000000000002";
const command: ContentCommand = {
  requestId: "00000000-0000-4000-8000-000000000003",
  payload: {
    operation: "correct-note",
    caseId,
    id: noteId,
    expectedRevision: 2,
    body: "Prawdziwa treść",
    dateKind: "historical",
    occurredOn: null,
  },
};
const result = {
  kind: "saved",
  note: {
    id: noteId,
    case_id: caseId,
    body: "Prawdziwa treść",
    date_kind: "historical",
    occurred_on: null,
    revision: 3,
    voided: false,
  },
};
describe("content recovery frozen intent", () => {
  it("requires the full original payload and request id", () => {
    expect(sameContentIntent(command, structuredClone(command))).toBe(true);
    expect(
      sameContentIntent(command, {
        ...command,
        payload: { ...command.payload, body: "Inna treść" },
      }),
    ).toBe(false);
    expect(sameContentIntent(command, { ...command, requestId: noteId })).toBe(
      false,
    );
  });
  it("only accepts a matching owner-scoped case receipt and revision", () => {
    expect(contentReceiptMatches(command, result, caseId)).toBe(true);
    expect(
      contentReceiptMatches(
        command,
        { ...result, note: { ...result.note, body: "Inna treść" } },
        caseId,
      ),
    ).toBe(false);
    expect(
      contentReceiptMatches(
        command,
        { ...result, note: { ...result.note, revision: 2 } },
        caseId,
      ),
    ).toBe(false);
    expect(
      contentReceiptMatches(
        command,
        { ...result, note: { ...result.note, case_id: noteId } },
        caseId,
      ),
    ).toBe(false);
    expect(contentReceiptMatches(command, { kind: "saved" }, caseId)).toBe(
      false,
    );
  });
  it("checks source and canonical URL on corrected links", () => {
    const link: ContentCommand = {
      requestId: command.requestId,
      payload: {
        operation: "correct-link",
        caseId,
        id: noteId,
        source: "legacy",
        expectedRevision: 0,
        url: "https://example.test",
        role: "unspecified",
        position: 2,
      },
    };
    const response = {
      kind: "replayed",
      link: {
        id: noteId,
        case_id: caseId,
        source: "legacy",
        revision: 1,
        url: "https://example.test/",
        role: "unspecified",
        position: 2,
        voided: false,
      },
    };
    expect(contentReceiptMatches(link, response, caseId)).toBe(true);
    expect(
      contentReceiptMatches(
        link,
        { ...response, link: { ...response.link, source: "additional" } },
        caseId,
      ),
    ).toBe(false);
  });
});
