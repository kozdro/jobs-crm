/** Limits apply to pending and ready bytes until physical deletion is confirmed. */
export const documentFileLimitBytes = 20 * 1024 * 1024;
export const documentAccountLimitBytes = 1024 * 1024 * 1024;

/** Validate values before passing them to the transactional quota reservation. */
export function validDocumentSize(size: number): boolean {
  return (
    Number.isSafeInteger(size) && size > 0 && size <= documentFileLimitBytes
  );
}

/** This is a preflight only: a database lock must serialize the actual reservation. */
export function fitsDocumentQuota(used: number, size: number): boolean {
  return (
    Number.isSafeInteger(used) &&
    used >= 0 &&
    validDocumentSize(size) &&
    used <= documentAccountLimitBytes - size
  );
}
