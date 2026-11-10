import { describe, expect, it } from "vitest";
import {
  noteTargetFailure,
  noteTargetNextStep,
  noteTargetResult,
} from "@/components/recruitment/content-target";
const caseId = "00000000-0000-4000-8000-000000000001";
const noteId = "00000000-0000-4000-8000-000000000002";
describe("note target state", () => {
  it("requires rendered history for focus and asks for explicit retry when history is unavailable", () => {
    expect(noteTargetNextStep(1, 1, false)).toBe("retry");
    expect(noteTargetNextStep(1, 1, true)).toBe("focus");
    expect(noteTargetNextStep(2, 1, false)).toBe("navigate");
    expect(noteTargetNextStep(2, 2, false)).toBe("retry");
  });
  it("distinguishes a matching authorized target from a neutral missing target", () => {
    expect(
      noteTargetResult(
        { targetNote: { id: noteId, case_id: caseId }, timelinePage: 2 },
        caseId,
        noteId,
      ),
    ).toBe("found");
    expect(
      noteTargetResult(
        { targetNote: null, timelinePage: null },
        caseId,
        noteId,
      ),
    ).toBe("missing");
    expect(noteTargetFailure({ status: 404 })).toBe("missing");
  });
  it("keeps malformed responses, stale mismatches and read outages retryable", () => {
    expect(noteTargetResult({}, caseId, noteId)).toBe("error");
    expect(
      noteTargetResult(
        { targetNote: { id: noteId, case_id: "other" }, timelinePage: 2 },
        caseId,
        noteId,
      ),
    ).toBe("error");
    expect(
      noteTargetResult(
        { targetNote: { id: noteId, case_id: caseId }, timelinePage: null },
        caseId,
        noteId,
      ),
    ).toBe("error");
    expect(noteTargetFailure({ status: 503 })).toBe("error");
    expect(noteTargetFailure(new Error("timeout"))).toBe("error");
  });
});
