import sharp from "sharp";

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++)
    crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  return crc >>> 0;
});
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function completePng(bytes: Buffer): boolean {
  if (
    bytes.length < 20 ||
    !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  )
    return false;
  let offset = 8;
  let first = true;
  let dataSeen = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length || end < offset) return false;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (
      !/^[A-Za-z]{4}$/.test(type) ||
      (first && (type !== "IHDR" || length !== 13))
    )
      return false;
    if (
      crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)
    )
      return false;
    if (type === "IDAT") dataSeen = true;
    if (type === "IEND")
      return dataSeen && length === 0 && end === bytes.length;
    first = false;
    offset = end;
  }
  return false;
}

function completeJpeg(bytes: Buffer): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2;
  let scan = false;
  let scanned = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) {
      if (scan) continue;
      return false;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return false;
    const marker = bytes[offset++];
    if (scan && marker === 0x00) continue;
    if (scan && marker >= 0xd0 && marker <= 0xd7) continue;
    if (marker === 0x01) continue;
    if (marker === 0xd9) return scanned && offset === bytes.length;
    if (
      marker === 0xd8 ||
      marker === 0x00 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      offset + 2 > bytes.length
    )
      return false;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return false;
    offset += length;
    scan = marker === 0xda || (scan && marker === 0xdc);
    if (scan) scanned = true;
  }
  return false;
}

/** Decodes the image to detect truncated or malformed pixel data. */
export async function validateImageContent(
  bytes: Uint8Array,
  expected: "jpeg" | "png",
): Promise<boolean> {
  try {
    const source = Buffer.from(bytes);
    if (!(expected === "png" ? completePng(source) : completeJpeg(source)))
      return false;
    const decoder = sharp(source, {
      failOn: "warning",
      limitInputPixels: true,
    });
    const metadata = await decoder.metadata();
    if (metadata.format !== expected || !metadata.width || !metadata.height)
      return false;
    // The output is discarded; original stored bytes are never transformed.
    await decoder.resize(1, 1, { fit: "fill" }).raw().toBuffer();
    return true;
  } catch {
    return false;
  }
}
