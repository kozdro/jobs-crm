import { describe, expect, it, vi } from "vitest";
import {
  claimContentIntent,
  clearContentIntent,
  canDiscardContentDraft,
} from "@/components/recruitment/content-intent";
function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
describe("content intent guard", () => {
  it("keeps an edited draft when discard is declined and permits an explicit discard", () => {
    const confirmDiscard = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    expect(canDiscardContentDraft(false, confirmDiscard)).toBe(true);
    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(canDiscardContentDraft(true, confirmDiscard)).toBe(false);
    expect(canDiscardContentDraft(true, confirmDiscard)).toBe(true);
    expect(confirmDiscard).toHaveBeenCalledTimes(2);
  });
  it("keeps a pending request and only permits retry of the same id", () => {
    const storage = memory();
    expect(claimContentIntent(storage, "case", "first")).toBe(true);
    expect(claimContentIntent(storage, "case", "second")).toBe(false);
    expect(storage.getItem("case")).toBe("first");
    expect(claimContentIntent(storage, "case", "first")).toBe(true);
  });
  it("does not clear a newer request on a late response", () => {
    const storage = memory();
    storage.setItem("case", "new");
    expect(clearContentIntent(storage, "case", "old")).toBe(false);
    expect(storage.getItem("case")).toBe("new");
    expect(clearContentIntent(storage, "case", "new")).toBe(true);
  });
  it("does not report success when storage fails to persist or clear", () => {
    const storage = {
      getItem: () => "old",
      setItem: () => {},
      removeItem: () => {},
    };
    expect(claimContentIntent(storage, "case", "new")).toBe(false);
    expect(clearContentIntent(storage, "case", "old")).toBe(false);
  });
});
