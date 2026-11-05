import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventRow } from "@/components/calendar/calendar-panel";
import type { CalendarEvent } from "@/modules/recruitment/domain/calendar";
const id = "00000000-0000-4000-8000-000000000001";
const event: CalendarEvent = {
  id,
  title: "Rozmowa",
  description: null,
  case_id: null,
  case_title: null,
  status: "planned",
  schedule: {
    startDate: "2026-11-10",
    startTime: null,
    endDate: null,
    endTime: null,
    allDay: false,
    timeZone: "Europe/Warsaw",
    startOffset: null,
    endOffset: null,
  },
  timeZone: "Europe/Warsaw",
  actual: null,
  participants: [],
  revision: 1,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-02T10:00:00Z",
};
function render(mutationBlocked: boolean, eventValue: CalendarEvent = event) {
  return renderToStaticMarkup(
    createElement(EventRow, {
      event: eventValue,
      userId: id,
      cases: [],
      contacts: [],
      onSaved: () => {},
      onActivity: () => {},
      onDismiss: () => false,
      onFocusMissing: () => {},
      onFocusRecovery: () => {},
      mutationBlocked,
      now: new Date("2026-11-01T12:00:00Z"),
    }),
  );
}
describe("calendar pending event row", () => {
  it("blocks edit, reschedule and resolve while retaining read-only history", () => {
    const html = render(true);
    for (const name of [
      "Edytuj wydarzenie",
      "Przełóż termin",
      "Rozlicz wydarzenie",
    ])
      expect(html).toMatch(
        new RegExp(`<button[^>]*disabled[^>]*>${name}</button>`),
      );
    expect(html).toContain(
      "Najpierw sprawdź wynik poprzedniego zapisu wydarzenia.",
    );
    expect(html).toMatch(
      /<button(?![^>]*disabled)[^>]*>Pokaż historię wydarzenia<\/button>/,
    );
  });
  it("keeps mutation actions available without a pending intent", () => {
    const html = render(false);
    for (const name of [
      "Edytuj wydarzenie",
      "Przełóż termin",
      "Rozlicz wydarzenie",
    ])
      expect(html).toMatch(
        new RegExp(`<button(?![^>]*disabled)[^>]*>${name}</button>`),
      );
  });
  it("also blocks corrections of already settled events", () => {
    expect(render(true, { ...event, status: "occurred" })).toMatch(
      /<button[^>]*disabled[^>]*>Skoryguj wydarzenie<\/button>/,
    );
    expect(render(false, { ...event, status: "occurred" })).toMatch(
      /<button(?![^>]*disabled)[^>]*>Skoryguj wydarzenie<\/button>/,
    );
  });
});
