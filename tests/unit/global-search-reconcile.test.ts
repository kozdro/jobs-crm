import { describe, expect, it } from "vitest";
import { parseReconcileRequest } from "@/modules/global-search/reconcile";
const user = "693939cf-b9ac-4d60-a596-ad92a6900966";
const requestId = "cf582c84-c9b7-4878-9ca4-8bf51c329ddf";
const caseId = "7df4834e-9289-4884-9197-9013a04b2e27";
describe("content reconciliation boundary", () => {
  it("accepts only the owner's two opaque identifiers", () => {
    expect(
      parseReconcileRequest({ expectedUserId: user, requestId, caseId }, user),
    ).toEqual({ requestId, caseId });
  });
  it.each([
    [{ expectedUserId: "a different account", requestId, caseId }],
    [{ expectedUserId: user, requestId: "bad-id", caseId }],
    [{ expectedUserId: user, requestId, caseId: "bad-id" }],
    [
      {
        expectedUserId: user,
        requestId,
        caseId,
        body: "private note must not be sent",
      },
    ],
    [null],
    [[]],
  ])("rejects unbound, malformed or payload-bearing input", (input) => {
    expect(parseReconcileRequest(input, user)).toBeNull();
  });
});
