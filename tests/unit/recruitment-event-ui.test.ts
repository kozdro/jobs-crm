import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CaseHistory,
  formatEventDay,
  caseEventLabel,
} from "@/components/recruitment/case-history";
import { CaseEventForm } from "@/components/recruitment/case-event-form";
import {
  parsePendingEventIntent,
  eventMatchesIntent,
} from "@/components/recruitment/event-intent";
import type { CaseEvent } from "@/modules/recruitment/domain/case-events";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const ownerId = "00000000-0000-4000-8000-000000000001";
const caseId = "00000000-0000-4000-8000-000000000002";
const requestId = "00000000-0000-4000-8000-000000000003";
const event: CaseEvent = {
  id: "00000000-0000-4000-8000-000000000004",
  case_id: caseId,
  kind: "application",
  direction: null,
  occurred_on: "2026-10-20",
  recorded_at: "2026-10-30T12:00:00.000Z",
  stage_name: null,
  previous_stage: null,
  expected_stage_version: null,
};

describe("Lifecycle recovery intent isolation", () => {
  it("restores only identifiers from the exact owner and case, rejecting draft material", () => {
    const valid = { ownerId, caseId, requestId };
    expect(
      parsePendingEventIntent(JSON.stringify(valid), ownerId, caseId),
    ).toEqual(valid);
    for (const value of [
      null,
      "broken",
      "[]",
      "null",
      JSON.stringify({ ...valid, requestId: "bad" }),
      JSON.stringify({ ...valid, occurredOn: "2026-10-20" }),
      JSON.stringify({ ...valid, ownerId: caseId }),
      JSON.stringify({ ...valid, caseId: ownerId }),
    ]) {
      expect(parsePendingEventIntent(value, ownerId, caseId)).toBeNull();
    }
  });
});
describe("Lifecycle truthful timeline", () => {
  it("renders calendar dates without synthesizing a timestamp and separates unknown dates", () => {
    const html = renderToStaticMarkup(
      createElement(CaseHistory, {
        caseId,
        result: {
          events: [
            event,
            {
              ...event,
              id: requestId,
              kind: "contact",
              direction: "inbound",
              occurred_on: null,
            },
          ],
          hasMore: false,
          page: 1,
        },
      }),
    );
    expect(html).toContain('dateTime="2026-10-20"');
    expect(html).not.toContain("2026-10-20T00");
    expect(html).toContain("20.10.2026");
    expect(html).toContain("Data zdarzenia nieznana");
    expect(html).toContain("Kontakt przychodzący");
    expect(html).toContain("Dodano po dacie zdarzenia.");
    expect(html).toContain("Szczegóły rejestracji");
    expect(html).toContain('dateTime="2026-10-30T12:00:00.000Z"');
    expect(html).not.toContain("Edytuj");
    expect(html).not.toContain("Usuń");
    expect(formatEventDay("2024-02-29")).toBe("29.02.2024");
    expect(caseEventLabel({ kind: "contact", direction: "outbound" })).toBe(
      "Kontakt wychodzący",
    );
  });
  it("does not label failed reads as empty success and keeps older pages reachable", () => {
    const failed = renderToStaticMarkup(
      createElement(CaseHistory, { caseId, result: null }),
    );
    expect(failed).toContain('role="alert"');
    expect(failed).not.toContain("Nie zarejestrowano jeszcze");
    const page = renderToStaticMarkup(
      createElement(CaseHistory, {
        caseId,
        result: { events: [], page: 2, hasMore: true },
      }),
    );
    expect(page).toContain(`historyPage=1#history`);
    expect(page).toContain(`historyPage=3#history`);
    expect(page).not.toContain("Nie zarejestrowano jeszcze");
  });
  it("does not infer an action or submission when displaying action controls", () => {
    const html = renderToStaticMarkup(
      createElement(CaseEventForm, {
        userId: ownerId,
        caseId,
        status: "Zapisane",
        stageVersion: 0,
      }),
    );
    expect(html).toContain("Zarejestruj aplikowanie");
    expect(html).toContain("Zarejestruj kontakt");
    expect(html).toContain("Zarejestruj zaproszenie");
    expect(html).not.toContain("Zmień etap");
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("Zdarzenie zostało zapisane.");
    expect(html).not.toContain('type="submit"');
  });
});

describe("Lifecycle 3B truthful presentation and recovery", () => {
  const invitation: CaseEvent = {
    ...event,
    kind: "invitation",
    stage_name: "Ocena <script> 🧑‍💻",
    previous_stage: null,
    expected_stage_version: 0,
  };
  it("preserves snapshot stage names and distinguishes an invitation from a stage change", () => {
    const change: CaseEvent = {
      ...invitation,
      id: requestId,
      kind: "stage-change",
      previous_stage: invitation.stage_name,
      stage_name: "Rozmowa końcowa",
      expected_stage_version: 1,
    };
    const html = renderToStaticMarkup(
      createElement(CaseHistory, {
        caseId,
        result: { events: [invitation, change], page: 1, hasMore: false },
      }),
    );
    expect(html).toContain("Zarejestrowano kwalifikujące zaproszenie");
    expect(html).toContain("Zmieniono etap rekrutacji");
    expect(html).toContain("Poprzedni etap:");
    expect(html).toContain("Ustawiony etap:");
    expect(html).toContain("Ocena &lt;script&gt; 🧑‍💻");
    expect(html).toContain("Rozmowa końcowa");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Odbyto rozmowę");
  });
  it("offers stage changes only in active recruitment while preserving prior actions", () => {
    const html = renderToStaticMarkup(
      createElement(CaseEventForm, {
        userId: ownerId,
        caseId,
        status: "W rekrutacji",
        stageVersion: 3,
      }),
    );
    for (const label of [
      "Zarejestruj aplikowanie",
      "Zarejestruj kontakt",
      "Zarejestruj zaproszenie",
      "Zmień etap",
    ])
      expect(html).toContain(label);
    expect(html).not.toContain('type="submit"');
  });
  it("does not mistake another stage, revision or case for a recovered save", () => {
    const intent = {
      requestId,
      caseId,
      kind: "invitation" as const,
      direction: null,
      occurredOn: invitation.occurred_on,
      stageName: invitation.stage_name!,
      expectedStageVersion: 0,
    };
    expect(eventMatchesIntent(invitation, intent)).toBe(true);
    for (const changed of [
      { ...invitation, stage_name: "Inny etap" },
      { ...invitation, expected_stage_version: 1 },
      { ...invitation, case_id: requestId },
      { ...invitation, kind: "stage-change" as const },
    ])
      expect(eventMatchesIntent(changed, intent)).toBe(false);
  });
});
