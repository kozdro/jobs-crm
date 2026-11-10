/** Missing/foreign targets share one neutral state; malformed reads are retryable. */
export function noteTargetResult(
  data: unknown,
  caseId: string,
  noteId: string,
): "found" | "missing" | "error" {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !("targetNote" in data) ||
    !("timelinePage" in data)
  )
    return "error";
  const result = data as { targetNote: unknown; timelinePage: unknown };
  if (result.targetNote === null && result.timelinePage === null)
    return "missing";
  if (
    !result.targetNote ||
    typeof result.targetNote !== "object" ||
    Array.isArray(result.targetNote)
  )
    return "error";
  const note = result.targetNote as { id?: unknown; case_id?: unknown };
  if (
    note.id !== noteId ||
    note.case_id !== caseId ||
    typeof result.timelinePage !== "number" ||
    !Number.isSafeInteger(result.timelinePage) ||
    result.timelinePage < 1
  )
    return "error";
  return "found";
}
export function noteTargetFailure(error: unknown): "missing" | "error" {
  return !!error &&
    typeof error === "object" &&
    "status" in error &&
    error.status === 404
    ? "missing"
    : "error";
}

/** Refresh is an explicit user action; never schedule it from this decision. */
export function noteTargetNextStep(
  targetPage: number,
  currentPage: number,
  historyAvailable: boolean,
): "navigate" | "focus" | "retry" {
  if (targetPage !== currentPage) return "navigate";
  return historyAvailable ? "focus" : "retry";
}
