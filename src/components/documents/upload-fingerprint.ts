/** This is only a claimed fingerprint. The server hashes the received bytes again. */
export async function fingerprintFile(file: File) {
  if (file.size < 1 || file.size > 20 * 1024 * 1024)
    throw new Error("Invalid file size");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return {
    filename: file.name,
    mime: file.type,
    bytes: file.size,
    sha256: Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
