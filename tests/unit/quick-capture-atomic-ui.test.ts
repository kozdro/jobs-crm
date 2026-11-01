import { describe, expect, it } from "vitest";
import {
  captureActionLabel,
  captureStatus,
  makeCaptureAction,
} from "@/components/recruitment/intent";

describe("Quick Capture explicit Action selection", () => {
  it("has no action until the user makes an explicit selection", () => {
    expect(makeCaptureAction(null, "", false)).toBeNull();
  });

  it("keeps save-only independent from fact confirmation and date", () => {
    expect(makeCaptureAction("save_only", "2030-01-01", false)).toEqual({
      kind: "save_only",
    });
    expect(captureStatus("save_only")).toBe("Zapisane");
  });

  it("requires a separate confirmation before creating any fact-bearing Action", () => {
    for (const kind of [
      "application",
      "contact_inbound",
      "contact_outbound",
    ] as const) {
      expect(makeCaptureAction(kind, "", false)).toBeNull();
      expect(makeCaptureAction(kind, "2026-10-31", true)).toEqual({
        kind,
        occurredOn: "2026-10-31",
        factConfirmed: true,
      });
      expect(captureActionLabel(kind)).not.toBe("Zapisz tylko sprawę");
      expect(captureStatus(kind)).toBe("Kontakt rozpoczęty");
    }
  });
});
