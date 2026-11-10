import { describe, expect, it } from "vitest";
import { searchLiveStatus } from "@/components/global-search/live-status";

describe("search live status", () => {
  it("does not announce results before the current request has finished", () => {
    expect(searchLiveStatus(false, "success", true, true)).toBe("");
    expect(searchLiveStatus(true, "empty", false, false)).toBe("Szukam…");
    expect(searchLiveStatus(true, "loading", false, true)).toBe("Szukam…");
    expect(searchLiveStatus(true, "success", false, true)).toBe("Szukam…");
  });
  it("announces only the current outcome without result content", () => {
    expect(searchLiveStatus(true, "success", true, true)).toBe(
      "Wyniki są dostępne.",
    );
    expect(searchLiveStatus(true, "success", true, false)).toBe(
      "Brak wyników.",
    );
    expect(searchLiveStatus(true, "error", false, false)).toBe(
      "Nie udało się pobrać wyników.",
    );
  });
});
