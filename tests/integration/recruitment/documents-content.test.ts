/** Synthetic binary samples: content, not filename or client MIME, must determine acceptance. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const modulePath =
  "../../../src/modules/documents/application/validate-content.ts";
const { validateDocumentContent } = (await import(modulePath)) as {
  validateDocumentContent(
    bytes: Uint8Array,
    filename: string,
    declaredMime: string,
  ): Promise<{ mime: string }>;
};
const fixtures = resolve(import.meta.dirname, "../../fixtures/documents");
const file = (name: string) => readFile(resolve(fixtures, name));
const formats = [
  ["pdf", "application/pdf"],
  ["doc", "application/msword"],
  [
    "docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ["txt", "text/plain"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
] as const;

for (const [extension, mime] of formats) {
  test(`accept real synthetic ${extension} bytes`, async () => {
    const result = await validateDocumentContent(
      await file(`valid.${extension}`),
      `sample.${extension}`,
      mime,
    );
    assert.equal(result.mime, mime);
  });
  test(`reject mismatched ${extension} contents`, async () => {
    const wrong = extension === "png" ? "valid.pdf" : "valid.png";
    await assert.rejects(
      validateDocumentContent(await file(wrong), `sample.${extension}`, mime),
    );
  });
}
for (const [fixture, filename, mime] of [
  ["truncated.pdf", "sample.pdf", "application/pdf"],
  ["active.pdf", "sample.pdf", "application/pdf"],
  ["launch-link.pdf", "sample.pdf", "application/pdf"],
  ["truncated.doc", "sample.doc", "application/msword"],
  ["dde-field.doc", "sample.doc", "application/msword"],
  [
    "truncated.docx",
    "sample.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [
    "macro.docx",
    "sample.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [
    "bad-crc.docx",
    "sample.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [
    "bad-xml.docx",
    "sample.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [
    "dde.docx",
    "sample.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [
    "xxe.docx",
    "sample.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [
    "bomb.docx",
    "sample.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [
    "encrypted.docx",
    "sample.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ["invalid.txt", "sample.txt", "text/plain"],
  ["truncated.jpg", "sample.jpg", "image/jpeg"],
  ["truncated.png", "sample.png", "image/png"],
] as const) {
  test(`reject ${fixture}`, async () => {
    await assert.rejects(
      validateDocumentContent(await file(fixture), filename, mime),
    );
  });
}
test("reject misleading MIME for genuine PDF", async () => {
  await assert.rejects(
    validateDocumentContent(await file("valid.pdf"), "sample.pdf", "image/png"),
  );
});

test("TXT enforces zero, 20 MiB and one-byte-over boundaries", async () => {
  const limit = 20 * 1024 * 1024;
  await assert.rejects(
    validateDocumentContent(Buffer.alloc(0), "sample.txt", "text/plain"),
  );
  assert.equal(
    (
      await validateDocumentContent(
        Buffer.alloc(limit, 0x61),
        "sample.txt",
        "text/plain",
      )
    ).mime,
    "text/plain",
  );
  await assert.rejects(
    validateDocumentContent(
      Buffer.alloc(limit + 1, 0x61),
      "sample.txt",
      "text/plain",
    ),
  );
});
