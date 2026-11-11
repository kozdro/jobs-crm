/** Atomic application via real Data API; synthetic records are seeded on the disposable DB. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import { createAccounts, request } from "../rls/data-api.ts";
const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Application Documents test requires guarded target");
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
  "atomic sent versions preserve events and isolate owners",
  { timeout: 120_000 },
  async () => {
    const [a, b] = await createAccounts(target);
    const sql = postgres({
      ...target.db,
      max: 1,
      ssl: false,
      onnotice: () => {},
    });
    const caseId = randomUUID(),
      doc = randomUUID(),
      v1 = randomUUID(),
      v2 = randomUUID();
    const call = (token: string | undefined, name: string, body: unknown) =>
      request(
        target,
        token,
        `/rest/v1/rpc/${name}`,
        "POST",
        body,
        {},
        "public",
      );
    try {
      await sql`insert into public.recruitment_case(id,owner_id,request_id,title) values(${caseId}::uuid,${a.id}::uuid,${randomUUID()}::uuid,'Synthetic application')`;
      await sql`insert into public.document(id,owner_id,name,is_cv) values(${doc}::uuid,${a.id}::uuid,'Synthetic CV',true)`;
      await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${v1}::uuid,${a.id}::uuid,${doc}::uuid,1,'ready'),(${v2}::uuid,${a.id}::uuid,${doc}::uuid,2,'ready')`;
      const payload = {
        p_request_id: randomUUID(),
        p_case_id: caseId,
        p_occurred_on: null,
        p_version_ids: [v1, v2],
      };
      const created = await call(
        a.token,
        "record_application_with_documents",
        payload,
      );
      assert.equal(created.status, 200, JSON.stringify(created.body));
      const replay = await call(
        a.token,
        "record_application_with_documents",
        payload,
      );
      assert.equal(replay.status, 200);
      assert.equal((replay.body as { kind: string }).kind, "replayed");
      const [events] =
        await sql`select count(*)::int n from public.recruitment_case_event where case_id=${caseId}::uuid`;
      const [refs] =
        await sql`select count(*)::int n from public.document_sent_reference where case_id=${caseId}::uuid`;
      assert.equal(events.n, 1);
      assert.equal(refs.n, 2);
      const sent = await request(
        target,
        a.token,
        `/rest/v1/document_sent_reference?select=id&case_id=eq.${caseId}`,
        "GET",
        undefined,
        {},
        "public",
      );
      assert.equal(sent.status, 200);
      assert.ok(Array.isArray(sent.body));
      assert.equal(sent.body.length, 2);
      const foreignSent = await request(
        target,
        b.token,
        `/rest/v1/document_sent_reference?select=id&case_id=eq.${caseId}`,
        "GET",
        undefined,
        {},
        "public",
      );
      assert.equal(foreignSent.status, 200);
      assert.deepEqual(foreignSent.body, []);
      const anonymousSent = await request(
        target,
        undefined,
        `/rest/v1/document_sent_reference?select=id&case_id=eq.${caseId}`,
        "GET",
        undefined,
        {},
        "public",
      );
      assert.ok([401, 403].includes(anonymousSent.status));
      const [original] =
        await sql`select r.id,r.event_id,e.revision event_revision from public.document_sent_reference r join public.recruitment_case_event_current e on e.id=r.event_id where r.version_id=${v1}::uuid`;
      const v3 = randomUUID();
      await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${v3}::uuid,${a.id}::uuid,${doc}::uuid,3,'ready')`;
      const correctionId = requestId();
      const correction = {
        action: "sent-correct",
        caseId,
        eventId: original.event_id,
        eventRevision: original.event_revision,
        referenceId: original.id,
        revision: 0,
        versionId: v3,
      };
      const corrected = await call(a.token, "execute_document_sent_command", {
        p_request_id: correctionId,
        p_payload: correction,
      });
      assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
      const correctionReplay = await call(
        a.token,
        "execute_document_sent_command",
        { p_request_id: correctionId, p_payload: correction },
      );
      assert.equal(
        (correctionReplay.body as { kind: string }).kind,
        "replayed",
      );
      const conflict = await call(a.token, "execute_document_sent_command", {
        p_request_id: correctionId,
        p_payload: { ...correction, versionId: v2 },
      });
      assert.ok(conflict.status >= 400);
      const foreignCorrection = await call(
        b.token,
        "execute_document_sent_command",
        { p_request_id: requestId(), p_payload: correction },
      );
      assert.ok(foreignCorrection.status >= 400);
      const directRevision = await request(
        target,
        a.token,
        "/rest/v1/document_sent_revision",
        "POST",
        {
          reference_id: original.id,
          revision: 2,
          version_id: v2,
          withdrawn: false,
        },
        {},
        "public",
      );
      assert.ok(directRevision.status >= 400);
      const withdrawal = await call(a.token, "execute_document_sent_command", {
        p_request_id: requestId(),
        p_payload: {
          action: "sent-withdraw",
          caseId,
          eventId: original.event_id,
          eventRevision: original.event_revision,
          referenceId: original.id,
          revision: 1,
        },
      });
      assert.equal(withdrawal.status, 200, JSON.stringify(withdrawal.body));
      const [revisions] =
        await sql`select count(*)::int n from public.document_sent_revision where reference_id=${original.id}::uuid`;
      assert.equal(revisions.n, 2);
      for (const bad of [
        [v1, v1],
        [v1, randomUUID()],
      ]) {
        const result = await call(
          a.token,
          "record_application_with_documents",
          { ...payload, p_request_id: randomUUID(), p_version_ids: bad },
        );
        assert.ok(result.status >= 400);
      }
      const foreign = await call(b.token, "record_application_with_documents", {
        ...payload,
        p_request_id: randomUUID(),
      });
      assert.ok(foreign.status >= 400);
      const anon = await call(undefined, "record_application_with_documents", {
        ...payload,
        p_request_id: randomUUID(),
      });
      assert.ok(anon.status >= 400);
      const direct = await request(
        target,
        a.token,
        "/rest/v1/document_sent_reference",
        "POST",
        { case_id: caseId, event_id: randomUUID(), version_id: v1 },
        {},
        "public",
      );
      assert.ok(direct.status >= 400);
      const [after] =
        await sql`select count(*)::int n from public.recruitment_case_event where case_id=${caseId}::uuid`;
      assert.equal(after.n, 1);
      const legacyId = randomUUID();
      const legacy = await call(a.token, "record_recruitment_case_event", {
        p_request_id: legacyId,
        p_case_id: caseId,
        p_kind: "application",
        p_direction: null,
        p_occurred_on: null,
      });
      assert.equal(legacy.status, 200);
      const legacyReplay = await call(
        a.token,
        "record_application_with_documents",
        { ...payload, p_request_id: legacyId },
      );
      assert.ok(legacyReplay.status >= 400);
      const [legacyRefs] =
        await sql`select count(*)::int n from public.document_sent_reference where case_id=${caseId}::uuid`;
      assert.equal(
        legacyRefs.n,
        2,
        "legacy replay must not attach sent versions",
      );
      const v4 = randomUUID();
      await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${v4}::uuid,${a.id}::uuid,${doc}::uuid,4,'ready')`;
      const voidIntent = {
        p_case_id: caseId,
        p_event_id: original.event_id,
        p_operation: "void",
        p_occurred_on: null,
        p_direction: null,
        p_stage_name: null,
      };
      const previewVoid = await call(
        a.token,
        "preview_recruitment_case_correction",
        voidIntent,
      );
      assert.equal(previewVoid.status, 200, JSON.stringify(previewVoid.body));
      const previewState = previewVoid.body as {
        caseRevision: number;
        eventRevision: number;
      };
      const [voided, addRace] = await Promise.all([
        call(a.token, "correct_recruitment_case_event", {
          ...voidIntent,
          p_request_id: randomUUID(),
          p_expected_case_revision: previewState.caseRevision,
          p_expected_event_revision: previewState.eventRevision,
        }),
        call(a.token, "execute_document_sent_command", {
          p_request_id: requestId(),
          p_payload: {
            action: "sent-add",
            caseId,
            eventId: original.event_id,
            eventRevision: original.event_revision,
            versionIds: [v4],
          },
        }),
      ]);
      assert.equal(voided.status, 200, JSON.stringify(voided.body));
      const [raceRefs] =
        await sql`select count(*)::int n from public.document_sent_reference where event_id=${original.event_id}::uuid and version_id=${v4}::uuid`;
      assert.equal(raceRefs.n, addRace.status === 200 ? 1 : 0);
      const afterVoid = await call(a.token, "execute_document_sent_command", {
        p_request_id: requestId(),
        p_payload: {
          action: "sent-add",
          caseId,
          eventId: original.event_id,
          eventRevision: original.event_revision,
          versionIds: [v4],
        },
      });
      assert.ok(
        afterVoid.status >= 400,
        "voided event must not accept new sent references",
      );
      const v5 = randomUUID(),
        key5 = randomUUID();
      await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${v5}::uuid,${a.id}::uuid,${doc}::uuid,5,'ready')`;
      await sql`insert into recruitment_private.document_object(version_id,owner_id,request_id,object_key,bytes,phase) values(${v5}::uuid,${a.id}::uuid,${randomUUID()}::uuid,${key5},5,'ready')`;
      const deletionPreview = await sql.begin(async (tx) => {
        await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ sub: a.id, role: "authenticated" }),
        ]);
        const [row] = await tx.unsafe(
          "select public.preview_document_delete($1::uuid,null) result",
          [v5],
        );
        return row.result as { preview: { token: string } };
      });
      const legacyEvent = (legacy.body as { event: { id: string } }).event.id;
      const [deleteRace, sendRace] = await Promise.allSettled([
        sql.begin(async (tx) => {
          await tx.unsafe("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ role: "documents_delete_authorizer" }),
          ]);
          const [row] = await tx.unsafe(
            "select public.authorize_document_delete($1::uuid,$2::uuid,$3::uuid) result",
            [a.id, requestId(), deletionPreview.preview.token],
          );
          return row.result;
        }),
        call(a.token, "execute_document_sent_command", {
          p_request_id: requestId(),
          p_payload: {
            action: "sent-add",
            caseId,
            eventId: legacyEvent,
            eventRevision: 0,
            versionIds: [v5],
          },
        }),
      ]);
      assert.equal(sendRace.status, "fulfilled");
      if (sendRace.status !== "fulfilled")
        throw new Error("Sent command transport failed");
      const [deleteRefs] =
        await sql`select count(*)::int n from public.document_sent_reference where event_id=${legacyEvent}::uuid and version_id=${v5}::uuid`;
      assert.equal(deleteRefs.n, sendRace.value.status === 200 ? 1 : 0);
      if (deleteRace.status === "fulfilled") {
        assert.equal((deleteRace.value as { kind: string }).kind, "queued");
        const afterDeleting = await call(
          a.token,
          "execute_document_sent_command",
          {
            p_request_id: requestId(),
            p_payload: {
              action: "sent-add",
              caseId,
              eventId: legacyEvent,
              eventRevision: 0,
              versionIds: [v5],
            },
          },
        );
        assert.ok(
          afterDeleting.status >= 400,
          "deleting version must not accept new sent references",
        );
      } else {
        assert.equal(
          sendRace.value.status,
          200,
          "failed delete requires a competing sent reference",
        );
        assert.equal((deleteRace.reason as { code?: string }).code, "PT412");
      }
    } finally {
      await sql.end();
    }
  },
);
