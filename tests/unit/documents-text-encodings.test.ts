import { describe, expect, it } from "vitest";
import { validateDocumentContent } from "@/modules/documents/application/validate-content";

function utf32(value: string, littleEndian: boolean, bom: boolean) {
  const points = Array.from(value, (character) => character.codePointAt(0)!);
  const bytes = Buffer.alloc(points.length * 4 + (bom ? 4 : 0));
  let offset = 0;
  if (bom) {
    if (littleEndian) bytes.writeUInt32LE(0xfeff, 0);
    else bytes.writeUInt32BE(0xfeff, 0);
    offset = 4;
  }
  for (const point of points) {
    if (littleEndian) bytes.writeUInt32LE(point, offset);
    else bytes.writeUInt32BE(point, offset);
    offset += 4;
  }
  return bytes;
}
describe("TXT byte validation", () => {
  it("accepts UTF-16 without BOM and UTF-32 with or without BOM", async () => {
    const utf16le = Buffer.from("CV Anna", "utf16le");
    const utf16be = Buffer.from(utf16le);
    utf16be.swap16();
    for (const bytes of [
      utf16le,
      utf16be,
      utf32("CV Anna", true, true),
      utf32("CV Anna", false, true),
      utf32("CV Anna", true, false),
      utf32("CV Anna", false, false),
    ]) {
      await expect(
        validateDocumentContent(bytes, "sample.txt", "text/plain"),
      ).resolves.toEqual({ mime: "text/plain" });
    }
  });
  it("rejects malformed UTF-32 and executable/other binary signatures", async () => {
    const malformed = Buffer.from([0xff, 0xfe, 0, 0, 0, 0, 0x11, 0]);
    for (const bytes of [
      malformed,
      Buffer.from("7f454c4641414141", "hex"),
      Buffer.from("504b030441414141", "hex"),
      Buffer.from("255044462d414141", "hex"),
    ]) {
      await expect(
        validateDocumentContent(bytes, "sample.txt", "text/plain"),
      ).rejects.toThrow();
    }
  });
});
