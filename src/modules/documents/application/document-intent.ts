import { createHash } from "node:crypto";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { parseDocumentName, parseVersionLabel } from "../domain/metadata";

export function parseDocumentIntent(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const action = p.action;
  if (
    typeof action !== "string" ||
    !["rename", "label", "attach", "detach", "change-version"].includes(action)
  )
    return null;
  const keys: Record<string, string[]> = {
    rename: ["action", "documentId", "revision", "name", "isCv"],
    label: ["action", "versionId", "revision", "label"],
    attach: ["action", "caseId", "versionId"],
    detach: ["action", "caseId", "linkId", "revision"],
    "change-version": ["action", "caseId", "linkId", "revision", "versionId"],
  };
  if (Object.keys(p).some((key) => !keys[action].includes(key))) return null;
  const out: Record<string, unknown> = { action };
  for (const key of keys[action].filter((key) => key.endsWith("Id"))) {
    if (typeof p[key] !== "string" || !uuidPattern.test(p[key] as string))
      return null;
    out[key] = (p[key] as string).toLowerCase();
  }
  if (keys[action].includes("revision")) {
    if (
      typeof p.revision !== "number" ||
      !Number.isSafeInteger(p.revision) ||
      p.revision < 0 ||
      p.revision >= 2147483647
    )
      return null;
    out.revision = p.revision;
  }
  if (action === "rename") {
    const name = parseDocumentName(p.name);
    if (!name || typeof p.isCv !== "boolean") return null;
    out.name = name;
    out.isCv = p.isCv;
  }
  if (action === "label") {
    const label = parseVersionLabel(p.label);
    if (label === undefined) return null;
    out.label = label;
  }
  return out;
}
export function documentIntentDigest(intent: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(intent)).digest("hex");
}
