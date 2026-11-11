/** Real Data API owner isolation; fixture writes use only the disposable DB administrator. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import { createAccounts, request } from "../rls/data-api.ts";
const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Owner isolation test requires guarded target");
const target = await readRecruitmentTarget(id);

test(
  "document, version and case relation remain owner scoped through Data API",
  { timeout: 120_000 },
  async () => {
    const [a, b] = await createAccounts(target);
    const sql = postgres({
      ...target.db,
      max: 1,
      ssl: false,
      onnotice: () => {},
    });
    const docId = randomUUID(),
      versionId = randomUUID(),
      caseId = randomUUID(),
      relationId = randomUUID(),
      otherCase = randomUUID();
    try {
      await sql`insert into public.recruitment_case(id,owner_id,request_id,title) values(${caseId}::uuid,${a.id}::uuid,${randomUUID()}::uuid,'Synthetic owner case'),(${otherCase}::uuid,${b.id}::uuid,${randomUUID()}::uuid,'Synthetic other case')`;
      await sql`insert into public.document(id,owner_id,name) values(${docId}::uuid,${a.id}::uuid,'Synthetic owner document')`;
      await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${versionId}::uuid,${a.id}::uuid,${docId}::uuid,1,'pending')`;
      await sql`insert into public.case_document(id,owner_id,case_id,version_id) values(${relationId}::uuid,${a.id}::uuid,${caseId}::uuid,${versionId}::uuid)`;
      await assert.rejects(
        sql`insert into public.case_document(owner_id,case_id,version_id) values(${a.id}::uuid,${otherCase}::uuid,${versionId}::uuid)`,
      );
      for (const [table, rowId] of [
        ["document", docId],
        ["document_version", versionId],
        ["case_document", relationId],
      ] as const) {
        for (const [user, expected] of [
          [a, 1],
          [b, 0],
        ] as const) {
          const reply = await request(
            target,
            user.token,
            `/rest/v1/${table}?select=id&id=eq.${rowId}`,
            "GET",
            undefined,
            {},
            "public",
          );
          assert.equal(reply.status, 200);
          assert.ok(Array.isArray(reply.body));
          assert.equal(reply.body.length, expected);
          const listing = await request(
            target,
            user.token,
            `/rest/v1/${table}?select=id&owner_id=eq.${a.id}`,
            "GET",
            undefined,
            {},
            "public",
          );
          assert.equal(listing.status, 200);
          assert.ok(Array.isArray(listing.body));
          assert.equal(listing.body.length, expected);
        }
        const anon = await request(
          target,
          undefined,
          `/rest/v1/${table}?select=id&id=eq.${rowId}`,
          "GET",
          undefined,
          {},
          "public",
        );
        assert.ok([401, 403].includes(anon.status));
      }
    } finally {
      await sql.end();
    }
  },
);
