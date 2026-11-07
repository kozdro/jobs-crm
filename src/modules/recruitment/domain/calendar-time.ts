import { isCalendarDate } from "./case-events";

/** A local wall-clock value remains separate from an instant until the offset is chosen. */
export type CalendarSchedule = {
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  allDay: boolean;
  timeZone: string;
  startOffset: number | null;
  endOffset: number | null;
};

const clockPattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(zone, f);
  }
  return f;
}
export function isIanaTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone || /^[+-]/.test(zone)) return false;
  try {
    formatter(zone);
    return true;
  } catch {
    return false;
  }
}
function epoch(day: string, time: string) {
  const [y, m, d] = day.split("-").map(Number);
  const [h, minute] = time.split(":").map(Number);
  const result = new Date(0);
  result.setUTCFullYear(y, m - 1, d);
  result.setUTCHours(h, minute, 0, 0);
  return result.getTime();
}
function localParts(at: number, zone: string) {
  const parts = Object.fromEntries(
    formatter(zone)
      .formatToParts(new Date(at))
      .map(({ type, value }) => [type, value]),
  );
  return {
    day: `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
/** Returns every matching offset in minutes east of UTC, including both sides of a DST fold. */
export function validOffsets(
  day: string,
  time: string,
  zone: string,
): number[] {
  if (!isCalendarDate(day) || !clockPattern.test(time) || !isIanaTimeZone(zone))
    return [];
  const local = epoch(day, time);
  const candidates = new Set<number>();
  // Samples surround the local date, capturing transitions on either side of it.
  for (let delta = -48; delta <= 48; delta += 6) {
    const probe = local + delta * 3_600_000;
    const p = localParts(probe, zone);
    const offset = (epoch(p.day, p.time) - probe) / 60_000;
    if (Number.isInteger(offset) && Math.abs(offset) <= 24 * 60)
      candidates.add(offset);
  }
  return [...candidates]
    .filter((offset) => {
      const p = localParts(local - offset * 60_000, zone);
      return p.day === day && p.time === time;
    })
    .sort((a, b) => b - a);
}
export function scheduleInstant(
  day: string,
  time: string,
  zone: string,
  offset: number | null,
): number | null {
  if (
    offset === null ||
    !Number.isInteger(offset) ||
    !validOffsets(day, time, zone).includes(offset)
  )
    return null;
  return epoch(day, time) - offset * 60_000;
}
export function validateSchedule(s: CalendarSchedule): boolean {
  if (
    !isCalendarDate(s.startDate) ||
    !isIanaTimeZone(s.timeZone) ||
    typeof s.allDay !== "boolean"
  )
    return false;
  if (
    s.endDate !== null &&
    (!isCalendarDate(s.endDate) || s.endDate < s.startDate)
  )
    return false;
  if (s.allDay || s.startTime === null) {
    return (
      s.startTime === null &&
      s.endTime === null &&
      s.startOffset === null &&
      s.endOffset === null
    );
  }
  const start = scheduleInstant(
    s.startDate,
    s.startTime,
    s.timeZone,
    s.startOffset,
  );
  if (start === null) return false;
  if (s.endTime === null)
    return (
      s.endOffset === null && (s.endDate === null || s.endDate >= s.startDate)
    );
  const end = scheduleInstant(
    s.endDate ?? s.startDate,
    s.endTime,
    s.timeZone,
    s.endOffset,
  );
  return end !== null && end >= start;
}
/** Read-only derivation: passage of time never mutates status. */
export function scheduleHasPassed(s: CalendarSchedule, now: Date): boolean {
  if (!validateSchedule(s) || !Number.isFinite(now.getTime())) return false;
  if (s.allDay || s.startTime === null)
    return (
      localParts(now.getTime(), s.timeZone).day > (s.endDate ?? s.startDate)
    );
  // A date-only end retains unknown precision; it cannot be treated as midnight.
  if (s.endDate !== null && s.endTime === null)
    return localParts(now.getTime(), s.timeZone).day > s.endDate;
  const instant =
    s.endTime !== null
      ? scheduleInstant(
          s.endDate ?? s.startDate,
          s.endTime,
          s.timeZone,
          s.endOffset,
        )
      : scheduleInstant(s.startDate, s.startTime, s.timeZone, s.startOffset);
  return instant !== null && now.getTime() > instant;
}
