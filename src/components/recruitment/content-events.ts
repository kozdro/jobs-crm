export const contentChangedEvent = "jobs-crm:case-content-changed";
export type ContentChanged = { owner: string; caseId: string };
export function matchesContentChanged(
  value: unknown,
  owner: string,
  caseId: string,
) {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<ContentChanged>;
  return event.owner === owner && event.caseId === caseId;
}
