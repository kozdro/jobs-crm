import { describe, expect, it } from "vitest";
import {
  calendarTargetFailure,
  calendarTargetResult,
} from "@/components/calendar/form-logic";

describe("calendar target result", () => {
  it("treats absent or unauthorized records uniformly and separately from malformed responses", () => {
    expect(calendarTargetResult({ event: null }, "abc")).toBe("missing");
    expect(calendarTargetResult({}, "abc")).toBe("error");
    expect(calendarTargetResult(null, "abc")).toBe("error");
    expect(calendarTargetResult({ event: { id: "other" } }, "abc")).toBe(
      "error",
    );
    expect(calendarTargetResult({ event: { id: "abc" } }, "abc")).toBe("found");
  });
  it("renders 404 neutrally and treats a timeout or 503 as retryable", () => {
    expect(calendarTargetFailure({ status: 404 })).toBe("missing");
    expect(calendarTargetFailure({ status: 503 })).toBe("error");
    expect(calendarTargetFailure(new Error("timeout"))).toBe("error");
  });
});
