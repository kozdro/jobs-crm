export const calendarInvalidationEvent = "jobs-crm:calendar-changed";
export function invalidateCalendarReads(ownerId: string, caseId?: string) {
  window.dispatchEvent(
    new CustomEvent(calendarInvalidationEvent, { detail: { ownerId, caseId } }),
  );
}
