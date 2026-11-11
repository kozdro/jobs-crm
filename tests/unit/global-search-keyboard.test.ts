import { describe, expect, it } from "vitest";
import { opensSearchDialog } from "@/components/global-search/keyboard";

describe("global search keyboard entry", () => {
  it("opens on Enter or Space but does not intercept ordinary text editing", () => {
    expect(opensSearchDialog("Enter")).toBe(true);
    expect(opensSearchDialog(" ")).toBe(true);
    expect(opensSearchDialog("x")).toBe(false);
    expect(opensSearchDialog("Tab")).toBe(false);
  });
  it("does not interrupt an in-progress input method composition", () => {
    expect(opensSearchDialog("Enter", true)).toBe(false);
    expect(opensSearchDialog(" ", true)).toBe(false);
  });
});
