import { describe, expect, it } from "vitest";
import { validateUploadDraft } from "@/components/documents/upload-form";

describe("document upload feedback", () => {
  const valid = {
    file: { name: "cv.pdf", size: 20 * 1024 * 1024 },
    name: "CV",
    label: "",
  };
  it("accepts the exact file limit and approved formats", () => {
    for (const extension of [
      "pdf",
      "doc",
      "docx",
      "txt",
      "jpg",
      "jpeg",
      "png",
    ]) {
      expect(
        validateUploadDraft({
          ...valid,
          file: { ...valid.file, name: `cv.${extension}` },
        }),
      ).toBeNull();
    }
  });
  it("rejects empty, oversized and unsupported files", () => {
    expect(
      validateUploadDraft({ ...valid, file: { ...valid.file, size: 0 } }),
    ).not.toBeNull();
    expect(
      validateUploadDraft({
        ...valid,
        file: { ...valid.file, size: valid.file.size + 1 },
      }),
    ).not.toBeNull();
    expect(
      validateUploadDraft({
        ...valid,
        file: { ...valid.file, name: "cv.svg" },
      }),
    ).not.toBeNull();
  });
  it("counts Unicode code points after trimming", () => {
    expect(
      validateUploadDraft({ ...valid, name: ` ${"😀".repeat(160)} ` }),
    ).toBeNull();
    expect(
      validateUploadDraft({ ...valid, name: "😀".repeat(161) }),
    ).not.toBeNull();
    expect(
      validateUploadDraft({ ...valid, label: "😀".repeat(161) }),
    ).not.toBeNull();
  });
});
