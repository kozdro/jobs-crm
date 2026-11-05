import { describe, expect, it } from "vitest";
import {
  readWorkingDraft,
  workPrefix,
} from "@/components/calendar/working-draft";
const owner = "00000000-0000-4000-8000-000000000001";
const eventId = "00000000-0000-4000-8000-000000000002";
const draft = {
  ownerId: owner,
  eventId,
  mode: "edit",
  zoneDraft: "Europe/War",
  zoneMode: "wall",
  values: {
    title: "",
    description: "unfinished",
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
};
describe("unfinished owner-bound calendar drafts", () => {
  it("restores incomplete user input only to the owning account", () => {
    expect(readWorkingDraft(JSON.stringify(draft), owner)).toEqual(draft);
    expect(readWorkingDraft(JSON.stringify(draft), eventId)).toBeNull();
    expect(workPrefix(owner)).toContain(owner);
  });
  it("rejects malformed and mismatched event mode without consuming the input", () => {
    expect(
      readWorkingDraft(JSON.stringify({ ...draft, eventId: "other" }), owner),
    ).toBeNull();
    expect(
      readWorkingDraft(JSON.stringify({ ...draft, mode: "create" }), owner),
    ).toBeNull();
    expect(
      readWorkingDraft(
        JSON.stringify({
          ...draft,
          values: { ...draft.values, participants: [{ contactId: 42 }] },
        }),
        owner,
      ),
    ).toBeNull();
  });
});
