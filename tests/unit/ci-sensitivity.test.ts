import { expect, it } from "vitest";

it("deliberate isolated CI sensitivity failure", () => {
  expect(true).toBe(false);
});
