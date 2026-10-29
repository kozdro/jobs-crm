/** Canonical configured origin. Never infer redirect authority from request headers. */
export function normalizeAppOrigin(value: string): string {
  if (!value || /[\s\\\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("Invalid APP_ORIGIN");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid APP_ORIGIN");
  }
  const loopback =
    /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/iu.test(
      value,
    );
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.hostname.includes("*") ||
    /[^\x20-\x7e]/u.test(value)
  ) {
    throw new Error("Invalid APP_ORIGIN");
  }
  // Reject paths that URL parsing would silently normalize (including dot segments).
  if (!/^https?:\/\/[^/?#]+\/?$/iu.test(value))
    throw new Error("Invalid APP_ORIGIN");
  return url.origin;
}
