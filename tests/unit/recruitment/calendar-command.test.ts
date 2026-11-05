import { describe, expect, it } from "vitest";
import { parseCalendarCommand } from "../../../src/modules/recruitment/domain/calendar";
const requestId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const contactId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-11-05T10:00:00Z");
const values = {
  title: " Rozmowa ",
  description: null,
  caseId: null,
  status: "planned",
  timeZone: "Europe/Warsaw",
  schedule: {
    startDate: "2026-11-06",
    startTime: null,
    endDate: null,
    endTime: null,
    allDay: false,
    timeZone: "Europe/Warsaw",
    startOffset: null,
    endOffset: null,
  },
  actual: null,
  participants: [],
};
describe("Calendar command validation", () => {
  it("retains unknown planned time and normalizes title", () => {
    const r = parseCalendarCommand(
      { requestId, operation: "create", values },
      now,
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.values.title).toBe("Rozmowa");
      expect(r.data.values.schedule?.startTime).toBeNull();
      expect(r.data.values.schedule?.allDay).toBe(false);
    }
  });
  it("rejects made-up attendance for a planned event and duplicate participants", () => {
    const p = { contactId, attendance: "attended" };
    expect(
      parseCalendarCommand(
        {
          requestId,
          operation: "create",
          values: { ...values, participants: [p] },
        },
        now,
      ).success,
    ).toBe(false);
    expect(
      parseCalendarCommand(
        {
          requestId,
          operation: "create",
          values: {
            ...values,
            participants: [
              { ...p, attendance: "unknown" },
              { ...p, attendance: "unknown" },
            ],
          },
        },
        now,
      ).success,
    ).toBe(false);
  });
  it("allows actual unknown without manufacturing a plan and rejects a future actual", () => {
    const occurred = { ...values, status: "occurred", schedule: null };
    expect(
      parseCalendarCommand(
        { requestId, operation: "create", values: occurred },
        now,
      ).success,
    ).toBe(true);
    expect(
      parseCalendarCommand(
        {
          requestId,
          operation: "create",
          values: {
            ...occurred,
            actual: {
              date: "2026-11-06",
              time: null,
              offset: null,
              timeZone: "Europe/Warsaw",
            },
          },
        },
        now,
      ).success,
    ).toBe(false);
  });
  it("preserves the explicit zone change choice in the frozen intent", () => {
    const r = parseCalendarCommand(
      {
        requestId,
        operation: "edit",
        eventId,
        expectedRevision: 2,
        zoneChangeMode: "keep-instant",
        values,
      },
      now,
    );
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.zoneChangeMode).toBe("keep-instant");
  });
});

describe("Corrections of conversations recorded without a plan", () => {
  it.each(["not_occurred", "cancelled"] as const)(
    "allows correction to %s without a fabricated schedule",
    (status) => {
      const input = {
        requestId,
        operation: "resolve",
        eventId,
        expectedRevision: 0,
        values: { ...values, status, schedule: null, actual: null },
      };
      const result = parseCalendarCommand(input, now);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.values.schedule).toBeNull();
    },
  );
  it("does not allow creating a planned event without a day or creating an already cancelled event", () => {
    expect(
      parseCalendarCommand(
        {
          requestId,
          operation: "create",
          values: { ...values, schedule: null },
        },
        now,
      ).success,
    ).toBe(false);
    expect(
      parseCalendarCommand(
        {
          requestId,
          operation: "create",
          values: { ...values, status: "cancelled", schedule: null },
        },
        now,
      ).success,
    ).toBe(false);
  });
});

describe("Reading corrected events without a plan", () => {
  it.each(["not_occurred", "cancelled"] as const)(
    "reads %s without inventing a schedule",
    async (status) => {
      const { readCalendarEvent } =
        await import("../../../src/modules/recruitment/application/calendar");
      const event = readCalendarEvent({
        id: eventId,
        title: "Rozmowa",
        description: null,
        case_id: null,
        case_title: null,
        status,
        schedule: null,
        timeZone: "Europe/Warsaw",
        actual: null,
        participants: [],
        revision: 1,
        created_at: "2026-11-01T10:00:00Z",
        updated_at: "2026-11-02T10:00:00Z",
      });
      expect(event.status).toBe(status);
      expect(event.schedule).toBeNull();
    },
  );
});
