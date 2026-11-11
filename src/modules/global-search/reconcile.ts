import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

/** Only the owner and the opaque identifiers cross the reconciliation boundary. */
export function parseReconcileRequest(
  value: unknown,
  authenticatedUserId: string,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (
    v.expectedUserId !== authenticatedUserId ||
    typeof v.caseId !== "string" ||
    !uuidPattern.test(v.caseId) ||
    typeof v.requestId !== "string" ||
    !uuidPattern.test(v.requestId) ||
    Object.keys(v).some(
      (key) => !["expectedUserId", "caseId", "requestId"].includes(key),
    )
  )
    return null;
  return { caseId: v.caseId, requestId: v.requestId };
}
