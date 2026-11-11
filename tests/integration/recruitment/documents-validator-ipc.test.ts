/** Actual isolated validator IPC and Storage; admin is used only to seed synthetic pending fixtures. */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import { createAccounts } from "../rls/data-api.ts";
const id = process.env.RECRUITMENT_TARGET_ID,
  url = process.env.DOCUMENTS_VALIDATOR_TEST_URL,
  secret = process.env.DOCUMENTS_VALIDATOR_TEST_SECRET;
if (!id || !url || !secret)
  throw new Error("Isolated validator fixture configuration required");
const parsed = new URL(url);
if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1")
  throw new Error("Local validator required");
const target = await readRecruitmentTarget(id);
function requestId() {
  const b = randomBytes(16);
  b.writeUIntBE(Date.now(), 0, 6);
  b[6] = (b[6] & 15) | 0x70;
  b[8] = (b[8] & 63) | 0x80;
  const s = b.toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
test(
  "validator authenticates IPC and finalizes only matching real pending bytes",
  { timeout: 120_000 },
  async () => {
    const [a] = await createAccounts(target),
      sql = postgres({ ...target.db, max: 1, ssl: false, onnotice: () => {} }),
      keys: string[] = [];
    const send = (
      versionId: string,
      credential?: string,
      extra: Record<string, unknown> = {},
    ) =>
      fetch(`${url}/validate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
        },
        body: JSON.stringify({ versionId, ...extra }),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
    const setup = async (
      bytes: Buffer,
      options: { upload?: boolean; hash?: string } = {},
    ) => {
      const doc = randomUUID(),
        version = randomUUID(),
        key = randomUUID(),
        req = requestId();
      keys.push(key);
      const digest =
        options.hash ?? createHash("sha256").update(bytes).digest("hex");
      await sql`insert into public.document(id,owner_id,name) values(${doc}::uuid,${a.id}::uuid,'Synthetic validator')`;
      await sql`insert into public.document_version(id,owner_id,document_id,number,state,filename) values(${version}::uuid,${a.id}::uuid,${doc}::uuid,1,'pending','synthetic.txt')`;
      await sql`insert into recruitment_private.document_object(version_id,owner_id,request_id,object_key,bytes,phase) values(${version}::uuid,${a.id}::uuid,${req}::uuid,${key},${bytes.length},'pending')`;
      await sql`insert into recruitment_private.document_upload_command(owner_id,request_id,document_id,version_id,intent) values(${a.id}::uuid,${req}::uuid,${doc}::uuid,${version}::uuid,${sql.json({ filename: "synthetic.txt", mime: "text/plain", bytes: bytes.length, sha256: digest })})`;
      if (options.upload !== false) {
        const response = await fetch(
          `${target.apiUrl}/storage/v1/object/documents/${key}`,
          {
            method: "POST",
            headers: {
              apikey: target.serviceRoleKey,
              Authorization: `Bearer ${target.serviceRoleKey}`,
              "content-type": "text/plain",
            },
            body: new Uint8Array(bytes),
          },
        );
        assert.equal(response.status, 200);
      }
      return { version, key };
    };
    try {
      const good = await setup(Buffer.from("synthetic bytes"));
      assert.ok(!(await send(good.version)).ok);
      assert.ok(!(await send(good.version, "wrong-secret")).ok);
      assert.ok(!(await send(randomUUID(), secret)).ok);
      assert.ok(
        !(await send(good.version, secret, { objectKey: randomUUID() })).ok,
      );
      const result = await send(good.version, secret);
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), {
        kind: "ready",
        versionId: good.version,
      });
      const [ready] =
        await sql`select state from public.document_version where id=${good.version}::uuid`;
      assert.equal(ready.state, "ready");
      assert.ok(
        !(await send(good.version, secret)).ok,
        "ready object cannot be revalidated",
      );
      const bad = await setup(Buffer.from("wrong bytes"), {
        hash: "a".repeat(64),
      });
      assert.ok(!(await send(bad.version, secret)).ok);
      const missing = await setup(Buffer.from("no object"), { upload: false });
      assert.ok(!(await send(missing.version, secret)).ok);
      const raced = await setup(Buffer.from("concurrent bytes"));
      const parallel = await Promise.all([
        send(raced.version, secret),
        send(raced.version, secret),
      ]);
      assert.ok(parallel.some((response) => response.ok));
      const stored = await fetch(
        `${target.apiUrl}/storage/v1/object/authenticated/documents/${raced.key}`,
        {
          headers: {
            apikey: target.serviceRoleKey,
            Authorization: `Bearer ${target.serviceRoleKey}`,
          },
        },
      );
      assert.equal(await stored.text(), "concurrent bytes");
      const [notReady] =
        await sql`select count(*)::int n from public.document_version where id in (${bad.version}::uuid,${missing.version}::uuid) and state<>'ready'`;
      assert.equal(notReady.n, 2);
    } finally {
      await fetch(`${target.apiUrl}/storage/v1/object/documents`, {
        method: "DELETE",
        headers: {
          apikey: target.serviceRoleKey,
          Authorization: `Bearer ${target.serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ prefixes: keys }),
      });
      await sql.end();
    }
  },
);
