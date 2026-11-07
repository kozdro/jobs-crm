import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventForm } from "@/components/calendar/calendar-panel";
import type { MemoryDraft } from "@/components/calendar/memory-drafts";
import type { CalendarEvent } from "@/modules/recruitment/domain/calendar";
const owner = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const schedule = {
  startDate: "2026-11-10",
  startTime: null,
  endDate: null,
  endTime: null,
  allDay: false,
  timeZone: "Europe/Warsaw",
  startOffset: null,
  endOffset: null,
};
const current: CalendarEvent = {
  id: eventId,
  title: "CURRENT_SERVER_TITLE",
  description: "CURRENT_SERVER_DESCRIPTION",
  case_id: null,
  case_title: null,
  status: "planned",
  schedule,
  timeZone: "Europe/Warsaw",
  actual: null,
  participants: [],
  revision: 5,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-02T10:00:00Z",
};
const restored: MemoryDraft = {
  id: "draft",
  ownerId: owner,
  eventId,
  mode: "edit",
  values: {
    title: "PRESERVED_DRAFT_TITLE",
    description: "PRESERVED_DRAFT_DESCRIPTION",
    caseId: null,
    status: "planned",
    schedule: { ...schedule, startDate: "2026-11-11" },
    timeZone: "Europe/Warsaw",
    actual: null,
    participants: [],
  },
  zoneDraft: "Europe/Paris",
  zoneMode: "wall",
};
describe("restored calendar form", () => {
  it("accepts supplementary Unicode points through the stated limits without UTF-16 truncation", () => {
    const draft = {
      ...restored,
      values: {
        ...restored.values,
        title: "😀".repeat(160),
        description: "😀".repeat(2000),
      },
    };
    const html = renderToStaticMarkup(
      createElement(EventForm, {
        userId: owner,
        initial: current,
        restored: draft,
        cases: [],
        contacts: [],
        mode: "edit",
        onDone: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).toContain('value="' + "😀".repeat(160) + '"');
    expect(html).toContain("😀".repeat(2000));
    expect(html).toContain("160/160 znaków");
    expect(html).toContain("2000/2000 znaków");
    expect(html).not.toMatch(/maxlength=/i);
    expect(html).not.toContain("Podaj tytuł od 1 do 160 znaków.");
    expect(html).not.toContain("Opis może mieć do 2000 znaków.");
  });
  it("marks and describes both over-limit Unicode fields inline", () => {
    const draft = {
      ...restored,
      values: {
        ...restored.values,
        title: "😀".repeat(161),
        description: "😀".repeat(2001),
      },
    };
    const html = renderToStaticMarkup(
      createElement(EventForm, {
        userId: owner,
        initial: current,
        restored: draft,
        cases: [],
        contacts: [],
        mode: "edit",
        onDone: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).toContain("161/160 znaków");
    expect(html).toContain("2001/2000 znaków");
    expect(html).toContain("Podaj tytuł od 1 do 160 znaków.");
    expect(html).toContain("Opis może mieć do 2000 znaków.");
    expect((html.match(/aria-invalid="true"/g) ?? []).length).toBe(2);
    expect(html).toMatch(
      /<label for="([^"]+-description)"[^>]*>Opis<\/label><textarea id="\1"/,
    );
  });
  it("renders the actual saved draft instead of overwriting it with the fresh server baseline", () => {
    const html = renderToStaticMarkup(
      createElement(EventForm, {
        userId: owner,
        initial: current,
        restored,
        cases: [],
        contacts: [],
        mode: "edit",
        onDone: () => {},
        onCancel: () => {},
      }),
    );
    expect(html).toContain('value="PRESERVED_DRAFT_TITLE"');
    expect(html).toContain("PRESERVED_DRAFT_DESCRIPTION");
    expect(html).toContain('value="2026-11-11"');
    expect(html).toContain('value="Europe/Paris"');
    expect(html).not.toContain('value="CURRENT_SERVER_TITLE"');
  });
});
