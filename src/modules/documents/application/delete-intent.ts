import { createHash } from "node:crypto";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

export function deleteIntentDigest(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== 1 ||
    typeof input.previewToken !== "string" ||
    !uuidPattern.test(input.previewToken)
  )
    return null;
  return createHash("sha256")
    .update(JSON.stringify({ previewToken: input.previewToken.toLowerCase() }))
    .digest("hex");
}
