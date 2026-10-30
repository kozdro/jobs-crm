/** Logs are diagnostic only: never retain callback credentials or key/token values. */
export function redactDevLog(line: string) {
  if (
    /\/auth\/callback|access_token|refresh_token|id_token|token_hash|code_verifier|authorization|cookie|password|service.?role|sb_secret_/i.test(
      line,
    )
  )
    return "[sensitive development log line withheld]";
  return line
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[JWT redacted]",
    )
    .replace(
      /(?:postgres(?:ql)?|https?):\/\/[^\s/@]+:[^\s/@]+@[^\s]+/gi,
      "[credential URL redacted]",
    );
}
