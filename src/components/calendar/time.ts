import {
  scheduleHasPassed,
  type CalendarSchedule,
} from "@/modules/recruitment/domain/calendar-time";

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const absolute = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}
export function formatSchedule(schedule: CalendarSchedule | null): string {
  if (!schedule) return "Bez wcześniejszego planu";
  const start = `${schedule.startDate}${schedule.startTime ? `, ${schedule.startTime}${schedule.startOffset === null ? "" : ` ${formatOffset(schedule.startOffset)}`}` : schedule.allDay ? ", cały dzień" : ", godzina nieznana"}`;
  const end =
    schedule.endDate || schedule.endTime
      ? ` – ${schedule.endDate ?? schedule.startDate}${schedule.endTime ? `, ${schedule.endTime}${schedule.endOffset === null ? "" : ` ${formatOffset(schedule.endOffset)}`}` : ""}`
      : "";
  return `${start}${end} (${schedule.timeZone})`;
}
export function calendarSection(
  status: string,
  schedule: CalendarSchedule | null,
  now: Date,
): "past" | "upcoming" | "settled" {
  if (status !== "planned" || !schedule) return "settled";
  return scheduleHasPassed(schedule, now) ? "past" : "upcoming";
}

/** Freeze only the actively edited row in its original container. */
export function sectionDuringEdit(
  status: string,
  schedule: CalendarSchedule | null,
  now: Date,
  editSection?: "past" | "upcoming" | "settled",
) {
  return editSection ?? calendarSection(status, schedule, now);
}
