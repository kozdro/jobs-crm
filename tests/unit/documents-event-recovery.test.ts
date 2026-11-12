import { describe, expect, it } from "vitest";
import {
  parsePendingEventIntent,
  sameSentVersions,
} from "@/components/recruitment/event-intent";

const requestId = "a35f5b29-5e1f-4e52-9ee8-5b7dce0a1e89";
describe("atomic application recovery", () => {
  it("keeps the atomic intent marker while binding it to account and case", () => {
    const raw = JSON.stringify({
      ownerId: "owner",
      caseId: "case",
      requestId,
      atomicDocuments: true,
    });
    expect(parsePendingEventIntent(raw, "owner", "case")?.atomicDocuments).toBe(
      true,
    );
    expect(parsePendingEventIntent(raw, "other", "case")).toBeNull();
    expect(parsePendingEventIntent(raw, "owner", "other")).toBeNull();
  });
  it("requires the exact set of sent version identifiers", () => {
    expect(sameSentVersions(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameSentVersions(["a", "b"], ["a", "a"])).toBe(false);
    expect(sameSentVersions(["a", "b"], ["a"])).toBe(false);
    expect(sameSentVersions(["a"], null)).toBe(false);
  });
});
