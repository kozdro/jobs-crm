import { strict as assert } from "node:assert";
import { test } from "vitest";
import {
  documentsChangedEvent,
  isDocumentsChangeFor,
  isDocumentsChangePending,
} from "../../src/components/documents/document-events.ts";

test("document invalidation is owner-scoped and distinguishes pending from settled", () => {
  const pending = new CustomEvent(documentsChangedEvent, {
    detail: { owner: "owner-a", pending: true },
  });
  const settled = new CustomEvent(documentsChangedEvent, {
    detail: { owner: "owner-a", pending: false },
  });
  assert.equal(isDocumentsChangeFor(pending, "owner-a"), true);
  assert.equal(isDocumentsChangeFor(pending, "owner-b"), false);
  assert.equal(
    isDocumentsChangeFor(new Event(documentsChangedEvent), "owner-a"),
    false,
  );
  assert.equal(isDocumentsChangePending(pending), true);
  assert.equal(isDocumentsChangePending(settled), false);
});
