export function searchLiveStatus(
  active: boolean,
  status: "empty" | "loading" | "success" | "error",
  currentResult: boolean,
  hasItems: boolean,
): string {
  if (!active) return "";
  if (status === "error") return "";
  if (status !== "success" || !currentResult) return "Szukam…";
  return hasItems ? "Wyniki są dostępne." : "Brak wyników.";
}
