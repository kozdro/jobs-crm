import { SaxesParser, type SaxesTagNS } from "saxes";
import { validateImageContent } from "./validate-image.ts";

const invalid = () => new Error("Invalid document content");
const contentNamespace =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const relationshipNamespace =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const relationshipMime =
  "application/vnd.openxmlformats-package.relationships+xml";
const officeMime = "application/vnd.openxmlformats-officedocument.";
const wordMime = `${officeMime}wordprocessingml.`;
const mainMime = `${wordMime}document.main+xml`;
// Microsoft MS-DOCX / StylesWithEffectsPart (Office2010).
const stylesWithEffectsMime = "application/vnd.ms-word.stylesWithEffects+xml";
const wordNamespaces = [
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
];
const drawingNamespaces = [
  "http://schemas.openxmlformats.org/drawingml/2006/main",
  "http://purl.oclc.org/ooxml/drawingml/main",
];
const relationshipPrefixes = [
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/",
];

function xml(
  bytes: Buffer,
  open: (tag: SaxesTagNS, depth: number) => void,
  metadata = false,
) {
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0;
  const text = (value: string) => {
    if (metadata && value.trim()) throw invalid();
  };
  parser.on("text", text);
  parser.on("cdata", text);
  parser.on("doctype", () => {
    throw invalid();
  });
  parser.on("opentag", (tag) => {
    if (
      metadata &&
      Object.values(tag.attributes).some((attr) =>
        /vbaProject|macroEnabled|activeX|oleObject|attachedTemplate|aFChunk|\/package$/i.test(
          attr.value,
        ),
      )
    )
      throw invalid();
    open(tag, ++depth);
  });
  parser.on("closetag", () => {
    depth--;
  });
  parser
    .write(new TextDecoder(encoding, { fatal: true }).decode(bytes))
    .close();
}
function attributes(tag: SaxesTagNS, allowed: string[], required: string[]) {
  const result: Record<string, string> = {};
  for (const attribute of Object.values(tag.attributes)) {
    if (attribute.uri === "http://www.w3.org/2000/xmlns/") continue;
    if (attribute.uri || !allowed.includes(attribute.local)) throw invalid();
    result[attribute.local] = attribute.value;
  }
  if (required.some((name) => !result[name])) throw invalid();
  return result;
}

// OPC part names are URI paths, not filesystem paths. Refuse aliases that can
// be interpreted differently by a consumer (including escaped separators).
function partName(value: string) {
  if (!value.startsWith("/") || /[\\%?#\s\u0000-\u001f]/u.test(value))
    throw invalid();
  const path = value.slice(1);
  if (
    !path ||
    path
      .split("/")
      .some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === ".." ||
          segment.endsWith("."),
      )
  )
    throw invalid();
  return path.toLowerCase();
}
function targetName(source: string, value: string) {
  if (
    !value ||
    /[\\%?#\s\u0000-\u001f]/u.test(value) ||
    /^[a-z][a-z0-9+.-]*:/i.test(value) ||
    value.startsWith("//")
  )
    throw invalid();
  if (value.startsWith("/")) return partName(value);
  const segments = source.split("/").slice(0, -1);
  for (const segment of value.split("/")) {
    if (segment === "..") {
      if (!segments.length) throw invalid();
      segments.pop();
    } else if (segment !== ".") {
      if (!segment) throw invalid();
      segments.push(segment);
    }
  }
  return partName(`/${segments.join("/")}`);
}
function relationshipSource(name: string) {
  if (name === "_rels/.rels") return "";
  const match = /^(?:(.*)\/)?_rels\/([^/]+)\.rels$/.exec(name);
  if (!match) throw invalid();
  return `${match[1] ? `${match[1]}/` : ""}${match[2]}`;
}

const wordRoots: Record<string, string> = {
  "document.main": "document",
  "template.main": "document",
  header: "hdr",
  footer: "ftr",
  footnotes: "footnotes",
  endnotes: "endnotes",
  comments: "comments",
  styles: "styles",
  numbering: "numbering",
  settings: "settings",
  fontTable: "fonts",
  webSettings: "webSettings",
  "document.glossary": "glossaryDocument",
};
const relationTypes: Record<string, string[]> = {
  officeDocument: [mainMime],
  header: [`${wordMime}header+xml`],
  footer: [`${wordMime}footer+xml`],
  footnotes: [`${wordMime}footnotes+xml`],
  endnotes: [`${wordMime}endnotes+xml`],
  comments: [`${wordMime}comments+xml`],
  styles: [`${wordMime}styles+xml`],
  numbering: [`${wordMime}numbering+xml`],
  settings: [`${wordMime}settings+xml`],
  fontTable: [`${wordMime}fontTable+xml`],
  webSettings: [`${wordMime}webSettings+xml`],
  glossaryDocument: [`${wordMime}document.glossary+xml`],
  theme: [`${officeMime}theme+xml`],
  themeOverride: [`${officeMime}themeOverride+xml`],
  customXml: ["application/xml", "text/xml"],
  customXmlProps: [`${officeMime}customXmlProperties+xml`],
  "extended-properties": [`${officeMime}extended-properties+xml`],
  "custom-properties": [`${officeMime}custom-properties+xml`],
  image: ["image/png", "image/jpeg"],
  "package-thumbnail": ["image/png", "image/jpeg"],
  "word-styles-with-effects": [stylesWithEffectsMime],
};
function relationKind(type: string) {
  if (type === `${relationshipNamespace}/metadata/thumbnail`)
    return "package-thumbnail";
  if (
    type ===
    "http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects"
  )
    return "word-styles-with-effects";
  for (const prefix of relationshipPrefixes)
    if (type.startsWith(prefix)) return type.slice(prefix.length);
  if (type === `${relationshipNamespace}/metadata/core-properties`)
    return "core-properties";
  throw invalid();
}
relationTypes["core-properties"] = [
  "application/vnd.openxmlformats-package.core-properties+xml",
];

function expectedRoot(type: string) {
  if (type === stylesWithEffectsMime)
    return { name: "styles", namespaces: wordNamespaces };
  if (type.startsWith(wordMime) && type.endsWith("+xml")) {
    const name = wordRoots[type.slice(wordMime.length, -4)];
    if (name) return { name, namespaces: wordNamespaces };
  }
  if (type === `${officeMime}theme+xml`)
    return { name: "theme", namespaces: drawingNamespaces };
  if (type === `${officeMime}themeOverride+xml`)
    return { name: "themeOverride", namespaces: drawingNamespaces };
  if (type === "application/xml" || type === "text/xml") return null;
  const roots: Record<string, { name: string; namespaces: string[] }> = {
    "application/vnd.openxmlformats-package.core-properties+xml": {
      name: "coreProperties",
      namespaces: [
        "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
      ],
    },
    [`${officeMime}extended-properties+xml`]: {
      name: "Properties",
      namespaces: [
        "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
        "http://purl.oclc.org/ooxml/officeDocument/extendedProperties",
      ],
    },
    [`${officeMime}custom-properties+xml`]: {
      name: "Properties",
      namespaces: [
        "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties",
        "http://purl.oclc.org/ooxml/officeDocument/customProperties",
      ],
    },
    [`${officeMime}customXmlProperties+xml`]: {
      name: "datastoreItem",
      namespaces: [
        "http://schemas.openxmlformats.org/officeDocument/2006/customXml",
        "http://purl.oclc.org/ooxml/officeDocument/customXml",
      ],
    },
  };
  if (!roots[type]) throw invalid();
  return roots[type];
}

/** Validate the OPC inventory before trusting any XML/binary classification. */
export async function validateDocxPackage(
  parts: Map<string, Buffer>,
  inspectXml: (bytes: Buffer, main: boolean) => void,
) {
  const manifest = parts.get("[content_types].xml");
  if (!manifest || !parts.has("_rels/.rels")) throw invalid();
  const defaults = new Map<string, string>();
  const overrides = new Map<string, string>();
  xml(
    manifest,
    (tag, depth) => {
      if (
        tag.uri !== contentNamespace ||
        (depth === 1 ? tag.local !== "Types" : depth !== 2)
      )
        throw invalid();
      if (depth === 1) {
        attributes(tag, [], []);
        return;
      }
      if (tag.local === "Default") {
        const attr = attributes(
          tag,
          ["Extension", "ContentType"],
          ["Extension", "ContentType"],
        );
        const extension = attr.Extension.toLowerCase();
        if (!/^[a-z0-9]+$/.test(extension) || defaults.has(extension))
          throw invalid();
        defaults.set(extension, attr.ContentType);
      } else if (tag.local === "Override") {
        const attr = attributes(
          tag,
          ["PartName", "ContentType"],
          ["PartName", "ContentType"],
        );
        const name = partName(attr.PartName);
        if (
          !parts.has(name) ||
          name === "[content_types].xml" ||
          overrides.has(name)
        )
          throw invalid();
        overrides.set(name, attr.ContentType);
      } else throw invalid();
    },
    true,
  );
  const types = new Map<string, string>();
  for (const name of parts.keys()) {
    if (name === "[content_types].xml") continue;
    partName(`/${name}`);
    const type = overrides.get(name) ?? defaults.get(name.split(".").at(-1)!);
    if (!type || type !== type.trim()) throw invalid();
    types.set(name, type);
    if (name.endsWith(".rels") !== (type === relationshipMime)) throw invalid();
  }
  const edges = new Map<string, string[]>();
  const relationshipCounts = new Map<string, number>();
  const thumbnails = new Set<string>();
  let main: string | undefined;
  for (const [name, type] of types) {
    if (type !== relationshipMime) continue;
    const source = relationshipSource(name);
    if (source && !parts.has(source)) throw invalid();
    const ids = new Set<string>();
    let thumbnailCount = 0;
    const targets: string[] = [];
    xml(
      parts.get(name)!,
      (tag, depth) => {
        if (
          tag.uri !== relationshipNamespace ||
          (depth === 1
            ? tag.local !== "Relationships"
            : depth !== 2 || tag.local !== "Relationship")
        )
          throw invalid();
        if (depth === 1) {
          attributes(tag, [], []);
          return;
        }
        const attr = attributes(
          tag,
          ["Id", "Type", "Target", "TargetMode"],
          ["Id", "Type", "Target"],
        );
        if (ids.has(attr.Id) || !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(attr.Id))
          throw invalid();
        ids.add(attr.Id);
        const kind = relationKind(attr.Type);
        // OPC thumbnail parts are internal, one per source, with no outgoing relations.
        if (kind === "package-thumbnail" && ++thumbnailCount > 1)
          throw invalid();
        if (attr.TargetMode === "External") {
          if (kind !== "hyperlink" || /[\u0000-\u0020]/u.test(attr.Target))
            throw invalid();
          const url = new URL(attr.Target);
          if (
            !["http:", "https:", "mailto:"].includes(url.protocol) ||
            url.username ||
            url.password
          )
            throw invalid();
          return;
        }
        if (attr.TargetMode && attr.TargetMode !== "Internal") throw invalid();
        const target = targetName(source, attr.Target);
        const targetType = types.get(target);
        if (
          !targetType ||
          targetType === relationshipMime ||
          !relationTypes[kind]?.includes(targetType)
        )
          throw invalid();
        if (kind === "officeDocument") {
          if (source || main) throw invalid();
          main = target;
        }
        if (kind === "package-thumbnail") thumbnails.add(target);
        targets.push(target);
      },
      true,
    );
    edges.set(source, targets);
    relationshipCounts.set(source, ids.size);
  }
  if (!main || types.get(main) !== mainMime) throw invalid();
  for (const thumbnail of thumbnails) {
    if (relationshipCounts.get(thumbnail)) throw invalid();
  }
  const reached = new Set<string>();
  const pending = [""];
  while (pending.length) {
    const source = pending.pop()!;
    for (const target of edges.get(source) ?? []) {
      if (reached.has(target)) continue;
      reached.add(target);
      pending.push(target);
    }
  }
  for (const [name, type] of types) {
    if (type === relationshipMime) continue;
    if (!reached.has(name)) throw invalid();
    if (
      type.endsWith("+xml") ||
      type === "application/xml" ||
      type === "text/xml"
    ) {
      const root = expectedRoot(type);
      xml(parts.get(name)!, (tag, depth) => {
        if (
          depth === 1 &&
          root &&
          (tag.local !== root.name || !root.namespaces.includes(tag.uri))
        )
          throw invalid();
      });
      inspectXml(parts.get(name)!, name === main);
    } else if (
      !relationTypes.image.includes(type) ||
      !(await validateImageContent(
        parts.get(name)!,
        type === "image/png" ? "png" : "jpeg",
      ))
    )
      throw invalid();
  }
}
