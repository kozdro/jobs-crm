import { describe, expect, it } from "vitest";
import {
  createOperationPermit,
  verifyOperationPermit,
} from "@/modules/documents/application/operation-permit";

const owner = "d9ae7f3a-7420-4b54-a3b3-ac1f8f0bf937";
const other = "5608bc31-e28f-4809-977e-a82049332dae";
const secret = new Uint8Array(32).fill(42);
const digest = "a".repeat(64);
const now = 1_750_000_000_000;

describe("operation permit", () => {
  it("binds request, owner and payload and expires within seven days", () => {
    const { requestId, permit } = createOperationPermit(
      secret,
      owner,
      "upload",
      digest,
      now,
    );
    expect(
      verifyOperationPermit(secret, permit, owner, "upload", digest, now),
    ).toBe(requestId);
    expect(
      verifyOperationPermit(secret, permit, other, "upload", digest, now),
    ).toBeNull();
    expect(
      verifyOperationPermit(secret, permit, owner, "delete", digest, now),
    ).toBeNull();
    expect(
      verifyOperationPermit(
        secret,
        permit,
        owner,
        "upload",
        "b".repeat(64),
        now,
      ),
    ).toBeNull();
    expect(
      verifyOperationPermit(
        secret,
        permit,
        owner,
        "upload",
        digest,
        now - 1000,
      ),
    ).toBe(requestId);
    expect(
      verifyOperationPermit(
        secret,
        permit,
        owner,
        "upload",
        digest,
        now - 1001,
      ),
    ).toBeNull();
    expect(
      verifyOperationPermit(
        secret,
        permit,
        owner,
        "upload",
        digest,
        now + 7 * 86400_000 - 1000,
      ),
    ).toBeNull();
    expect(
      verifyOperationPermit(
        secret,
        permit,
        owner,
        "upload",
        digest,
        now + 7 * 86400_000,
      ),
    ).toBeNull();
  });
  it("rejects forged permits", () => {
    const { permit } = createOperationPermit(
      secret,
      owner,
      "upload",
      digest,
      now,
    );
    expect(
      verifyOperationPermit(
        secret,
        permit.replace(/.$/, "!"),
        owner,
        "upload",
        digest,
        now,
      ),
    ).toBeNull();
  });
});
