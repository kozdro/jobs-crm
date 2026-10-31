import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  clearMatchingLifecycleIntent,
  isLifecyclePreview,
  lifecycleResultMatches,
  parseLifecycleIntent,
} from "@/components/recruitment/lifecycle-intent";
import {
  LifecycleActions,
  LifecycleForm,
} from "@/components/recruitment/lifecycle";
import { CaseHistory } from "@/components/recruitment/case-history";
import type {
  ConfirmLifecycleInput,
  LifecycleEntry,
  ClosureRevision,
} from "@/modules/recruitment/domain/lifecycle";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const ownerId = "00000000-0000-4000-8000-000000000001";
const caseId = "00000000-0000-4000-8000-000000000002";
const requestId = "00000000-0000-4000-8000-000000000003";
const closureId = "00000000-0000-4000-8000-000000000004";
const command: ConfirmLifecycleInput = {
  operation: "close",
  caseId,
  closureId: null,
  outcome: "Nie aplikowano",
  occurredOn: null,
  offerConfirmed: false,
  requestId,
  expectedCaseRevision: 3,
  expectedClosureRevision: 0,
};
const entry: LifecycleEntry = {
  id: closureId,
  request_id: requestId,
  expected_case_revision: 3,
  case_id: caseId,
  kind: "close",
  cycle: 0,
  occurred_on: null,
  recorded_at: "2026-10-31T12:00:00Z",
  outcome: "Nie aplikowano",
  offer_confirmed: false,
  previous_status: "Zapisane",
  previous_stage: null,
  resulting_status: "Zakończone",
  resulting_stage: null,
  revision: 0,
  original: {
    outcome: "Nie aplikowano",
    occurredOn: null,
    offerConfirmed: false,
  },
};
const ids = { ownerId, caseId, requestId };

describe("Lifecycle intent identity and uncertain result recovery", () => {
  it("restores an exact confirmed command only for the same owner and case", () => {
    const raw = JSON.stringify({ ...ids, command });
    expect(parseLifecycleIntent(raw, ownerId, caseId)).toEqual({
      ...ids,
      command,
    });
    expect(parseLifecycleIntent(raw, caseId, caseId)).toBeNull();
    expect(parseLifecycleIntent(raw, ownerId, ownerId)).toBeNull();
    expect(parseLifecycleIntent("bad JSON", ownerId, caseId)).toBeNull();
  });
  it("keeps corrupted or legacy commands read-only instead of retrying altered data", () => {
    for (const altered of [
      { ...command, requestId: closureId },
      { ...command, caseId: ownerId },
      { ...command, occurredOn: "2000-02-30" },
      { ...command, outcome: "made up" },
      { ...command, expectedCaseRevision: -1 },
      { ...command, expectedClosureRevision: 2 },
      { ...command, operation: "delete" },
      { ...command, reason: "not authorized" },
    ])
      expect(
        parseLifecycleIntent(
          JSON.stringify({ ...ids, command: altered }),
          ownerId,
          caseId,
        ),
      ).toEqual(ids);
    expect(parseLifecycleIntent(JSON.stringify(ids), ownerId, caseId)).toEqual(
      ids,
    );
  });
  it("does not clear a newer request or another account's request on a late response", () => {
    let raw: string | null = JSON.stringify({ ...ids, requestId: closureId });
    const storage = {
      getItem: () => raw,
      removeItem: vi.fn(() => {
        raw = null;
      }),
    };
    expect(clearMatchingLifecycleIntent(storage, "key", ids)).toBe(false);
    expect(storage.removeItem).not.toHaveBeenCalled();
    raw = JSON.stringify({ ...ids, ownerId: caseId });
    expect(clearMatchingLifecycleIntent(storage, "key", ids)).toBe(false);
    raw = JSON.stringify({ ...ids, command });
    expect(clearMatchingLifecycleIntent(storage, "key", ids)).toBe(true);
    expect(raw).toBeNull();
  });
  it("matches close recovery against original data after a later audited correction", () => {
    const corrected = { ...entry, outcome: "Odmowa firmy", revision: 1 };
    expect(lifecycleResultMatches({ entry: corrected }, command)).toBe(true);
    for (const altered of [
      { ...entry, request_id: closureId },
      { ...entry, case_id: ownerId },
      { ...entry, expected_case_revision: 2 },
      { ...entry, original: { ...entry.original, outcome: "Odmowa firmy" } },
    ])
      expect(lifecycleResultMatches({ entry: altered }, command)).toBe(false);
  });
  it("requires the matching closure, expected versions and values for correction recovery", () => {
    const correction: ConfirmLifecycleInput = {
      ...command,
      operation: "correct-closure",
      closureId,
      outcome: "Odmowa firmy",
      expectedClosureRevision: 0,
    };
    const revision: ClosureRevision = {
      id: ownerId,
      request_id: requestId,
      case_id: caseId,
      closure_id: closureId,
      recorded_at: entry.recorded_at,
      revision: 1,
      expected_case_revision: 3,
      expected_closure_revision: 0,
      before: entry.original!,
      after: {
        outcome: "Odmowa firmy",
        occurredOn: null,
        offerConfirmed: false,
      },
    };
    expect(lifecycleResultMatches({ revision }, correction)).toBe(true);
    expect(
      lifecycleResultMatches(
        { revision: { ...revision, closure_id: ownerId } },
        correction,
      ),
    ).toBe(false);
    expect(
      lifecycleResultMatches(
        { revision: { ...revision, expected_case_revision: 4 } },
        correction,
      ),
    ).toBe(false);
    expect(
      lifecycleResultMatches(
        {
          revision: {
            ...revision,
            after: { ...revision.after, occurredOn: "2000-01-01" },
          },
        },
        correction,
      ),
    ).toBe(false);
  });
  it("accepts a closed-state preview for old fact corrections and rejects invalid revisions", () => {
    const preview = {
      caseRevision: 4,
      closureRevision: 0,
      status: "Zakończone",
      currentStage: null,
      cycle: 0,
      before: null,
      after: entry.original,
    };
    expect(isLifecyclePreview(preview)).toBe(true);
    expect(isLifecyclePreview({ ...preview, caseRevision: -1 })).toBe(false);
    expect(isLifecyclePreview({ ...preview, status: "Wstrzymane" })).toBe(
      false,
    );
  });
});

describe("Lifecycle truthful and accessible rendering", () => {
  it("has no default outcome or invented day and requires preview before confirmation", () => {
    const html = renderToStaticMarkup(
      createElement(LifecycleForm, {
        userId: ownerId,
        caseId,
        operation: "close",
        onClose: vi.fn(),
      }),
    );
    expect(html).toContain("Wynik zakończenia");
    expect(html).toContain(
      '<option value="" selected="">Wybierz wynik</option>',
    );
    expect(html).toContain("Pokaż podgląd zmian");
    expect(html).not.toContain("Zatwierdź zakończenie");
    expect(html).toContain("cyklu tego zakończenia");
    expect(html).not.toContain("Brak otwartych zadań");
    expect(html).not.toContain("Powód");
  });
  it("offers explicit reopening only for a closed case", () => {
    const closed = renderToStaticMarkup(
      createElement(LifecycleActions, {
        userId: ownerId,
        caseId,
        status: "Zakończone",
      }),
    );
    expect(closed).toContain("Wznów sprawę");
    expect(closed).not.toContain("Zakończ sprawę");
    const active = renderToStaticMarkup(
      createElement(LifecycleActions, {
        userId: ownerId,
        caseId,
        status: "W rekrutacji",
      }),
    );
    expect(active).toContain("Zakończ sprawę");
    expect(active).not.toContain("Wznów sprawę");
  });
  it("shows separate repeated closures on one timeline with audit controls and original context", () => {
    const html = renderToStaticMarkup(
      createElement(CaseHistory, {
        userId: ownerId,
        caseId,
        result: {
          entries: [
            { type: "lifecycle", entry },
            {
              type: "lifecycle",
              entry: {
                ...entry,
                id: ownerId,
                cycle: 1,
                outcome: "Odmowa firmy",
                revision: 1,
              },
            },
          ],
          hasMore: false,
          page: 1,
        },
      }),
    );
    expect(html.match(/Zakończono sprawę/g)).toHaveLength(2);
    expect(html).toContain("Nie aplikowano");
    expect(html).toContain("Odmowa firmy");
    expect(html).toContain("Skorygowano");
    expect(html).toContain("Pokaż audyt zakończenia");
    expect(html).toContain("oryginalny kontekst operacji");
    expect(html).toContain("Data zdarzenia nieznana");
  });
  it("keeps a failed timeline read distinct from an empty timeline", () => {
    const html = renderToStaticMarkup(
      createElement(CaseHistory, { userId: ownerId, caseId, result: null }),
    );
    expect(html).toContain("Nie udało się pobrać historii");
    expect(html).not.toContain(
      "Nie zarejestrowano jeszcze zdarzeń biznesowych",
    );
  });
});
