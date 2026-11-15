/** Disposable target only; the transaction rolls back its synthetic ledger and hold. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
const targetId = process.env.RECRUITMENT_TARGET_ID;
if (!targetId || !targetId.startsWith("restore-qa-"))
  throw new Error("Restore test requires its own guarded target");
const target = await readRecruitmentTarget(targetId);

test(
  "restore source hold keeps expired ledger entries against cleanup purge",
  { timeout: 60_000 },
  async () => {
    const sql = postgres({
      ...target.db,
      max: 1,
      ssl: false,
      onnotice: () => {},
    });
    const marker = new Error("rollback synthetic fixture");
    const holdId = randomUUID(),
      versionId = randomUUID(),
      ownerId = randomUUID(),
      documentId = randomUUID(),
      objectKey = randomUUID();
    try {
      await assert.rejects(
        sql.begin(async (tx) => {
          await tx.unsafe(
            "insert into recruitment_private.document_deletion_ledger(version_id,owner_id,document_id,object_key,confirmed_at) values($1::uuid,$2::uuid,$3::uuid,$4,clock_timestamp()-interval '8 days')",
            [versionId, ownerId, documentId, objectKey],
          );
          await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ role: "documents_restore_source" }),
          ]);
          await tx.unsafe("set local role documents_restore_source");
          const held = await tx.unsafe(
            "select public.begin_document_restore_hold($1::uuid,clock_timestamp()-interval '1 day') as value",
            [holdId],
          );
          assert.equal(held[0].value.kind, "held");
          const listed = await tx.unsafe(
            "select public.list_document_restore_ledger($1::uuid,null,100) as value",
            [holdId],
          );
          assert.ok(
            listed[0].value.some(
              (item: { versionId: string }) => item.versionId === versionId,
            ),
          );
          await tx.unsafe("reset role");
          await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ role: "documents_cleanup" }),
          ]);
          await tx.unsafe("set local role documents_cleanup");
          const purge = await tx.unsafe(
            "select public.purge_expired_document_ledgers() as value",
          );
          assert.equal(purge[0].value, 0);
          await tx.unsafe("reset role");
          const rows = await tx.unsafe(
            "select 1 from recruitment_private.document_deletion_ledger where version_id=$1::uuid",
            [versionId],
          );
          assert.equal(rows.length, 1);
          throw marker;
        }),
        (error) => error === marker,
      );
    } finally {
      await sql.end();
    }
  },
);
