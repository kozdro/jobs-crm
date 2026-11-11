import { strict as assert } from "node:assert";
import { test } from "vitest";
import {
  createRequestGeneration,
  unavailableSelections,
} from "../../src/components/documents/refresh-state.ts";

test("older requests cannot replace data after a newer response or mutation", () => {
  const requests = createRequestGeneration();
  const old = requests.next();
  const newer = requests.next();
  assert.equal(requests.isCurrent(newer), true);
  assert.equal(requests.isCurrent(old), false);
  requests.invalidate();
  assert.equal(requests.isCurrent(newer), false);
  assert.equal(requests.isCurrent(requests.next()), true);
});

test("preserves selection and identifies only versions no longer available", () => {
  const selected = ["a", "b"];
  assert.deepEqual(
    unavailableSelections(selected, [{ id: "b" }, { id: "c" }]),
    ["a"],
  );
  assert.deepEqual(selected, ["a", "b"]);
  assert.deepEqual(
    unavailableSelections(selected, [{ id: "a" }, { id: "b" }]),
    [],
  );
});
