/** Owner-scoped metadata and link commands; real Data API, synthetic DB fixtures. */
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
  "rename, label and case links preserve history and owner boundaries",
  { timeout: 120_000 },
  async () => {
    const [a, b] = await createAccounts(target),
      sql = postgres({ ...target.db, max: 1, ssl: false, onnotice: () => {} });
    const doc = randomUUID(),
      v1 = randomUUID(),
      v2 = randomUUID(),
      caseId = randomUUID(),
      secondCase = randomUUID();
    const call = (token: string | undefined, key: string, payload: unknown) =>
      request(
        target,
        token,
        "/rest/v1/rpc/execute_document_command",
        "POST",
        { p_request_id: key, p_payload: payload },
        {},
        "public",
      );
    try {
      await sql`insert into public.recruitment_case(id,owner_id,request_id,title) values(${caseId}::uuid,${a.id}::uuid,${randomUUID()}::uuid,'Synthetic case')`;
      await sql`insert into public.recruitment_case(id,owner_id,request_id,title) values(${secondCase}::uuid,${a.id}::uuid,${randomUUID()}::uuid,'Synthetic second case')`;
      await sql`insert into public.document(id,owner_id,name,is_cv) values(${doc}::uuid,${a.id}::uuid,'Synthetic CV',true)`;
      await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${v1}::uuid,${a.id}::uuid,${doc}::uuid,1,'ready'),(${v2}::uuid,${a.id}::uuid,${doc}::uuid,2,'ready')`;
      const rename = {
          action: "rename",
          documentId: doc,
          revision: 0,
          name: "Synthetic renamed",
          isCv: true,
        },
        key = requestId();
      const saved = await call(a.token, key, rename);
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      const replay = await call(a.token, key, rename);
      assert.equal((replay.body as { kind: string }).kind, "replayed");
      assert.ok(
        (await call(a.token, key, { ...rename, name: "Other" })).status >= 400,
      );
      assert.ok((await call(b.token, requestId(), rename)).status >= 400);
      assert.ok((await call(undefined, requestId(), rename)).status >= 400);
      const label = await call(a.token, requestId(), {
        action: "label",
        versionId: v1,
        revision: 0,
        label: "Synthetic label",
      });
      assert.equal(label.status, 200, JSON.stringify(label.body));
      const attach = await call(a.token, requestId(), {
        action: "attach",
        caseId,
        versionId: v1,
      });
      assert.equal(attach.status, 200, JSON.stringify(attach.body));
      const link = (attach.body as { linkId: string }).linkId;
      const reused = await call(a.token, requestId(), {
        action: "attach",
        caseId: secondCase,
        versionId: v1,
      });
      assert.equal(reused.status, 200, JSON.stringify(reused.body));
      const otherDoc = randomUUID(),
        otherVersion = randomUUID();
      await sql`insert into public.document(id,owner_id,name,is_cv) values(${otherDoc}::uuid,${a.id}::uuid,'Other document',true)`;
      await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${otherVersion}::uuid,${a.id}::uuid,${otherDoc}::uuid,1,'ready')`;
      assert.ok(
        (
          await call(a.token, requestId(), {
            action: "change-version",
            caseId,
            linkId: link,
            revision: 0,
            versionId: otherVersion,
          })
        ).status >= 400,
      );
      const change = await call(a.token, requestId(), {
        action: "change-version",
        caseId,
        linkId: link,
        revision: 0,
        versionId: v2,
      });
      assert.equal(change.status, 200, JSON.stringify(change.body));
      const detach = await call(a.token, requestId(), {
        action: "detach",
        caseId,
        linkId: link,
        revision: 1,
      });
      assert.equal(detach.status, 200, JSON.stringify(detach.body));
      assert.equal(
        (
          await call(a.token, requestId(), {
            action: "detach",
            caseId: secondCase,
            linkId: (reused.body as { linkId: string }).linkId,
            revision: 0,
          })
        ).status,
        200,
      );
      const caseOnly = randomUUID(),
        caseOnlyVersion = randomUUID(),
        caseOnlyLink = randomUUID();
      await sql`insert into public.document(id,owner_id,name,case_id) values(${caseOnly}::uuid,${a.id}::uuid,'Case only',${caseId}::uuid)`;
      await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${caseOnlyVersion}::uuid,${a.id}::uuid,${caseOnly}::uuid,1,'ready')`;
      await sql`insert into public.case_document(id,owner_id,case_id,version_id) values(${caseOnlyLink}::uuid,${a.id}::uuid,${caseId}::uuid,${caseOnlyVersion}::uuid)`;
      assert.ok(
        (
          await call(a.token, requestId(), {
            action: "detach",
            caseId,
            linkId: caseOnlyLink,
            revision: 0,
          })
        ).status >= 400,
      );
      const [history] =
        await sql`select count(*)::int n from public.document_metadata_revision where owner_id=${a.id}::uuid and document_id=${doc}::uuid`;
      assert.equal(history.n, 2);
      const audit =
        await sql`select action,before_values,after_values from public.document_metadata_revision where owner_id=${a.id}::uuid and document_id=${doc}::uuid order by action`;
      assert.equal(
        audit.find((row) => row.action === "rename")?.before_values.name,
        "Synthetic CV",
      );
      assert.equal(
        audit.find((row) => row.action === "rename")?.after_values.name,
        "Synthetic renamed",
      );
      await sql`delete from public.document_version where id=${v1}::uuid`;
      const [redaction] =
        await sql`select count(*)::int n from public.document_metadata_revision where document_id=${doc}::uuid and (before_values is not null or after_values is not null)`;
      assert.equal(redaction.n, 0);
      const [remainingAudit] =
        await sql`select count(*)::int n from public.document_metadata_revision where document_id=${doc}::uuid`;
      assert.equal(
        remainingAudit.n,
        1,
        "deleted version's audit rows must not persist",
      );
      assert.ok(
        (await call(a.token, key, rename)).status >= 400,
        "scrubbed receipt must not resurrect old metadata",
      );
      const [events] =
        await sql`select count(*)::int n from public.recruitment_case_event where case_id=${caseId}::uuid`;
      assert.equal(events.n, 0);
    } finally {
      await sql.end();
    }
  },
);
