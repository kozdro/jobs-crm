/** Direct API cannot forge a validated version, even using its own owner identity. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import { createAccounts, request } from "../rls/data-api.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id)
  throw new Error("Documents security requires a guarded disposable target");
const target = await readRecruitmentTarget(id);

test(
  "A, B and anonymous cannot directly forge a ready document version",
  { timeout: 120_000 },
  async () => {
    const [a, b] = await createAccounts(target);
    for (const user of [a, b, undefined]) {
      const reply = await request(
        target,
        user?.token,
        "/rest/v1/document_version",
        "POST",
        {
          id: randomUUID(),
          owner_id: user?.id ?? randomUUID(),
          document_id: randomUUID(),
          number: 1,
          state: "ready",
          filename: "synthetic.txt",
          mime: "text/plain",
          size: 1,
        },
        {},
        "public",
      );
      assert.ok(
        [401, 403].includes(reply.status),
        `Expected authorization denial, got ${reply.status}`,
      );
    }
  },
);
