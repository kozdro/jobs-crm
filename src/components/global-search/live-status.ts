export function searchLiveStatus(
  active: boolean,
  status: "empty" | "loading" | "success" | "error",
  currentResult: boolean,
  hasItems: boolean,
): string {
  if (!active) return "";
  if (status === "error") return "Nie udało się pobrać wyników.";
  if (status !== "success" || !currentResult) return "Szukam…";
  return hasItems ? "Wyniki są dostępne." : "Brak wyników.";
}
