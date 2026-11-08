import { describe, expect, it } from "vitest";
import { parseReminderCommand } from "@/modules/recruitment/domain/reminders";

const id = "123e4567-e89b-42d3-a456-426614174000";
const set = {
  operation: "set-reminder",
  requestId: id,
  taskId: id,
  expectedRevision: 0,
  date: "2026-10-25",
  time: "02:30",
  timeZone: "Europe/Warsaw",
  offset: 120,
};
describe("reminder intent", () => {
  it("accepts either explicitly selected side of an ambiguous local time", () => {
    expect(parseReminderCommand(set)).not.toBeNull();
    expect(parseReminderCommand({ ...set, offset: 60 })).not.toBeNull();
    expect(parseReminderCommand({ ...set, offset: 0 })).toBeNull();
  });
  it("rejects a nonexistent wall time and missing or additional fields", () => {
    expect(parseReminderCommand({ ...set, date: "2026-03-29" })).toBeNull();
    expect(parseReminderCommand({ ...set, dueOn: "2026-10-25" })).toBeNull();
    expect(parseReminderCommand({ ...set, timeZone: "invalid" })).toBeNull();
  });
  it("requires explicit positive interval and zone", () => {
    expect(
      parseReminderCommand({
        operation: "set-rule",
        requestId: id,
        intervalDays: 0,
        timeZone: "UTC",
      }),
    ).toBeNull();
    expect(
      parseReminderCommand({
        operation: "set-rule",
        requestId: id,
        intervalDays: 4,
        timeZone: "UTC",
      }),
    ).not.toBeNull();
    expect(
      parseReminderCommand({
        operation: "set-rule",
        requestId: id,
        intervalDays: 4,
      }),
    ).toBeNull();
  });
  it("binds acknowledgements to a particular configuration", () => {
    expect(
      parseReminderCommand({
        operation: "acknowledge",
        requestId: id,
        taskId: id,
      }),
    ).toBeNull();
    expect(
      parseReminderCommand({
        operation: "acknowledge",
        requestId: id,
        taskId: id,
        configurationId: id,
      }),
    ).not.toBeNull();
  });
});
