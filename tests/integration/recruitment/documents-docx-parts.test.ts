/** DEC-065/3A regression: OPC part identity is independent of its suffix. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const modulePath =
  "../../../src/modules/documents/application/validate-content.ts";
const { validateDocumentContent } = await import(modulePath);
const mime =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const rel =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const types = "application/vnd.openxmlformats-officedocument.wordprocessingml.";

// Stored ZIP with real central-directory offsets and CRCs: no mocked parser.
function zip(parts: Record<string, string | Buffer>): Buffer {
  const locals: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(parts)) {
    const filename = Buffer.from(name),
      data = typeof text === "string" ? Buffer.from(text) : text;
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30),
      header = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(filename.length, 28);
    header.writeUInt32LE(offset, 42);
    locals.push(local, filename, data);
    central.push(header, filename);
    offset += local.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
function parts(
  header = "<w:p><w:r><w:t>Synthetic header</w:t></w:r></w:p>",
  name = "header.dat",
) {
  return {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${types}document.main+xml"/><Override PartName="/word/${name}" ContentType="${types}header+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rMain" Type="${rel}/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": `<w:document xmlns:w="${word}" xmlns:r="${rel}"><w:body><w:p/><w:sectPr><w:headerReference w:type="default" r:id="rHeader"/></w:sectPr></w:body></w:document>`,
    "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rHeader" Type="${rel}/header" Target="${name}"/></Relationships>`,
    [`word/${name}`]: `<w:hdr xmlns:w="${word}">${header}</w:hdr>`,
  };
}
const check = (entries: Record<string, string | Buffer>) =>
  validateDocumentContent(zip(entries), "synthetic.docx", mime);

for (const name of ["header.xml", "header.dat", "header"]) {
  test(`accept benign header identified by OPC declarations: ${name}`, async () => {
    assert.equal((await check(parts(undefined, name))).mime, mime);
  });
}
for (const [label, payload] of [
  [
    "simple DDEAUTO",
    '<w:p><w:fldSimple w:instr="DDEAUTO cmd topic item"/></w:p>',
  ],
  [
    "split complex DDEAUTO",
    '<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText>DDE</w:instrText></w:r><w:r><w:instrText>AUTO cmd topic item</w:instrText><w:fldChar w:fldCharType="end"/></w:r></w:p>',
  ],
  ["active object", "<w:p><w:r><w:object/></w:r></w:p>"],
  ["malformed XML", "<w:p>"],
] as const) {
  test(`reject ${label} inside declared header.dat XML`, async () => {
    await assert.rejects(check(parts(payload)));
  });
}
for (const [label, change] of [
  [
    "missing content type",
    (p) => {
      p["[Content_Types].xml"] = p["[Content_Types].xml"].replace(
        /<Override PartName="\/word\/header.dat"[^>]+\/>/,
        "",
      );
    },
  ],
  [
    "unknown content type",
    (p) => {
      p["[Content_Types].xml"] = p["[Content_Types].xml"].replace(
        `${types}header+xml`,
        "application/x-unverifiable",
      );
    },
  ],
  [
    "conflicting content types",
    (p) => {
      p["[Content_Types].xml"] = p["[Content_Types].xml"].replace(
        "</Types>",
        '<Override PartName="/word/header.dat" ContentType="application/octet-stream"/></Types>',
      );
    },
  ],
  [
    "relationship to absent part",
    (p) => {
      p["word/_rels/document.xml.rels"] = p[
        "word/_rels/document.xml.rels"
      ].replace('Target="header.dat"', 'Target="absent.dat"');
    },
  ],
  [
    "relationship/content-type mismatch",
    (p) => {
      p["word/_rels/document.xml.rels"] = p[
        "word/_rels/document.xml.rels"
      ].replace(`${rel}/header`, `${rel}/footer`);
    },
  ],
  [
    "duplicate relationship id",
    (p) => {
      p["word/_rels/document.xml.rels"] = p[
        "word/_rels/document.xml.rels"
      ].replace(
        "</Relationships>",
        `<Relationship Id="rHeader" Type="${rel}/header" Target="header.dat"/></Relationships>`,
      );
    },
  ],
] as const satisfies ReadonlyArray<
  readonly [string, (p: Record<string, string>) => void]
>) {
  test(`fail closed for ${label}`, async () => {
    const entries = parts();
    change(entries);
    await assert.rejects(check(entries));
  });
}

test("accept main document discovered by package relationship rather than fixed filename", async () => {
  const entries: Record<string, string> = parts();
  entries["[Content_Types].xml"] = entries["[Content_Types].xml"].replace(
    "/word/document.xml",
    "/word/main.dat",
  );
  entries["_rels/.rels"] = entries["_rels/.rels"].replace(
    'Target="word/document.xml"',
    'Target="word/main.dat"',
  );
  entries["word/main.dat"] = entries["word/document.xml"];
  entries["word/_rels/main.dat.rels"] = entries["word/_rels/document.xml.rels"];
  delete entries["word/document.xml"];
  delete entries["word/_rels/document.xml.rels"];
  assert.equal((await check(entries)).mime, mime);
});

test("reject active XML identified by Default content type rather than Override", async () => {
  const entries = parts(
    '<w:p><w:fldSimple w:instr="DDEAUTO cmd topic item"/></w:p>',
  );
  entries["[Content_Types].xml"] = entries["[Content_Types].xml"].replace(
    /<Override PartName="\/word\/header.dat"[^>]+\/>/,
    `<Default Extension="dat" ContentType="${types}header+xml"/>`,
  );
  await assert.rejects(check(entries));
});

for (const [extension, type] of [
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
] as const) {
  test(`accept package thumbnail with validated ${type} bytes`, async () => {
    const entries: Record<string, string | Buffer> = parts();
    entries["[Content_Types].xml"] = String(
      entries["[Content_Types].xml"],
    ).replace(
      "</Types>",
      `<Override PartName="/docProps/thumb.dat" ContentType="${type}"/></Types>`,
    );
    entries["_rels/.rels"] = String(entries["_rels/.rels"]).replace(
      "</Relationships>",
      '<Relationship Id="rThumbnail" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" Target="docProps/thumb.dat"/></Relationships>',
    );
    entries["docProps/thumb.dat"] = await readFile(
      new URL(`../../fixtures/documents/valid.${extension}`, import.meta.url),
    );
    assert.equal((await check(entries)).mime, mime);
    entries["docProps/thumb.dat"] = Buffer.from(
      `<w:hdr xmlns:w="${word}"><w:fldSimple w:instr="DDEAUTO cmd topic item"/></w:hdr>`,
    );
    await assert.rejects(
      check(entries),
      "XML disguised as a binary thumbnail must fail closed",
    );
  });
}

function effectsPart(payload: string): Record<string, string> {
  const entries = parts();
  entries["[Content_Types].xml"] = entries["[Content_Types].xml"].replace(
    "</Types>",
    '<Override PartName="/word/effects.dat" ContentType="application/vnd.ms-word.stylesWithEffects+xml"/></Types>',
  );
  entries["word/_rels/document.xml.rels"] = entries[
    "word/_rels/document.xml.rels"
  ].replace(
    "</Relationships>",
    '<Relationship Id="rEffects" Type="http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects" Target="effects.dat"/></Relationships>',
  );
  return {
    ...entries,
    "word/effects.dat": `<w:styles xmlns:w="${word}">${payload}</w:styles>`,
  };
}
test("accept ordinary stylesWithEffects XML with nonstandard part name", async () => {
  assert.equal(
    (
      await check(
        effectsPart(
          '<w:style w:type="paragraph" w:styleId="Synthetic"><w:name w:val="Synthetic"/></w:style>',
        ),
      )
    ).mime,
    mime,
  );
});
for (const [label, payload] of [
  ["DDEAUTO", '<w:fldSimple w:instr="DDEAUTO cmd topic item"/>'],
  ["active object", "<w:object/>"],
] as const) {
  test(`reject ${label} in stylesWithEffects XML named effects.dat`, async () => {
    await assert.rejects(check(effectsPart(payload)));
  });
}
