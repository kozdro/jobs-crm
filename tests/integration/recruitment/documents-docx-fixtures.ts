/** Synthetic OPC fixture builder shared by content and isolated-worker regressions. */
export const mime =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const word =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const rel =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const types =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.";

// Stored ZIP with real central-directory offsets and CRCs: no mocked parser.
export function zip(parts: Record<string, string | Buffer>): Buffer {
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
export function parts(
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
