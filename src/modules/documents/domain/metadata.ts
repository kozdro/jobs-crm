import {
  storableText,
  unicodeLength,
} from "@/modules/recruitment/domain/recruitment-case";

/** Reject control characters rather than letting names enter logs or HTTP headers. */
export function parseDocumentName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (
    unicodeLength(name) < 1 ||
    unicodeLength(name) > 160 ||
    !storableText(name) ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(name)
  )
    return null;
  return name;
}

export function parseVersionLabel(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  const parsed = parseDocumentName(value);
  return parsed === null ? undefined : parsed;
}
