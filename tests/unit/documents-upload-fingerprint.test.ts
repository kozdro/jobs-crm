import { describe, expect, it } from "vitest";
import { fingerprintFile } from "@/components/documents/upload-fingerprint";

describe("upload permit fingerprint", () => {
  it("binds the actual file bytes and metadata, allowing an unknown declared MIME", async () => {
    const file = new File(["abc"], "synthetic.txt", { type: "" });
    await expect(fingerprintFile(file)).resolves.toEqual({
      filename: "synthetic.txt",
      mime: "",
      bytes: 3,
      sha256:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
  });
  it("rejects an empty file before requesting a permit", async () => {
    await expect(fingerprintFile(new File([], "empty.txt"))).rejects.toThrow();
  });
});
