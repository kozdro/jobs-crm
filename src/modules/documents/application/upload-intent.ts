import { createHash } from "node:crypto";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { validDocumentSize } from "../domain/limits";

const allowedMimes: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};
export function parseUploadIntent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) =>
        ![
          "scope",
          "caseId",
          "documentId",
          "name",
          "isCv",
          "label",
          "filename",
          "mime",
          "bytes",
          "sha256",
        ].includes(key),
    )
  )
    return null;
  const scope = input.scope;
  if (
    scope !== "library" &&
    scope !== "case" &&
    scope !== "library-and-case" &&
    scope !== "version"
  )
    return null;
  const caseId = input.caseId ?? null;
  const documentId = input.documentId ?? null;
  if (
    (caseId !== null &&
      (typeof caseId !== "string" || !uuidPattern.test(caseId))) ||
    (documentId !== null &&
      (typeof documentId !== "string" || !uuidPattern.test(documentId)))
  )
    return null;
  if ((scope === "case" || scope === "library-and-case") && caseId === null)
    return null;
  if ((scope === "version") !== (documentId !== null)) return null;
  const name = input.name ?? null,
    isCv = input.isCv ?? null,
    label = input.label ?? null;
  if (
    scope === "version"
      ? name !== null || isCv !== null
      : typeof name !== "string" || typeof isCv !== "boolean"
  )
    return null;
  if (label !== null && typeof label !== "string") return null;
  if (
    typeof input.filename !== "string" ||
    !input.filename ||
    typeof input.mime !== "string" ||
    typeof input.bytes !== "number" ||
    !validDocumentSize(input.bytes) ||
    typeof input.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(input.sha256)
  )
    return null;
  const extension = input.filename.split(".").pop()?.toLowerCase() ?? "";
  const expected = allowedMimes[extension];
  if (!expected || (input.mime !== "" && input.mime.toLowerCase() !== expected))
    return null;
  return {
    scope,
    caseId,
    documentId,
    name,
    isCv,
    label,
    filename: input.filename,
    mime: input.mime.toLowerCase(),
    bytes: input.bytes,
    sha256: input.sha256,
    effectiveMime: expected,
  };
}
export function uploadIntentDigest(
  intent: NonNullable<ReturnType<typeof parseUploadIntent>>,
) {
  return createHash("sha256").update(JSON.stringify(intent)).digest("hex");
}
