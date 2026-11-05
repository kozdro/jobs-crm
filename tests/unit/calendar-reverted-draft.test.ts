import { describe, expect, it } from "vitest";
import {
  revertedDraftCandidate,
  withoutMatchingDraft,
  type MemoryDraft,
} from "@/components/calendar/memory-drafts";
const ownerId = "00000000-0000-4000-8000-000000000001";
const entry: MemoryDraft = {
  id: "draft-1",
  ownerId,
  eventId: null,
  mode: "create",
  values: {
    title: "Wpisany tytuł",
    description: null,
    caseId: null,
    status: "planned",
    schedule: {
      startDate: "",
      startTime: null,
      endDate: null,
      endTime: null,
      allDay: false,
      timeZone: "Europe/Warsaw",
      startOffset: null,
      endOffset: null,
    },
    timeZone: "Europe/Warsaw",
    actual: null,
    participants: [],
  },
  zoneDraft: "Europe/Warsaw",
  zoneMode: "",
};
describe("reverted calendar draft", () => {
  it("removes exactly the previous snapshot when an unsent form returns to baseline", () => {
    const candidate = revertedDraftCandidate(false, false, false, entry);
    expect(candidate).toBe(entry);
    const store = { ownerId, drafts: [entry] };
    expect(
      withoutMatchingDraft(store, ownerId, entry.id, candidate!).drafts,
    ).toEqual([]);
  });
  it("never consumes a pending, restored, newer or foreign-owner draft", () => {
    expect(revertedDraftCandidate(false, false, true, entry)).toBeNull();
    expect(revertedDraftCandidate(false, true, false, entry)).toBeNull();
    expect(
      revertedDraftCandidate(false, false, false, {
        ...entry,
        pendingRequestId: "pending",
      }),
    ).toBeNull();
    const newer = { ...entry, values: { ...entry.values, title: "Nowszy" } };
    expect(
      withoutMatchingDraft(
        { ownerId, drafts: [newer] },
        ownerId,
        entry.id,
        entry,
      ).drafts,
    ).toEqual([newer]);
    expect(
      withoutMatchingDraft(
        { ownerId: "other", drafts: [entry] },
        ownerId,
        entry.id,
        entry,
      ).drafts,
    ).toEqual([entry]);
  });
});
