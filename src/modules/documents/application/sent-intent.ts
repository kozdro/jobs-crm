import { createHash } from "node:crypto";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

type SentIntent = {
  action: "sent-add" | "sent-correct" | "sent-withdraw";
  caseId: string;
  eventId: string;
  eventRevision: number;
  versionIds?: string[];
  referenceId?: string;
  revision?: number;
  versionId?: string;
};
export function parseSentIntent(value: unknown): SentIntent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  if (
    p.action !== "sent-add" &&
    p.action !== "sent-correct" &&
    p.action !== "sent-withdraw"
  )
    return null;
  const keys =
    p.action === "sent-add"
      ? ["action", "caseId", "eventId", "eventRevision", "versionIds"]
      : p.action === "sent-correct"
        ? [
            "action",
            "caseId",
            "eventId",
            "eventRevision",
            "referenceId",
            "revision",
            "versionId",
          ]
        : [
            "action",
            "caseId",
            "eventId",
            "eventRevision",
            "referenceId",
            "revision",
          ];
  if (
    Object.keys(p).some((key) => !keys.includes(key)) ||
    typeof p.caseId !== "string" ||
    !uuidPattern.test(p.caseId) ||
    typeof p.eventId !== "string" ||
    !uuidPattern.test(p.eventId) ||
    typeof p.eventRevision !== "number" ||
    !Number.isSafeInteger(p.eventRevision) ||
    p.eventRevision < 0
  )
    return null;
  const base: Pick<
    SentIntent,
    "action" | "caseId" | "eventId" | "eventRevision"
  > = {
    action: p.action,
    caseId: p.caseId.toLowerCase(),
    eventId: p.eventId.toLowerCase(),
    eventRevision: p.eventRevision,
  };
  if (p.action === "sent-add") {
    if (
      !Array.isArray(p.versionIds) ||
      p.versionIds.length === 0 ||
      p.versionIds.some((id) => typeof id !== "string" || !uuidPattern.test(id))
    )
      return null;
    const versionIds = p.versionIds.map((id: string) => id.toLowerCase());
    if (new Set(versionIds).size !== versionIds.length) return null;
    return { ...base, versionIds };
  }
  if (
    typeof p.referenceId !== "string" ||
    !uuidPattern.test(p.referenceId) ||
    typeof p.revision !== "number" ||
    !Number.isSafeInteger(p.revision) ||
    p.revision < 0
  )
    return null;
  const reference = {
    ...base,
    referenceId: p.referenceId.toLowerCase(),
    revision: p.revision,
  };
  if (p.action === "sent-withdraw") return reference;
  if (typeof p.versionId !== "string" || !uuidPattern.test(p.versionId))
    return null;
  return { ...reference, versionId: p.versionId.toLowerCase() };
}
export function sentIntentDigest(intent: SentIntent) {
  return createHash("sha256").update(JSON.stringify(intent)).digest("hex");
}
