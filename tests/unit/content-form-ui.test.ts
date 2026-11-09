import { describe, expect, it, vi } from "vitest";
import {
  noteFormErrors,
  linkFormError,
  noteTimelineDay,
} from "@/components/recruitment/content-form-validation";
import { matchesContentChanged } from "@/components/recruitment/content-events";
import { findActiveLinkPage } from "@/components/recruitment/content-link-navigation";

describe("case content forms", () => {
  it("identifies the actual invalid field without rejecting valid unknown dates", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    expect(noteFormErrors(" ", "ordinary", "", now)).toEqual({
      body: expect.any(String),
    });
    expect(noteFormErrors("tekst", "known", "2026-11-02", now)).toEqual({
      date: expect.any(String),
    });
    expect(noteFormErrors(" ", "known", "", now)).toEqual({
      body: expect.any(String),
      date: expect.any(String),
    });
    expect(noteFormErrors("tekst", "unknown", "", now)).toEqual({});
    expect(
      noteFormErrors("x".repeat(10001), "ordinary", "", now),
    ).toHaveProperty("body");
    expect(linkFormError("javascript:alert(1)")).not.toBeNull();
    expect(linkFormError("not a url")).not.toBeNull();
    expect(linkFormError("https://example.test/path?q=1#part")).toBeNull();
  });
  it("uses Warsaw calendar day consistently at UTC midnight for ordinary notes", () => {
    const note = {
      date_kind: "ordinary" as const,
      created_at: "2026-10-30T23:30:00Z",
      occurred_on: null,
    };
    expect(noteTimelineDay(note)).toBe("2026-10-31");
    expect(
      noteTimelineDay({ ...note, date_kind: "historical", occurred_on: null }),
    ).toBeNull();
    expect(
      noteTimelineDay({
        ...note,
        date_kind: "historical",
        occurred_on: "2020-01-02",
      }),
    ).toBe("2020-01-02");
  });
  it("invalidates the loaded links only for the matching owner and case", () => {
    expect(matchesContentChanged({ owner: "A", caseId: "1" }, "A", "1")).toBe(
      true,
    );
    expect(matchesContentChanged({ owner: "B", caseId: "1" }, "A", "1")).toBe(
      false,
    );
    expect(matchesContentChanged({ owner: "A", caseId: "2" }, "A", "1")).toBe(
      false,
    );
    expect(matchesContentChanged(null, "A", "1")).toBe(false);
  });
  it("locates a reordered link across pages without accepting a void or same ID with a different source", async () => {
    const load = vi.fn(async (page: number) =>
      page === 1
        ? {
            links: [
              { id: "moved", source: "legacy", voided: true },
              { id: "moved", source: "additional", voided: false },
            ],
            hasMoreLinks: true,
          }
        : {
            links: [{ id: "moved", source: "legacy", voided: false }],
            hasMoreLinks: false,
          },
    );
    expect(
      await findActiveLinkPage(load, { id: "moved", source: "legacy" }),
    ).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(
      await findActiveLinkPage(load, { id: "missing", source: "legacy" }),
    ).toBeNull();
  });
});
