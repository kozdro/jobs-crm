export const taskInvalidationEvent = "jobs-crm:tasks-invalidated";
export type TaskInvalidation = { ownerId: string; caseId?: string };
/** List/audit invalidation is scoped to a trusted page owner. A case close also
 * invalidates general lists because detached tasks move into that collection. */
export function matchesTaskInvalidation(
  detail: unknown,
  ownerId: string,
  query: Record<string, string | number | boolean>,
): boolean {
  if (!detail || typeof detail !== "object" || Array.isArray(detail))
    return false;
  const value = detail as Record<string, unknown>;
  return (
    value.ownerId === ownerId &&
    (value.caseId === undefined || typeof value.caseId === "string") &&
    query.caseOptions !== true &&
    (query.caseId === undefined ||
      value.caseId === undefined ||
      query.caseId === value.caseId)
  );
}
export function invalidateTaskReads(ownerId: string, caseId?: string) {
  window.dispatchEvent(
    new CustomEvent(taskInvalidationEvent, {
      detail: { ownerId, ...(caseId ? { caseId } : {}) },
    }),
  );
}
