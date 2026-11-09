import { describe, expect, it } from "vitest";
import {
  claimContentIntent,
  clearContentIntent,
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
