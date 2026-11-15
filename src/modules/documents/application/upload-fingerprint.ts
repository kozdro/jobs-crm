import { createHash } from "node:crypto";
import { validDocumentSize } from "../domain/limits";

/** Computed from the bytes actually received by the server, never the client. */
export function fingerprintUpload(bytes: Uint8Array) {
  if (!validDocumentSize(bytes.byteLength))
    throw new Error("Invalid document size");
  return {
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
