import { describe, expect, it } from "vitest";
import {
  scheduleHasPassed,
  validateSchedule,
  validOffsets,
  type CalendarSchedule,
} from "../../../src/modules/recruitment/domain/calendar-time";

const schedule: CalendarSchedule = {
  startDate: "2026-10-25",
  startTime: "02:30",
  endDate: null,
  endTime: null,
  allDay: false,
  timeZone: "Europe/Warsaw",
  startOffset: 120,
  endOffset: null,
};
describe("Calendar time precision and DST", () => {
  it("rejects nonexistent local times and exposes both repeated occurrences", () => {
    expect(validOffsets("2026-03-29", "02:30", "Europe/Warsaw")).toEqual([]);
    expect(validOffsets("2026-10-25", "02:30", "Europe/Warsaw")).toEqual([
      120, 60,
    ]);
    expect(validateSchedule({ ...schedule, startOffset: null })).toBe(false);
    expect(validateSchedule({ ...schedule, startOffset: 60 })).toBe(true);
  });
  it("treats unknown time as a day rather than midnight, in the event zone", () => {
    const day = {
      ...schedule,
      startDate: "2026-11-05",
      startTime: null,
      startOffset: null,
    };
    expect(validateSchedule(day)).toBe(true);
    expect(scheduleHasPassed(day, new Date("2026-11-05T22:59:00Z"))).toBe(
      false,
    );
    expect(scheduleHasPassed(day, new Date("2026-11-05T23:00:00Z"))).toBe(true);
  });
  it("uses the selected occurrence and does not derive all-day from an unknown clock", () => {
    expect(scheduleHasPassed(schedule, new Date("2026-10-25T00:31:00Z"))).toBe(
      true,
    );
    expect(
      scheduleHasPassed(
        { ...schedule, startOffset: 60 },
        new Date("2026-10-25T00:31:00Z"),
      ),
    ).toBe(false);
    expect(validateSchedule({ ...schedule, allDay: true })).toBe(false);
  });
  it("rejects an end before the beginning", () => {
    expect(
      validateSchedule({
        ...schedule,
        endDate: "2026-10-25",
        endTime: "01:30",
        endOffset: 120,
      }),
    ).toBe(false);
  });
});
