const detailPrefix = "/recruitments/";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sections = new Set([
  "#case-details",
  "#case-links",
  "#case-relations",
  "#case-tasks",
  "#case-calendar",
  "#case-lifecycle",
  "#case-actions",
  "#case-history",
]);

/** Exact presentation-only anchors; no decoding, token parsing or session authority. */
export function isCaseSectionFragment(
  pathname: string,
  fragment: string,
): boolean {
  if (!pathname.startsWith(detailPrefix) || !sections.has(fragment))
    return false;
  const id = pathname.slice(detailPrefix.length);
  // The length check also rejects the final line terminator accepted by RegExp `$`.
  return id.length === 36 && uuid.test(id);
}
