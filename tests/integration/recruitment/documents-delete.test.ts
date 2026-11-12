/** Disposable SQL simulation of still-revoked delete commands; actual Storage reads verify revocation. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import { createAccounts, request } from "../rls/data-api.ts";
const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Delete test requires guarded disposable target");
const target = await readRecruitmentTarget(id);
function requestId(at = Date.now()) {
  const b = randomBytes(16);
  b.writeUIntBE(at, 0, 6);
  b[6] = (b[6] & 15) | 0x70;
  b[8] = (b[8] & 63) | 0x80;
  const s = b.toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
test(
  "SQL preview staleness, owner scope, expiry and atomic deletion revocation",
  { timeout: 120_000 },
  async () => {
    const [a, b] = await createAccounts(target);
    const sql = postgres({
      ...target.db,
      max: 2,
      ssl: false,
      onnotice: () => {},
    });
    const doc = randomUUID(),
      version = randomUUID(),
      caseId = randomUUID(),
      key = randomUUID();
    try {
      await sql`insert into public.recruitment_case(id,owner_id,request_id,title) values(${caseId}::uuid,${a.id}::uuid,${randomUUID()}::uuid,'Synthetic case')`;
      await sql`insert into public.document(id,owner_id,name) values(${doc}::uuid,${a.id}::uuid,'Synthetic document')`;
      await sql`insert into public.document_version(id,owner_id,document_id,number,state,filename,mime,size) values(${version}::uuid,${a.id}::uuid,${doc}::uuid,1,'ready','synthetic.txt','text/plain',5)`;
      await sql`insert into recruitment_private.document_object(version_id,owner_id,request_id,object_key,bytes,phase) values(${version}::uuid,${a.id}::uuid,${randomUUID()}::uuid,${key},5,'ready')`;
      const objectUrl = `${target.apiUrl}/storage/v1/object/documents/${key}`;
      const auth = (credential: string) => ({
        apikey: target.anonKey,
        Authorization: `Bearer ${credential}`,
      });
      assert.equal(
        (
          await fetch(objectUrl, {
            method: "POST",
            headers: {
              ...auth(target.serviceRoleKey),
              "content-type": "text/plain",
            },
            body: "hello",
          })
        ).status,
        200,
      );
      for (const user of [a, b, undefined]) {
        const direct = await request(
          target,
          user?.token,
          "/rest/v1/rpc/preview_document_delete",
          "POST",
          { p_version_id: version, p_document_id: null },
          {},
          "public",
        );
        if (user === a) assert.equal(direct.status, 200);
        else assert.ok(direct.status >= 400);
      }
      const preview = (owner: string) =>
        sql.begin(async (tx) => {
          await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ sub: owner, role: "authenticated" }),
          ]);
          const [row] = await tx.unsafe(
            "select public.preview_document_delete($1::uuid,null) result",
            [version],
          );
          return row.result as { preview: { token: string } };
        });
      const authorize = (owner: string, token: string, request = requestId()) =>
        sql.begin(async (tx) => {
          await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ role: "documents_delete_authorizer" }),
          ]);
          const [row] = await tx.unsafe(
            "select public.authorize_document_delete($1::uuid,$2::uuid,$3::uuid) result",
            [owner, request, token],
          );
          return row.result as { kind: string };
        });
      await assert.rejects(preview(b.id));
      const expired = (await preview(a.id)).preview.token;
      await sql`update recruitment_private.document_delete_preview set expires_at=clock_timestamp()-interval '1 second' where token=${expired}::uuid`;
      await assert.rejects(authorize(a.id, expired));
      const stale = (await preview(a.id)).preview.token;
      await assert.rejects(authorize(b.id, stale));
      await sql`insert into public.case_document(owner_id,case_id,version_id) values(${a.id}::uuid,${caseId}::uuid,${version}::uuid)`;
      await assert.rejects(authorize(a.id, stale));
      const [before] =
        await sql`select state from public.document_version where id=${version}::uuid`;
      assert.equal(before.state, "ready");
      const current = (await preview(a.id)).preview.token;
      const fenced = requestId();
      const fence = await request(
        target,
        a.token,
        "/rest/v1/rpc/reconcile_document_upload",
        "POST",
        { p_request_id: fenced },
        {},
        "public",
      );
      assert.equal((fence.body as { kind: string }).kind, "cancelled");
      await assert.rejects(authorize(a.id, current, fenced));
      await assert.rejects(
        authorize(a.id, current, requestId(Date.now() - 8 * 86400_000)),
      );
      const receipt = requestId();
      assert.equal((await authorize(a.id, current, receipt)).kind, "queued");
      const [after] =
        await sql`select v.state,o.phase from public.document_version v join recruitment_private.document_object o on o.version_id=v.id where v.id=${version}::uuid`;
      assert.equal(after.state, "deleting");
      assert.equal(after.phase, "deleting");
      const read = await fetch(
        `${target.apiUrl}/storage/v1/object/authenticated/documents/${key}`,
        { headers: auth(a.token) },
      );
      assert.ok(!read.ok);
      assert.equal((await authorize(a.id, current, receipt)).kind, "replayed");
      await assert.rejects(authorize(a.id, randomUUID(), receipt));
      await fetch(`${target.apiUrl}/storage/v1/object/documents`, {
        method: "DELETE",
        headers: {
          ...auth(target.serviceRoleKey),
          "content-type": "application/json",
        },
        body: JSON.stringify({ prefixes: [key] }),
      });
      await sql.begin(async (tx) => {
        await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: "documents_cleanup" }),
        ]);
        await tx.unsafe("select public.confirm_document_cleanup($1::uuid)", [
          version,
        ]);
      });
      assert.equal((await authorize(a.id, current, receipt)).kind, "replayed");
      const [receiptRow] =
        await sql`select row_to_json(c)::text value from recruitment_private.document_delete_command c where owner_id=${a.id}::uuid and request_id=${receipt}::uuid`;
      assert.ok(!String(receiptRow.value).includes("synthetic.txt"));
      const secondDoc = randomUUID();
      const [v1, v2] = [randomUUID(), randomUUID()].sort();
      const k1 = randomUUID(),
        k2 = randomUUID();
      await sql`insert into public.document(id,owner_id,name) values(${secondDoc}::uuid,${a.id}::uuid,'Synthetic multi-version')`;
      await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${v1}::uuid,${a.id}::uuid,${secondDoc}::uuid,1,'ready'),(${v2}::uuid,${a.id}::uuid,${secondDoc}::uuid,2,'ready')`;
      await sql`insert into recruitment_private.document_object(version_id,owner_id,request_id,object_key,bytes,phase) values(${v1}::uuid,${a.id}::uuid,${randomUUID()}::uuid,${k1},5,'ready'),(${v2}::uuid,${a.id}::uuid,${randomUUID()}::uuid,${k2},5,'ready')`;
      const whole = await sql.begin(async (tx) => {
        await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ sub: a.id, role: "authenticated" }),
        ]);
        const [row] = await tx.unsafe(
          "select public.preview_document_delete(null,$1::uuid) result",
          [secondDoc],
        );
        return row.result as { preview: { token: string } };
      });
      await sql`insert into recruitment_private.document_deletion_ledger(version_id,owner_id,document_id,object_key) values(${v2}::uuid,${a.id}::uuid,${secondDoc}::uuid,${k2})`;
      await assert.rejects(authorize(a.id, whole.preview.token));
      const rollback =
        await sql`select state from public.document_version where id in (${v1}::uuid,${v2}::uuid) order by id`;
      assert.deepEqual(
        rollback.map((row) => row.state),
        ["ready", "ready"],
      );
    } finally {
      await fetch(`${target.apiUrl}/storage/v1/object/documents`, {
        method: "DELETE",
        headers: {
          apikey: target.anonKey,
          Authorization: `Bearer ${target.serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ prefixes: [key] }),
      });
      await sql.end();
    }
  },
);
