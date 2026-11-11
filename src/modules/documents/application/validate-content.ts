import * as cfb from "@stackline/cfb";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { SaxesParser } from "saxes";
import * as yauzl from "yauzl";
import { validateImageContent } from "./validate-image.ts";

const maximumBytes = 20 * 1024 * 1024;
const docxMime =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const mimes: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: docxMime,
  txt: "text/plain",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
};
const invalid = () => new Error("Invalid document content");

async function validatePdf(bytes: Uint8Array) {
  if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-")
    throw invalid();
  // Inspect parsed objects as well as PDF.js' presentation model: PDF.js
  // deliberately omits some actions (notably Launch) from getOpenAction().
  const structural = await PDFDocument.load(bytes, {
    throwOnInvalidObject: true,
    updateMetadata: false,
  });
  const visited = new Set<object>();
  const inspect = (object: unknown): void => {
    if (!object || typeof object !== "object" || visited.has(object)) return;
    visited.add(object);
    if (object instanceof PDFStream) return inspect(object.dict);
    if (object instanceof PDFArray) {
      for (let i = 0; i < object.size(); i++) inspect(object.get(i));
    } else if (object instanceof PDFDict) {
      const subtype = object.lookup(PDFName.of("S"));
      if (subtype instanceof PDFName && subtype.decodeText() === "Launch")
        throw invalid();
      for (const [, value] of object.entries()) inspect(value);
    }
  };
  for (const [, object] of structural.context.enumerateIndirectObjects())
    inspect(object);
  const task = getDocument({
    data: Uint8Array.from(bytes),
    stopAtErrors: true,
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    const openAction = await pdf.getOpenAction();
    if (
      !pdf.numPages ||
      (await pdf.getJSActions()) ||
      (await pdf.getAttachments()) ||
      (openAction && (!openAction.has("dest") || openAction.has("action")))
    )
      throw invalid();
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      if (await page.getJSActions()) throw invalid();
      const annotations = await page.getAnnotations();
      for (const annotation of annotations) {
        const item = annotation as Record<string, unknown>;
        if (
          item.jsActions ||
          (item.action &&
            !["NextPage", "PrevPage", "FirstPage", "LastPage"].includes(
              String(item.action),
            )) ||
          item.attachment ||
          (typeof item.unsafeUrl === "string" &&
            /^(?:javascript|data):/i.test(item.unsafeUrl.trim()))
        )
          throw invalid();
      }
      await page.getOperatorList();
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
}

function validateDoc(bytes: Uint8Array) {
  if (
    !Buffer.from(bytes.subarray(0, 8)).equals(
      Buffer.from("d0cf11e0a1b11ae1", "hex"),
    )
  )
    throw invalid();
  const parsed = cfb.read(Buffer.from(bytes), { type: "buffer", WTF: true });
  if (
    parsed.FullPaths.some((path) =>
      /(?:vba|macros|objectpool|activex|_vba_project)/i.test(path),
    )
  )
    throw invalid();
  const word = cfb.find(parsed, "WordDocument");
  if (!word?.content || word.content.length < 154) throw invalid();
  const fib = Buffer.from(word.content);
  const version = fib.readUInt16LE(2);
  const fcMin = fib.readUInt32LE(24);
  const fcMac = fib.readUInt32LE(28);
  if (
    fib.readUInt16LE(0) !== 0xa5ec ||
    version < 0x00c1 ||
    version > 0x0112 ||
    (fib.readUInt16LE(10) & 0x8100) !== 0 ||
    fcMin < 32 ||
    fcMin > fcMac ||
    fcMac > fib.length
  )
    throw invalid();
  const tableName = (fib.readUInt16LE(10) & 0x0200) !== 0 ? "1Table" : "0Table";
  const table = cfb.find(parsed, tableName)?.content;
  if (!table?.length) throw invalid();
  // FIB variable-length groups precede the table-stream offset/length pairs.
  // Check their bounds before trusting the mandatory stylesheet location.
  let cursor = 32;
  const words = fib.readUInt16LE(cursor);
  cursor += 2 + words * 2;
  if (words < 14 || cursor + 2 > fib.length) throw invalid();
  const longs = fib.readUInt16LE(cursor);
  cursor += 2 + longs * 4;
  if (longs < 22 || cursor + 2 > fib.length) throw invalid();
  const pairs = fib.readUInt16LE(cursor);
  cursor += 2;
  if (pairs < 93 || cursor + pairs * 8 > fib.length) throw invalid();
  const stylesheetStart = fib.readUInt32LE(cursor + 8);
  const stylesheetLength = fib.readUInt32LE(cursor + 12);
  if (!stylesheetLength || stylesheetStart + stylesheetLength > table.length)
    throw invalid();

  // The logical text can be split across non-contiguous compressed/Unicode
  // pieces. Reassemble it before checking field instructions.
  const clxStart = fib.readUInt32LE(cursor + 33 * 8);
  const clxLength = fib.readUInt32LE(cursor + 33 * 8 + 4);
  const tableBytes = Buffer.from(table);
  if (!clxLength || clxStart + clxLength > tableBytes.length) throw invalid();
  const clx = tableBytes.subarray(clxStart, clxStart + clxLength);
  let at = 0;
  while (at < clx.length && clx[at] === 1) {
    if (at + 3 > clx.length) throw invalid();
    at += 3 + clx.readUInt16LE(at + 1);
  }
  if (at + 5 > clx.length || clx[at] !== 2) throw invalid();
  const plcLength = clx.readUInt32LE(at + 1);
  at += 5;
  if (
    plcLength < 4 ||
    (plcLength - 4) % 12 !== 0 ||
    at + plcLength !== clx.length
  )
    throw invalid();
  const count = (plcLength - 4) / 12;
  if (count > 100000 || clx.readUInt32LE(at) !== 0) throw invalid();
  let logicalText = "";
  for (let i = 0; i < count; i++) {
    const begin = clx.readUInt32LE(at + i * 4);
    const end = clx.readUInt32LE(at + (i + 1) * 4);
    if (end < begin || end > maximumBytes) throw invalid();
    const encoded = clx.readUInt32LE(at + (count + 1) * 4 + i * 8 + 2);
    if (encoded & 0x80000000) throw invalid();
    const compressed = (encoded & 0x40000000) !== 0;
    const rawOffset = encoded & 0x3fffffff;
    if (compressed && rawOffset % 2) throw invalid();
    const offset = compressed ? rawOffset / 2 : rawOffset;
    const length = (end - begin) * (compressed ? 1 : 2);
    if (offset + length > fib.length) throw invalid();
    logicalText += fib
      .subarray(offset, offset + length)
      .toString(compressed ? "latin1" : "utf16le");
  }
  if (/\x13\s*DDE(?:AUTO)?(?:\s|$|\\)/i.test(logicalText)) throw invalid();
}

function validateXml(name: string, bytes: Buffer) {
  if (!name.endsWith(".xml") && !name.endsWith(".rels"))
    return {
      mainType: false,
      wordRoot: false,
      wordBody: false,
      rootRelationship: false,
    };
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  const parser = new SaxesParser({ xmlns: true });
  let mainType = false;
  let wordRoot = false;
  let wordBody = false;
  let rootRelationship = false;
  let rootSeen = false;
  let depth = 0;
  let instruction = "";
  let instructionDepth = 0;
  const wordNamespaces = [
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "http://purl.oclc.org/ooxml/wordprocessingml/main",
  ];
  const checkInstruction = (value: string) => {
    if (/^\s*DDE(?:AUTO)?(?:\s|$|\\)/i.test(value)) throw invalid();
  };
  const flushInstruction = () => {
    checkInstruction(instruction);
    instruction = "";
  };
  parser.on("text", (value) => {
    if (instructionDepth) instruction += value;
  });
  parser.on("cdata", (value) => {
    if (instructionDepth) instruction += value;
  });
  parser.on("doctype", () => {
    throw invalid();
  });
  parser.on("opentag", (tag) => {
    depth++;
    if (wordNamespaces.includes(tag.uri)) {
      if (tag.local === "instrText") instructionDepth = depth;
      if (tag.local === "fldChar") flushInstruction();
      if (tag.local === "fldSimple") {
        for (const attribute of Object.values(tag.attributes)) {
          if (
            attribute.local === "instr" &&
            wordNamespaces.includes(attribute.uri)
          )
            checkInstruction(attribute.value);
        }
      }
    }
    if (
      [
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "http://purl.oclc.org/ooxml/wordprocessingml/main",
      ].includes(tag.uri) &&
      ["altChunk", "object", "control"].includes(tag.local)
    )
      throw invalid();
    if (!rootSeen) {
      rootSeen = true;
      wordRoot =
        name === "word/document.xml" &&
        tag.local === "document" &&
        [
          "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
          "http://purl.oclc.org/ooxml/wordprocessingml/main",
        ].includes(tag.uri);
    }
    if (
      name === "word/document.xml" &&
      depth === 2 &&
      tag.local === "body" &&
      [
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "http://purl.oclc.org/ooxml/wordprocessingml/main",
      ].includes(tag.uri)
    )
      wordBody = true;
    if (
      name === "_rels/.rels" &&
      tag.local === "Relationship" &&
      tag.uri ===
        "http://schemas.openxmlformats.org/package/2006/relationships" &&
      /\/(?:officeDocument)$/i.test(tag.attributes.Type?.value ?? "") &&
      /^\/?word\/document\.xml$/i.test(tag.attributes.Target?.value ?? "") &&
      (tag.attributes.TargetMode?.value ?? "").toLowerCase() !== "external"
    )
      rootRelationship = true;
    if (
      name === "[content_types].xml" &&
      tag.local === "Override" &&
      tag.uri ===
        "http://schemas.openxmlformats.org/package/2006/content-types" &&
      tag.attributes.PartName?.value === "/word/document.xml" &&
      tag.attributes.ContentType?.value ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
    )
      mainType = true;
    for (const attribute of Object.values(tag.attributes)) {
      if (
        /vbaProject|macroEnabled|activeX|oleObject|attachedTemplate|aFChunk|\/package$/i.test(
          attribute.value,
        )
      )
        throw invalid();
    }
  });
  parser.on("closetag", () => {
    if (instructionDepth === depth) instructionDepth = 0;
    depth--;
  });
  parser.write(text).close();
  flushInstruction();
  return { mainType, wordRoot, wordBody, rootRelationship };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++)
    crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  return crc >>> 0;
});
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function localSizesMatch(header: yauzl.LocalFileHeader, entry: yauzl.Entry) {
  let compressed = BigInt(header.compressedSize);
  let uncompressed = BigInt(header.uncompressedSize);
  if (
    header.compressedSize === 0xffffffff ||
    header.uncompressedSize === 0xffffffff
  ) {
    let offset = 0;
    let found = false;
    while (offset + 4 <= header.extraField.length) {
      const id = header.extraField.readUInt16LE(offset);
      const length = header.extraField.readUInt16LE(offset + 2);
      offset += 4;
      if (offset + length > header.extraField.length) return false;
      if (id === 1) {
        if (found) return false;
        found = true;
        let cursor = offset;
        if (header.uncompressedSize === 0xffffffff) {
          if (cursor + 8 > offset + length) return false;
          uncompressed = header.extraField.readBigUInt64LE(cursor);
          cursor += 8;
        }
        if (header.compressedSize === 0xffffffff) {
          if (cursor + 8 > offset + length) return false;
          compressed = header.extraField.readBigUInt64LE(cursor);
        }
      }
      offset += length;
    }
    if (!found || offset !== header.extraField.length) return false;
  }
  return (
    compressed === BigInt(entry.compressedSize) &&
    uncompressed === BigInt(entry.uncompressedSize)
  );
}

async function validateDocx(bytes: Uint8Array) {
  const raw = Buffer.from(bytes);
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(
      raw,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, file) =>
        error || !file ? reject(error ?? invalid()) : resolve(file),
    );
  });
  const seen = new Set<string>();
  const ranges: { start: number; end: number }[] = [];
  // yauzl exposes its initial central-directory cursor at runtime; capture it
  // before reading entries so local payloads cannot overlap the directory.
  const centralDirectoryStart = (zip as unknown as { readEntryCursor: number })
    .readEntryCursor;
  let total = 0;
  let hasMainType = false;
  let hasWordRoot = false;
  let hasWordBody = false;
  let hasRootRelationship = false;
  await new Promise<void>((resolve, reject) => {
    zip.on("error", reject);
    zip.on("end", resolve);
    zip.on("entry", (entry) => {
      const name = entry.fileName.toLowerCase();
      if (
        seen.has(name) ||
        /(?:vbaproject|activex|embeddings|oleobject)/i.test(name) ||
        entry.isEncrypted() ||
        entry.uncompressedSize > 32 * 1024 * 1024 ||
        (total += entry.uncompressedSize) > 64 * 1024 * 1024
      ) {
        zip.close();
        reject(invalid());
        return;
      }
      seen.add(name);
      zip.readLocalFileHeader(entry, (headerError, header) => {
        let end = header ? header.fileDataStart + entry.compressedSize : 0;
        let descriptorValid = true;
        if (header && (entry.generalPurposeBitFlag & 8) !== 0) {
          let cursor = end;
          if (
            cursor + 4 <= raw.length &&
            raw.readUInt32LE(cursor) === 0x08074b50
          )
            cursor += 4;
          descriptorValid =
            cursor + 12 <= raw.length &&
            raw.readUInt32LE(cursor) === entry.crc32 &&
            raw.readUInt32LE(cursor + 4) === entry.compressedSize &&
            raw.readUInt32LE(cursor + 8) === entry.uncompressedSize;
          if (descriptorValid) end = cursor + 12;
          else if (
            cursor + 20 <= raw.length &&
            raw.readUInt32LE(cursor) === entry.crc32 &&
            raw.readBigUInt64LE(cursor + 4) === BigInt(entry.compressedSize) &&
            raw.readBigUInt64LE(cursor + 12) === BigInt(entry.uncompressedSize)
          ) {
            descriptorValid = true;
            end = cursor + 20;
          }
        }
        const start = entry.relativeOffsetOfLocalHeader;
        if (
          headerError ||
          !header ||
          header.generalPurposeBitFlag !== entry.generalPurposeBitFlag ||
          header.compressionMethod !== entry.compressionMethod ||
          !header.fileName.equals(entry.fileNameRaw) ||
          !descriptorValid ||
          !Number.isSafeInteger(centralDirectoryStart) ||
          end > centralDirectoryStart ||
          ranges.some((range) => start < range.end && range.start < end) ||
          ((entry.generalPurposeBitFlag & 8) === 0 &&
            (header.crc32 !== entry.crc32 ||
              !localSizesMatch(header, entry))) ||
          ((entry.generalPurposeBitFlag & 8) !== 0 &&
            header.crc32 !== 0 &&
            header.crc32 !== entry.crc32)
        ) {
          zip.close();
          reject(headerError ?? invalid());
          return;
        }
        ranges.push({ start, end });
        if (name.endsWith("/")) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            zip.close();
            reject(error ?? invalid());
            return;
          }
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => {
            try {
              const content = Buffer.concat(chunks);
              if (crc32(content) !== entry.crc32) throw invalid();
              const result = validateXml(name, content);
              hasMainType ||= result.mainType;
              hasWordRoot ||= result.wordRoot;
              hasWordBody ||= result.wordBody;
              hasRootRelationship ||= result.rootRelationship;
              zip.readEntry();
            } catch (error) {
              zip.close();
              reject(error);
            }
          });
        });
      });
    });
    zip.readEntry();
  });
  if (
    !hasMainType ||
    !hasWordRoot ||
    !hasWordBody ||
    !hasRootRelationship ||
    !["[content_types].xml", "_rels/.rels", "word/document.xml"].every((name) =>
      seen.has(name),
    )
  )
    throw invalid();
}

function decodeUtf32(bytes: Uint8Array, littleEndian: boolean, offset: number) {
  if ((bytes.length - offset) % 4 !== 0) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: string[] = [];
  let points: number[] = [];
  for (let index = offset; index < bytes.length; index += 4) {
    const point = view.getUint32(index, littleEndian);
    if (point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff))
      throw invalid();
    points.push(point);
    if (points.length === 4096) {
      chunks.push(String.fromCodePoint(...points));
      points = [];
    }
  }
  chunks.push(String.fromCodePoint(...points));
  return chunks.join("");
}

/** Decode common Unicode representations without changing the stored bytes. */
function decodeText(bytes: Uint8Array) {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xfe &&
    bytes[2] === 0 &&
    bytes[3] === 0
  )
    return decodeUtf32(bytes, true, 4);
  if (
    bytes.length >= 4 &&
    bytes[0] === 0 &&
    bytes[1] === 0 &&
    bytes[2] === 0xfe &&
    bytes[3] === 0xff
  )
    return decodeUtf32(bytes, false, 4);
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le", { fatal: true }).decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be", { fatal: true }).decode(bytes);
  // BOM-less UTF-16/32 has no universal detector. Use byte-position patterns
  // only when clear; undecidable representations remain a documented limit.
  const count = Math.min(bytes.length - (bytes.length % 4), 4096);
  if (count >= 8) {
    const zero = [0, 0, 0, 0];
    for (let index = 0; index < count; index++)
      if (bytes[index] === 0) zero[index % 4]++;
    const groups = count / 4;
    if (
      bytes.length % 4 === 0 &&
      zero[1] > groups * 0.8 &&
      zero[2] > groups * 0.8 &&
      zero[3] > groups * 0.8
    )
      return decodeUtf32(bytes, true, 0);
    if (
      bytes.length % 4 === 0 &&
      zero[0] > groups * 0.8 &&
      zero[1] > groups * 0.8 &&
      zero[2] > groups * 0.8
    )
      return decodeUtf32(bytes, false, 0);
    if (
      bytes.length % 2 === 0 &&
      zero[1] + zero[3] > groups * 1.2 &&
      zero[0] + zero[2] < groups * 0.2
    )
      return new TextDecoder("utf-16le", { fatal: true }).decode(bytes);
    if (
      bytes.length % 2 === 0 &&
      zero[0] + zero[2] > groups * 1.2 &&
      zero[1] + zero[3] < groups * 0.2
    )
      return new TextDecoder("utf-16be", { fatal: true }).decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1250", { fatal: true }).decode(bytes);
  }
}

function hasBinarySignature(bytes: Uint8Array) {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const prefixes = [
    "255044462d",
    "d0cf11e0a1b11ae1",
    "504b0304",
    "89504e470d0a1a0a",
    "ffd8ff",
    "7f454c46",
    "feedface",
    "feedfacf",
    "cefaedfe",
    "cffaedfe",
  ];
  if (
    prefixes.some((hex) =>
      data.subarray(0, hex.length / 2).equals(Buffer.from(hex, "hex")),
    )
  )
    return true;
  if (data.length >= 64 && data[0] === 0x4d && data[1] === 0x5a) {
    const offset = data.readUInt32LE(0x3c);
    return (
      offset <= data.length - 4 &&
      data.subarray(offset, offset + 4).equals(Buffer.from("50450000", "hex"))
    );
  }
  return false;
}

/** Parsing is not an anti-malware guarantee. Call only in an isolated validator. */
export async function validateDocumentContent(
  bytes: Uint8Array,
  filename: string,
  declaredMime: string,
): Promise<{ mime: string }> {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 1 ||
    bytes.length > maximumBytes ||
    typeof filename !== "string"
  )
    throw invalid();
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const mime = mimes[extension];
  if (!mime || declaredMime.toLowerCase() !== mime) throw invalid();
  if (extension === "jpg" || extension === "jpeg" || extension === "png") {
    if (
      !(await validateImageContent(bytes, extension === "png" ? "png" : "jpeg"))
    )
      throw invalid();
  } else if (extension === "txt") {
    if (hasBinarySignature(bytes)) throw invalid();
    const text = decodeText(bytes);
    const markupStart = text.replace(
      /^(?:\s|<\?xml\b[^?]*\?>|<!--[\s\S]*?-->)+/iu,
      "",
    );
    if (
      !text ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(text) ||
      /^(?:<!doctype\s+(?:html|svg)\b|<html\b|<svg\b)/iu.test(markupStart)
    )
      throw invalid();
  } else if (extension === "pdf") await validatePdf(bytes);
  else if (extension === "doc") validateDoc(bytes);
  else await validateDocx(bytes);
  return { mime };
}
