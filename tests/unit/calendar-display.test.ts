import { describe, expect, it } from "vitest";
import {
  calendarSection,
  formatOffset,
  formatSchedule,
} from "@/components/calendar/time";
import type { CalendarSchedule } from "@/modules/recruitment/domain/calendar-time";
const base: CalendarSchedule = {
  startDate: "2026-02-03",
  startTime: null,
  endDate: null,
  endTime: null,
  allDay: false,
  timeZone: "Europe/Warsaw",
  startOffset: null,
  endOffset: null,
};
describe("calendar display", () => {
  it("does not describe an unknown hour as midnight or an all-day event", () => {
    expect(formatSchedule(base)).toContain("godzina nieznana");
    expect(formatSchedule(base)).not.toContain("00:00");
    expect(formatSchedule({ ...base, allDay: true })).toContain("cały dzień");
    expect(formatOffset(-210)).toBe("UTC−03:30");
  });
  it("only suggests resolution after the day ends in the event zone without changing status", () => {
    expect(
      calendarSection("planned", base, new Date("2026-02-03T20:00:00Z")),
    ).toBe("upcoming");
    expect(
      calendarSection("planned", base, new Date("2026-02-03T23:30:00Z")),
    ).toBe("past");
    expect(
      calendarSection("occurred", base, new Date("2026-02-03T23:30:00Z")),
    ).toBe("settled");
  });
  it("changes the read-only attention projection when the exact scheduled instant passes", () => {
    const timed = { ...base, startTime: "10:00", startOffset: 60 };
    expect(
      calendarSection("planned", timed, new Date("2026-02-03T08:59:59Z")),
    ).toBe("upcoming");
    expect(
      calendarSection("planned", timed, new Date("2026-02-03T09:00:01Z")),
    ).toBe("past");
    expect(timed.startTime).toBe("10:00");
  });
});
