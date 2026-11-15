/** A fixed ASCII fallback avoids reflecting filenames into an HTTP header. */
export function attachmentDisposition(filename: string): string {
  // encodeURIComponent throws for lone surrogates; replace them without changing
  // any valid Unicode scalar values before constructing the RFC 5987 parameter.
  const safe = filename.toWellFormed();
  const encoded = encodeURIComponent(safe).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="document"; filename*=UTF-8''${encoded}`;
}
