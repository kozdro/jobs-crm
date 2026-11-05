import { describe, expect, it } from "vitest";
import {
  revertedDraftCandidate,
  withoutMatchingDraft,
  type MemoryDraft,
  stripRejectedDraftMetadata,
  replaceMatchingDraft,
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
  it("removes only definitively rejected metadata from the exact owner-bound frozen snapshot", () => {
    const command = {
      requestId: "00000000-0000-4000-8000-000000000002",
      operation: "create" as const,
      values: entry.values,
    };
    const frozen = {
      ...entry,
      pendingRequestId: command.requestId,
      pendingCommand: command,
    };
    const clean = stripRejectedDraftMetadata(
      ownerId,
      entry.id,
      frozen,
      command,
    );
    expect(clean).not.toBeNull();
    expect(clean).not.toHaveProperty("pendingRequestId");
    expect(clean).not.toHaveProperty("pendingCommand");
    expect(frozen.pendingCommand).toBe(command);
    expect(
      stripRejectedDraftMetadata("other", entry.id, frozen, command),
    ).toBeNull();
    expect(
      stripRejectedDraftMetadata(ownerId, entry.id, frozen, { ...command }),
    ).toBeNull();
    const store = { ownerId, drafts: [frozen] };
    expect(
      replaceMatchingDraft(store, ownerId, entry.id, frozen, clean!).drafts,
    ).toEqual([clean]);
    expect(revertedDraftCandidate(false, false, false, clean)).toBe(clean);
    const newer = {
      ...frozen,
      values: { ...frozen.values, title: "Nowszy szkic" },
    };
    expect(
      replaceMatchingDraft(
        { ownerId, drafts: [newer] },
        ownerId,
        entry.id,
        frozen,
        clean!,
      ).drafts,
    ).toEqual([newer]);
    expect(
      replaceMatchingDraft(
        { ownerId: "other", drafts: [frozen] },
        ownerId,
        entry.id,
        frozen,
        clean!,
      ).drafts,
    ).toEqual([frozen]);
    expect(revertedDraftCandidate(false, false, false, frozen)).toBeNull();
  });
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
