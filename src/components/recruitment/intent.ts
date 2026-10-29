/** Only the operation identifier is persisted; private draft content stays in memory. */
export const intentStorageKey = "jobs-crm.manual-case.pending";
export type PendingIntent = { ownerId: string; requestId: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parsePendingIntent(
  value: string | null,
  ownerId: string,
): PendingIntent | null {
  if (!value) return null;
  try {
    const item: unknown = JSON.parse(value);
    if (typeof item !== "object" || item === null || Array.isArray(item))
      return null;
    const record = item as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2 ||
      record.ownerId !== ownerId ||
      typeof record.requestId !== "string" ||
      !uuid.test(record.requestId)
    )
      return null;
    return { ownerId, requestId: record.requestId };
  } catch {
    return null;
  }
}
