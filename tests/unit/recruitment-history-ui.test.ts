import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CaseHistory } from "@/components/recruitment/case-history";
import { HistoryCorrections } from "@/components/recruitment/history-corrections";
import {
  parseHistoryIntent,
  clearMatchingHistoryIntent,
  isHistoryPreview,
  isHistoryRevision,
  revisionMatchesIntent,
} from "@/components/recruitment/history-intent";
import type { CaseEvent } from "@/modules/recruitment/domain/case-events";
import type { HistoryRevision } from "@/modules/recruitment/domain/history-corrections";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const ownerId = "00000000-0000-4000-8000-000000000001";
const caseId = "00000000-0000-4000-8000-000000000002";
const requestId = "00000000-0000-4000-8000-000000000003";
const event: CaseEvent = {
  id: "00000000-0000-4000-8000-000000000004",
  case_id: caseId,
  kind: "invitation",
  direction: null,
  occurred_on: null,
  recorded_at: "2026-10-30T12:00:00Z",
  stage_name: "Rozmowa <script>",
  previous_stage: "Pierwotna nazwa",
  expected_stage_version: 0,
  revision: 1,
  voided: false,
};
const values = {
  occurredOn: null,
  direction: null,
  stageName: "Poprawna nazwa",
  voided: false,
} as const;
const revision: HistoryRevision = {
  id: requestId,
  event_id: event.id,
  case_id: caseId,
  operation: "correct",
  revision: 1,
  recorded_at: event.recorded_at,
  before: { ...values, stageName: "Pierwotna nazwa" },
  after: values,
  status: "W rekrutacji",
  current_stage: values.stageName,
  expected_case_revision: 2,
  expected_event_revision: 0,
};
const intent = {
  caseId,
  eventId: event.id,
  requestId,
  operation: "correct" as const,
  occurredOn: null,
  direction: null,
  stageName: values.stageName,
  expectedCaseRevision: 2,
  expectedEventRevision: 0,
};

describe("History correction recovery isolation", () => {
  it("restores identifiers only for the same account and case", () => {
    const ids = { ownerId, caseId, eventId: event.id, requestId };
    expect(parseHistoryIntent(JSON.stringify(ids), ownerId, caseId)).toEqual(
      ids,
    );
    for (const raw of [
      null,
      "broken",
      "[]",
      JSON.stringify({ ...ids, ownerId: caseId }),
      JSON.stringify({ ...ids, caseId: ownerId }),
      JSON.stringify({ ...ids, eventId: "invalid" }),
      JSON.stringify({ ...ids, stageName: "private draft" }),
    ])
      expect(parseHistoryIntent(raw, ownerId, caseId)).toBeNull();
  });
  it("restores only an exact frozen owner-bound command, retaining read-only identifiers for legacy or damaged commands", () => {
    const ids = { ownerId, caseId, eventId: event.id, requestId };
    const saved = { ...ids, command: intent };
    expect(parseHistoryIntent(JSON.stringify(saved), ownerId, caseId)).toEqual(
      saved,
    );
    for (const command of [
      { ...intent, caseId: ownerId },
      { ...intent, eventId: requestId },
      { ...intent, requestId: ownerId },
      { ...intent, expectedCaseRevision: -1 },
      { ...intent, expectedEventRevision: 2.5 },
      { ...intent, operation: "delete" },
      { ...intent, occurredOn: "2000-02-30" },
      { ...intent, stageName: "  normalized differently  " },
      { ...intent, ownerId },
      { ...intent, reason: "not authorized" },
    ]) {
      expect(
        parseHistoryIntent(
          JSON.stringify({ ...ids, command }),
          ownerId,
          caseId,
        ),
      ).toEqual(ids);
    }
    expect(
      parseHistoryIntent(JSON.stringify(saved), caseId, caseId),
    ).toBeNull();
    expect(
      parseHistoryIntent(JSON.stringify(saved), ownerId, ownerId),
    ).toBeNull();
  });
  it("only clears the exact stored owner/case/event/request intention, leaving newer payloads untouched", () => {
    const ids = { ownerId, caseId, eventId: event.id, requestId };
    const saved = { ...ids, command: intent };
    let raw: string | null = JSON.stringify(saved);
    const storage = {
      getItem: vi.fn(() => raw),
      removeItem: vi.fn(() => {
        raw = null;
      }),
    };
    for (const expected of [
      { ...ids, ownerId: caseId },
      { ...ids, caseId: ownerId },
      { ...ids, eventId: ownerId },
      { ...ids, requestId: ownerId },
    ])
      expect(clearMatchingHistoryIntent(storage, "pending", expected)).toBe(
        false,
      );
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(raw).toBe(JSON.stringify(saved));
    // A resolved old response A must not consume pending command B after remount.
    raw = JSON.stringify({
      ...saved,
      requestId: ownerId,
      command: { ...intent, requestId: ownerId },
    });
    expect(clearMatchingHistoryIntent(storage, "pending", ids)).toBe(false);
    expect(storage.removeItem).not.toHaveBeenCalled();
    raw = JSON.stringify(saved);
    expect(clearMatchingHistoryIntent(storage, "pending", ids)).toBe(true);
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith("pending");
    expect(clearMatchingHistoryIntent(storage, "pending", ids)).toBe(true);
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
    raw = "malformed";
    expect(clearMatchingHistoryIntent(storage, "pending", ids)).toBe(false);
    expect(raw).toBe("malformed");
  });
  it("does not accept another correction or a historical receipt with mismatched revisions", () => {
    expect(isHistoryRevision(revision)).toBe(true);
    expect(revisionMatchesIntent(revision, intent)).toBe(true);
    for (const changed of [
      { ...revision, event_id: requestId },
      { ...revision, expected_case_revision: 1 },
      { ...revision, expected_event_revision: 1 },
      { ...revision, after: { ...values, stageName: "Other" } },
      { ...revision, after: { ...values, voided: true } },
      { ...revision, operation: "void" as const },
    ])
      expect(revisionMatchesIntent(changed, intent)).toBe(false);
    expect(
      isHistoryRevision({ ...revision, expected_case_revision: undefined }),
    ).toBe(false);
    expect(isHistoryRevision({ ...revision, recorded_at: "not a date" })).toBe(
      false,
    );
    expect(
      isHistoryPreview({
        caseRevision: 1,
        eventRevision: 0,
        before: values,
        after: values,
        status: "W rekrutacji",
        currentStage: values.stageName,
        blockedBy: [event.id],
      }),
    ).toBe(true);
    expect(
      isHistoryPreview({
        caseRevision: 1,
        eventRevision: 0,
        before: values,
        after: values,
        status: "W rekrutacji",
        currentStage: values.stageName,
        blockedBy: ["not-an-id"],
      }),
    ).toBe(false);
  });
});

describe("History correction truthful rendering", () => {
  it("marks void without action controls and preserves original stage snapshot labels", () => {
    const html = renderToStaticMarkup(
      createElement(CaseHistory, {
        userId: ownerId,
        caseId,
        result: {
          events: [{ ...event, voided: true }],
          page: 1,
          hasMore: false,
        },
      }),
    );
    expect(html).toContain("Unieważniony wpis");
    expect(html).toContain("nie wpływa na bieżący stan sprawy");
    expect(html).toContain("Pierwotna nazwa");
    expect(html).toContain("Pokaż audyt");
    expect(html).not.toContain("Skoryguj wpis");
    expect(html).not.toContain("Unieważnij wpis");
    expect(html).not.toContain("<script>");
  });
  it("renders only type-specific editable fields, never an arbitrary status or owner selector", () => {
    const html = renderToStaticMarkup(
      createElement(HistoryCorrections, {
        userId: ownerId,
        caseId,
        event,
        initialOperation: "correct",
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain("Korekta wpisu historii");
    expect(html).toContain("Nazwa etapu");
    expect(html).toContain("Pokaż podgląd zmian");
    expect(html).not.toContain("Kierunek kontaktu");
    expect(html).not.toContain("Zatwierdź korektę");
    expect(html).not.toContain("Powód");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<script>");
    const invalidation = renderToStaticMarkup(
      createElement(HistoryCorrections, {
        userId: ownerId,
        caseId,
        event,
        initialOperation: "void",
        onClose: vi.fn(),
      }),
    );
    expect(invalidation).toContain("Unieważnienie wpisu historii");
    expect(invalidation).not.toContain('type="date"');
    expect(invalidation).not.toContain("Zatwierdź unieważnienie");
  });
});
