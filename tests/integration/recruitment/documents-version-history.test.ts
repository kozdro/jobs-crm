/** Real owner Data API reservations; delete authorization is explicitly simulated on disposable SQL. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import { createAccounts, request } from "../rls/data-api.ts";
const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Guarded target required");
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
  "version numbers, tombstones and delete/reserve serialization preserve history",
  { timeout: 120_000 },
  async () => {
    const [a] = await createAccounts(target);
    const sql = postgres({
      ...target.db,
      max: 3,
      ssl: false,
      onnotice: () => {},
    });
    const doc = randomUUID(),
      v1 = randomUUID(),
      v2 = randomUUID(),
      key = randomUUID();
    const intent = (documentId: string) => ({
      scope: "version",
      documentId,
      filename: "synthetic.txt",
      mime: "text/plain",
      bytes: 5,
      sha256: "a".repeat(64),
    });
    const reserve = (documentId: string) =>
      request(
        target,
        a.token,
        "/rest/v1/rpc/reserve_document_upload",
        "POST",
        { p_request_id: requestId(), p_intent: intent(documentId) },
        {},
        "public",
      );
    try {
      await sql`insert into public.document(id,owner_id,name,is_cv) values(${doc}::uuid,${a.id}::uuid,'Synthetic CV',true)`;
      await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${v1}::uuid,${a.id}::uuid,${doc}::uuid,1,'ready'),(${v2}::uuid,${a.id}::uuid,${doc}::uuid,2,'deleting')`;
      await sql`insert into recruitment_private.document_object(version_id,owner_id,request_id,object_key,bytes,phase) values(${v2}::uuid,${a.id}::uuid,${randomUUID()}::uuid,${key},5,'deleting')`;
      await sql`insert into recruitment_private.document_deletion_ledger(version_id,owner_id,document_id,object_key) values(${v2}::uuid,${a.id}::uuid,${doc}::uuid,${key})`;
      await sql.begin(async (tx) => {
        await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: "documents_cleanup" }),
        ]);
        await tx.unsafe("select public.confirm_document_cleanup($1::uuid)", [
          v2,
        ]);
      });
      const [gone] =
        await sql`select count(*)::int n from public.document_version where id=${v2}::uuid`;
      assert.equal(gone.n, 0);
      const next = await reserve(doc);
      assert.equal(next.status, 200, JSON.stringify(next.body));
      const newId = (next.body as { versionId: string }).versionId;
      const [newVersion] =
        await sql`select number from public.document_version where id=${newId}::uuid`;
      assert.equal(newVersion.number, 3);
      const tombstone = randomUUID(),
        deleted = randomUUID();
      await sql`insert into public.document(id,owner_id,name,is_cv) values(${tombstone}::uuid,${a.id}::uuid,'Synthetic tombstone',true)`;
      await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${deleted}::uuid,${a.id}::uuid,${tombstone}::uuid,1,'deleted')`;
      await sql`update public.document set name=null,is_cv=null where id=${tombstone}::uuid`;
      const denied = await reserve(tombstone);
      assert.ok(denied.status >= 400, "historical tombstone cannot be reused");
      const raceDoc = randomUUID(),
        raceVersion = randomUUID(),
        raceKey = randomUUID();
      await sql`insert into public.document(id,owner_id,name,is_cv) values(${raceDoc}::uuid,${a.id}::uuid,'Race synthetic',true)`;
      await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${raceVersion}::uuid,${a.id}::uuid,${raceDoc}::uuid,1,'ready')`;
      await sql`insert into recruitment_private.document_object(version_id,owner_id,request_id,object_key,bytes,phase) values(${raceVersion}::uuid,${a.id}::uuid,${randomUUID()}::uuid,${raceKey},5,'ready')`;
      const preview = await sql.begin(async (tx) => {
        await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ sub: a.id, role: "authenticated" }),
        ]);
        const [row] = await tx.unsafe(
          "select public.preview_document_delete(null,$1::uuid) result",
          [raceDoc],
        );
        return row.result as { preview: { token: string } };
      });
      const [deletion, upload] = await Promise.allSettled([
        sql.begin(async (tx) => {
          await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ role: "documents_delete_authorizer" }),
          ]);
          const [row] = await tx.unsafe(
            "select public.authorize_document_delete($1::uuid,$2::uuid,$3::uuid) result",
            [a.id, requestId(), preview.preview.token],
          );
          return row.result as { kind: string };
        }),
        reserve(raceDoc),
      ]);
      assert.equal(upload.status, "fulfilled");
      if (upload.status !== "fulfilled")
        throw new Error("Reservation transport failed");
      if (deletion.status === "fulfilled") {
        assert.equal(deletion.value.kind, "queued");
        assert.ok(
          upload.value.status >= 400,
          "new version must not start once whole document deletion wins",
        );
      } else {
        assert.equal(
          upload.value.status,
          200,
          "delete conflict requires successful competing reservation",
        );
        assert.ok(
          ["PT409", "PT412"].includes(
            (deletion.reason as { code?: string }).code ?? "",
          ),
        );
      }
    } finally {
      await sql.end();
    }
  },
);
