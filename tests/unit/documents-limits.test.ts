import { describe, expect, it } from "vitest";
import {
  documentAccountLimitBytes,
  documentFileLimitBytes,
  fitsDocumentQuota,
  validDocumentSize,
} from "@/modules/documents/domain/limits";

describe("document byte limits", () => {
  it("accepts the exact file limit and rejects empty, oversized and invalid values", () => {
    expect(validDocumentSize(documentFileLimitBytes)).toBe(true);
    for (const value of [0, -1, documentFileLimitBytes + 1, 1.5, NaN, Infinity])
      expect(validDocumentSize(value)).toBe(false);
  });

  it("includes existing pending bytes and accepts exactly one GiB", () => {
    expect(fitsDocumentQuota(documentAccountLimitBytes - 1, 1)).toBe(true);
    expect(fitsDocumentQuota(documentAccountLimitBytes, 1)).toBe(false);
    expect(fitsDocumentQuota(-1, 1)).toBe(false);
    expect(fitsDocumentQuota(NaN, 1)).toBe(false);
  });
});
