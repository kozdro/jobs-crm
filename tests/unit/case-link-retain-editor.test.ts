import { describe, expect, it, vi } from "vitest";
import { retainEditingLink } from "@/components/recruitment/case-content-tools";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const original = {
  id: "id",
  source: "additional",
  voided: false,
  url: "https://example.test/",
};
describe("link editor retention", () => {
  it("retains the editor identity when a refresh voids or moves the edited link", () => {
    for (const rows of [[], [{ ...original, voided: true }]]) {
      const result = retainEditingLink(rows, original);
      expect(result.missing).toBe(true);
      expect(result.rows).toEqual([original]);
    }
  });
  it("uses the live row when present, without creating a duplicate", () => {
    const updated = { ...original, url: "https://example.test/new" };
    expect(retainEditingLink([updated], original)).toEqual({
      rows: [updated],
      missing: false,
    });
    expect(retainEditingLink([], "new")).toEqual({ rows: [], missing: false });
  });
});
