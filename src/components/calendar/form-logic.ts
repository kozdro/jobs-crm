import type {
  CalendarCommandInput,
  CalendarStatus,
} from "@/modules/recruitment/domain/calendar";
import type { CalendarSchedule } from "@/modules/recruitment/domain/calendar-time";

/** A refresh keeps the current rows mounted only for the same read scope. */
export function showCalendarRows(
  loadedScope: string | null,
  requestedScope: string,
): boolean {
  return loadedScope === requestedScope;
}

/** Pending recovery replaces create triggers, so focus must not target them. */
export function calendarDismissFocus(
  pending: "valid" | "invalid" | "none",
): "recovery" | "heading" | "trigger" {
  return pending === "valid"
    ? "recovery"
    : pending === "invalid"
      ? "heading"
      : "trigger";
}

export function canDismissCalendarForm(
  busy: boolean,
  uncertain: boolean,
  dirty: boolean,
  confirm: (message: string) => boolean,
): boolean {
  if (busy) return false;
  if (uncertain)
    return confirm(
      "Wynik zapisu jest nieznany. Zamknięcie nie cofa zapisu. Czy chcesz zamknąć formularz?",
    );
  return (
    !dirty ||
    confirm("Masz niezapisane dane wydarzenia. Czy chcesz je odrzucić?")
  );
}

export function calendarOperation(
  mode: "create" | "occurred" | "edit" | "resolve",
  originalStatus: CalendarStatus | undefined,
  nextStatus: CalendarStatus,
): CalendarCommandInput["operation"] {
  if (mode === "create" || mode === "occurred") return "create";
  return originalStatus !== nextStatus ? "resolve" : "edit";
}
export function setStartTime(
  schedule: CalendarSchedule,
  input: string,
): CalendarSchedule {
  return {
    ...schedule,
    startTime: input || null,
    startOffset: null,
    ...(input ? {} : { endTime: null, endOffset: null }),
  };
}
export function actualLabel(
  actual: {
    date: string;
    time: string | null;
    offset: number | null;
    timeZone: string;
  } | null,
): string {
  if (!actual) return "Nieznany";
  let time = ", godzina nieznana";
  if (actual.time) {
    const n = actual.offset;
    const offset =
      n === null
        ? ""
        : ` UTC${n < 0 ? "−" : "+"}${String(Math.floor(Math.abs(n) / 60)).padStart(2, "0")}:${String(Math.abs(n) % 60).padStart(2, "0")}`;
    time = `, ${actual.time}${offset}`;
  }
  return `${actual.date}${time} (${actual.timeZone})`;
}
