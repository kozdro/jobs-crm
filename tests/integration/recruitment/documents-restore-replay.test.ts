/** Local-only sequential simulation; this does not prove live cutover or real backup restore. */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import postgres from "postgres";
import { captureLocalHeldLedger } from "../../../scripts/documents-restore/source.ts";
import {
  quarantineLocalTarget,
  replayLocalQuarantined,
} from "../../../scripts/documents-restore/replay-local.ts";
import {
  startRecruitmentTarget,
  migrateRecruitmentTarget,
  stopRecruitmentTarget,
  type RecruitmentTarget,
} from "../../../scripts/recruitment/target.ts";
const exec = promisify(execFile);
async function token(
  target: RecruitmentTarget,
  role: string,
  subject?: string,
) {
  const inspected = JSON.parse(
    (await exec("docker", ["inspect", `supabase_storage_${target.projectId}`]))
      .stdout,
  );
  const secret = (inspected[0].Config.Env as string[])
    .find((v) => v.startsWith("AUTH_JWT_SECRET="))
    ?.slice("AUTH_JWT_SECRET=".length);
  if (!secret) throw new Error("Local Storage signing secret unavailable");
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      role,
      ...(subject ? { sub: subject } : {}),
      iss: "supabase",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    }),
  ).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
}

test(
  "held source ledger replays a sent CV while preserving only the historical fact",
  { timeout: 600_000, skip: process.env.DOCUMENTS_RESTORE_OWN_TARGET !== "1" },
  async () => {
    const sourceId = `restore-qa-${randomUUID().slice(0, 8)}`;
    const targetId = `restore-qa-${randomUUID().slice(0, 8)}`;
    const ownerId = randomUUID(),
      documentId = randomUUID(),
      versionId = randomUUID(),
      objectKey = randomUUID();
    let sourceStarted = false,
      targetStarted = false;
    try {
      const source = await startRecruitmentTarget(sourceId);
      sourceStarted = true;
      await migrateRecruitmentTarget(sourceId);
      const sourceSql = postgres({
        ...source.db,
        max: 1,
        ssl: false,
        onnotice: () => {},
      });
      try {
        await sourceSql`insert into recruitment_private.document_deletion_ledger(version_id,owner_id,document_id,object_key,confirmed_at) values(${versionId}::uuid,${ownerId}::uuid,${documentId}::uuid,${objectKey},clock_timestamp())`;
      } finally {
        await sourceSql.end();
      }
      const held = await captureLocalHeldLedger(
        sourceId,
        await token(source, "documents_restore_source"),
        randomUUID(),
        new Date(Date.now() - 60_000).toISOString(),
      );
      assert.equal(held.entries.length, 1);
      // Separate guarded projects reuse one reserved Storage port profile. The
      // source is stopped after capture, so this simulation does not prove a live hold across cutover.
      await stopRecruitmentTarget(sourceId);
      sourceStarted = false;
      const target = await startRecruitmentTarget(targetId);
      targetStarted = true;
      await migrateRecruitmentTarget(targetId);
      await quarantineLocalTarget(targetId);
      const sql = postgres({
        ...target.db,
        max: 1,
        ssl: false,
        onnotice: () => {},
      });
      try {
        await sql`insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values(${ownerId}::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',${`synthetic-${randomUUID()}@example.invalid`},now(),now())`;
        await sql`insert into public.document(id,owner_id,name,is_cv) values(${documentId}::uuid,${ownerId}::uuid,'Synthetic old document',true)`;
        await sql`insert into public.document_version(id,owner_id,document_id,number,state,filename,mime,size) values(${versionId}::uuid,${ownerId}::uuid,${documentId}::uuid,1,'ready','synthetic-old.txt','text/plain',5)`;
        await sql`insert into recruitment_private.document_object(version_id,owner_id,request_id,object_key,bytes,phase) values(${versionId}::uuid,${ownerId}::uuid,${randomUUID()}::uuid,${objectKey},5,'ready')`;
        const caseId = randomUUID();
        await sql`select set_config('request.jwt.claim.sub',${ownerId},false)`;
        await sql`insert into public.recruitment_case(id,owner_id,request_id,title) values(${caseId}::uuid,${ownerId}::uuid,${randomUUID()}::uuid,'Synthetic application')`;
        const application =
          await sql`select public.record_application_with_documents(${randomUUID()}::uuid,${caseId}::uuid,null,ARRAY[${versionId}::uuid]) as value`;
        const eventId = application[0].value.event.id as string;
        const uploaded = await fetch(
          `${target.apiUrl}/storage/v1/object/documents/${objectKey}`,
          {
            method: "POST",
            headers: {
              apikey: target.serviceRoleKey,
              Authorization: `Bearer ${target.serviceRoleKey}`,
              "content-type": "text/plain",
            },
            body: "hello",
          },
        );
        assert.equal(uploaded.status, 200);
        const ownerJwt = await token(target, "authenticated", ownerId);
        const cleanupJwt = await token(target, "documents_cleanup");
        const realFetch = globalThis.fetch;
        let lostConfirmation = false;
        try {
          globalThis.fetch = async (input, init) => {
            const response = await realFetch(input, init);
            if (
              !lostConfirmation &&
              String(input).includes("/rest/v1/rpc/confirm_document_cleanup")
            ) {
              lostConfirmation = true;
              throw new Error("Synthetic loss after server confirmation");
            }
            return response;
          };
          await assert.rejects(
            replayLocalQuarantined(targetId, cleanupJwt, held),
          );
          assert.equal(lostConfirmation, true);
        } finally {
          globalThis.fetch = realFetch;
        }
        const result = await replayLocalQuarantined(targetId, cleanupJwt, held);
        assert.deepEqual(result, { publication: "blocked", confirmed: 1 });
        const inventory =
          await sql`select 1 from recruitment_private.document_object where version_id=${versionId}::uuid`;
        const version =
          await sql`select state,number,filename,mime,size,label from public.document_version where id=${versionId}::uuid`;
        const event =
          await sql`select 1 from public.recruitment_case_event where owner_id=${ownerId}::uuid and id=${eventId}::uuid and kind='application'`;
        const reference =
          await sql`select 1 from public.document_sent_reference where owner_id=${ownerId}::uuid and event_id=${eventId}::uuid and version_id=${versionId}::uuid`;
        const document =
          await sql`select name,is_cv from public.document where id=${documentId}::uuid`;
        const receipt =
          await sql`select result from public.document_application_command where owner_id=${ownerId}::uuid and case_id=${caseId}::uuid`;
        const stored =
          await sql`select 1 from storage.objects where bucket_id='documents' and name=${objectKey}`;
        assert.equal(inventory.length, 0);
        assert.equal(version.length, 1);
        assert.deepEqual(
          { ...version[0] },
          {
            state: "deleted",
            number: 1,
            filename: null,
            mime: null,
            size: null,
            label: null,
          },
        );
        assert.equal(event.length, 1);
        assert.equal(reference.length, 1);
        assert.deepEqual({ ...document[0] }, { name: null, is_cv: null });
        assert.doesNotMatch(
          JSON.stringify(receipt),
          /synthetic-old\.txt|Synthetic old document/,
        );
        assert.equal(stored.length, 0);
        const direct = await fetch(
          `${target.apiUrl}/rest/v1/document_version?select=id`,
          {
            headers: {
              apikey: target.anonKey,
              Authorization: `Bearer ${ownerJwt}`,
            },
          },
        );
        assert.ok(!direct.ok, "quarantined owner Data API should be denied");
        const download = await fetch(
          `${target.apiUrl}/storage/v1/object/authenticated/documents/${objectKey}`,
          {
            headers: {
              apikey: target.anonKey,
              Authorization: `Bearer ${ownerJwt}`,
            },
          },
        );
        assert.ok(
          !download.ok,
          "quarantined owner Storage read should be denied",
        );
      } finally {
        await sql.end();
      }
    } finally {
      if (targetStarted) await stopRecruitmentTarget(targetId);
      if (sourceStarted) await stopRecruitmentTarget(sourceId);
    }
  },
);
