import { describe, expect, it, vi } from "vitest";
import {
  actualLabel,
  calendarOperation,
  setStartTime,
  canDismissCalendarForm,
  showCalendarRows,
} from "@/components/calendar/form-logic";
import type { CalendarSchedule } from "@/modules/recruitment/domain/calendar-time";
const schedule: CalendarSchedule = {
  startDate: "2026-10-25",
  startTime: "02:30",
  endDate: null,
  endTime: "03:30",
  allDay: false,
  timeZone: "Europe/Warsaw",
  startOffset: 120,
  endOffset: 60,
};
describe("calendar correction and recovery", () => {
  it("keeps rows during refresh only when their owner and query scope still match", () => {
    expect(
      showCalendarRows("owner-a:case-a:1", "owner-a:case-a:1", false),
    ).toBe(true);
    expect(
      showCalendarRows("owner-a:case-a:1", "owner-b:case-a:1", false),
    ).toBe(false);
    expect(
      showCalendarRows("owner-a:case-a:1", "owner-a:case-a:2", false),
    ).toBe(false);
    expect(showCalendarRows("owner-a:case-a:1", "owner-a:case-a:1", true)).toBe(
      false,
    );
  });
  it("guards every dialog dismissal while saving, dirty or uncertain", () => {
    const confirm = vi.fn(() => false);
    expect(canDismissCalendarForm(true, false, false, confirm)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(canDismissCalendarForm(false, false, true, confirm)).toBe(false);
    expect(confirm).toHaveBeenLastCalledWith(
      expect.stringContaining("niezapisane"),
    );
    expect(canDismissCalendarForm(false, true, true, confirm)).toBe(false);
    expect(confirm).toHaveBeenLastCalledWith(
      expect.stringContaining("nieznany"),
    );
    expect(canDismissCalendarForm(false, false, false, confirm)).toBe(true);
  });
  it("sends a correction of outcome through resolve while preserving edit for unchanged outcome", () => {
    expect(calendarOperation("edit", "occurred", "not_occurred")).toBe(
      "resolve",
    );
    expect(calendarOperation("edit", "occurred", "occurred")).toBe("edit");
    expect(calendarOperation("resolve", "planned", "occurred")).toBe("resolve");
  });
  it("clears the hidden dependent end time and offsets with an unknown start hour", () => {
    expect(setStartTime(schedule, "")).toMatchObject({
      startTime: null,
      startOffset: null,
      endTime: null,
      endOffset: null,
    });
    expect(setStartTime(schedule, "04:00").endTime).toBe("03:30");
  });
  it("distinguishes both actual occurrences in a DST fold", () => {
    expect(
      actualLabel({
        date: "2026-10-25",
        time: "02:30",
        offset: 120,
        timeZone: "Europe/Warsaw",
      }),
    ).toContain("UTC+02:00");
    expect(
      actualLabel({
        date: "2026-10-25",
        time: "02:30",
        offset: 60,
        timeZone: "Europe/Warsaw",
      }),
    ).toContain("UTC+01:00");
  });
});
