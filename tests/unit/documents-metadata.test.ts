import { describe, expect, it } from "vitest";
import {
  parseDocumentName,
  parseVersionLabel,
} from "@/modules/documents/domain/metadata";

describe("document metadata", () => {
  it("trims and counts Unicode code points", () => {
    expect(parseDocumentName("  CV 📄  ")).toBe("CV 📄");
    expect(parseDocumentName("📄".repeat(160))).toBe("📄".repeat(160));
    expect(parseDocumentName("📄".repeat(161))).toBeNull();
  });

  it("rejects empty names and control characters and allows an optional label", () => {
    expect(parseDocumentName("  ")).toBeNull();
    expect(parseDocumentName("CV\r\nContent-Disposition: inline")).toBeNull();
    expect(parseVersionLabel(null)).toBeNull();
    expect(parseVersionLabel("")).toBeNull();
    expect(parseVersionLabel("  ")).toBeUndefined();
  });
});
