import {
  isCalendarDate,
  warsawToday,
} from "@/modules/recruitment/domain/case-events";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

export type DocumentApplicationIntent = {
  contractVersion: 1;
  requestId: string;
  caseId: string;
  occurredOn: string | null;
  sentVersionIds: string[];
};

/** This parser does not authorize an application or substitute for an atomic RPC. */
export function parseDocumentApplicationIntent(
  value: unknown,
  now: Date = new Date(),
): DocumentApplicationIntent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) =>
        ![
          "contractVersion",
          "requestId",
          "caseId",
          "occurredOn",
          "sentVersionIds",
        ].includes(key),
    ) ||
    input.contractVersion !== 1 ||
    typeof input.requestId !== "string" ||
    !uuidPattern.test(input.requestId) ||
    typeof input.caseId !== "string" ||
    !uuidPattern.test(input.caseId) ||
    !Object.hasOwn(input, "occurredOn") ||
    (input.occurredOn !== null &&
      (typeof input.occurredOn !== "string" ||
        !isCalendarDate(input.occurredOn) ||
        input.occurredOn > warsawToday(now))) ||
    !Array.isArray(input.sentVersionIds) ||
    input.sentVersionIds.some(
      (id) => typeof id !== "string" || !uuidPattern.test(id),
    ) ||
    new Set(input.sentVersionIds.map((id: string) => id.toLowerCase())).size !==
      input.sentVersionIds.length
  )
    return null;
  return {
    contractVersion: 1,
    requestId: input.requestId,
    caseId: input.caseId,
    occurredOn: input.occurredOn as string | null,
    sentVersionIds: input.sentVersionIds,
  };
}
