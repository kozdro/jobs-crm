import { describe, expect, it } from "vitest";
import {
  isCalendarDate,
  parseRecordCaseEventInput,
  warsawToday,
} from "@/modules/recruitment/domain/case-events";

const requestId = "00000000-0000-4000-8000-000000000001";
const caseId = "00000000-0000-4000-8000-000000000002";
const now = new Date("2026-10-30T12:00:00Z");
const parse = (extra: Record<string, unknown> = {}) =>
  parseRecordCaseEventInput(
    { requestId, caseId, kind: "application", ...extra },
    now,
  );
describe("DEC-054 real case facts and calendar dates", () => {
  it("records only the explicit fact, preserving unknown date and no invented direction", () => {
    expect(parse()).toEqual({
      success: true,
      data: {
        requestId,
        caseId,
        kind: "application",
        direction: null,
        occurredOn: null,
      },
    });
    for (const direction of ["inbound", "outbound"])
      expect(parse({ kind: "contact", direction })).toMatchObject({
        success: true,
        data: { kind: "contact", direction, occurredOn: null },
      });
  });
  it.each([null, [], "application", 42])(
    "rejects non-object inputs %j",
    (value) =>
      expect(parseRecordCaseEventInput(value, now).success).toBe(false),
  );
  it.each([
    { kind: "contact" },
    { kind: "contact", direction: "sideways" },
    { kind: "application", direction: "outbound" },
    { kind: "invitation" },
    { kind: null },
    { requestId: "" },
    { caseId: "other" },
    { ownerId: requestId },
    { recordedAt: "2026-10-01" },
    { status: "Kontakt rozpoczęty" },
    { channel: "email" },
    { description: "private message" },
    { confirmation: true },
  ])("rejects invalid/unsupported/spoofed fact input %j", (extra) =>
    expect(parse(extra).success).toBe(false),
  );
  it.each([
    "2026-10-30",
    "2026-10-29",
    "2024-02-29",
    "2000-02-29",
    "0001-01-01",
  ])("accepts real calendar day %s", (occurredOn) =>
    expect(parse({ occurredOn })).toMatchObject({
      success: true,
      data: { occurredOn },
    }),
  );
  it.each([
    "2026-10-31",
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-00-01",
    "0000-01-01",
    "2026-10-00",
    "2026-10-30T00:00:00Z",
    "30/10/2026",
    "",
    "infinity",
    123,
  ])("rejects impossible/future/non-day date %j", (occurredOn) =>
    expect(parse({ occurredOn }).success).toBe(false),
  );
  it("uses Warsaw's calendar day across UTC midnight and DST seasons", () => {
    expect(warsawToday(new Date("2026-10-29T23:30:00Z"))).toBe("2026-10-30");
    expect(warsawToday(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
    expect(
      parseRecordCaseEventInput(
        { requestId, caseId, kind: "application", occurredOn: "2026-10-30" },
        new Date("2026-10-29T23:30:00Z"),
      ).success,
    ).toBe(true);
    expect(isCalendarDate("9999-12-31")).toBe(true);
  });
});
