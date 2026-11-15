/** Infrastructure smoke test only: actual local Storage HTTP and bytes, not Documents authorization. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Storage requires a guarded disposable target");
const target = await readRecruitmentTarget(id);
if (!target.storage) throw new Error("Storage profile required");

test("disposable Storage creates, reads and deletes real bytes", async () => {
  const bucket = `qa-${randomUUID()}`;
  const headers = {
    apikey: target.serviceRoleKey,
    Authorization: `Bearer ${target.serviceRoleKey}`,
  };
  const base = `${target.apiUrl}/storage/v1`;
  const call = (path: string, init: RequestInit = {}) =>
    fetch(base + path, {
      ...init,
      headers: { ...headers, ...init.headers },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
  const bytes = Buffer.from([0, 1, 2, 127, 128, 255]);
  const create = await call("/bucket", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: bucket, name: bucket, public: false }),
  });
  assert.equal(create.status, 200);
  try {
    const upload = await call(`/object/${bucket}/fixture.bin`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: bytes,
    });
    assert.equal(upload.status, 200);
    const read = await call(`/object/authenticated/${bucket}/fixture.bin`);
    assert.equal(read.status, 200);
    assert.deepEqual(Buffer.from(await read.arrayBuffer()), bytes);
    const remove = await call(`/object/${bucket}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefixes: ["fixture.bin"] }),
    });
    assert.equal(remove.status, 200);
    const missing = await call(`/object/authenticated/${bucket}/fixture.bin`);
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).code, "NoSuchKey");
  } finally {
    const removeBucket = await call(`/bucket/${bucket}`, { method: "DELETE" });
    assert.equal(removeBucket.status, 200);
  }
});
