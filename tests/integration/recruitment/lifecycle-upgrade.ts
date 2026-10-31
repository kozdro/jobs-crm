/** Physical upgrade test only; minimal synthetic Auth substrate is NOT Auth/RLS evidence. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";
import type { RecruitmentTarget } from "../../../scripts/recruitment/target.ts";

export async function verifyLifecycleUpgrade(target: RecruitmentTarget) {
  const database = `lifecycle_upgrade_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres({
    ...target.db,
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  let upgrade: ReturnType<typeof postgres> | undefined;
  let created = false;
  try {
    // The caller first verifies this exact disposable target; never create on DEV/cloud.
    await admin`create database ${admin(database)}`;
    created = true;
    upgrade = postgres({
      ...target.db,
      database,
      max: 1,
      ssl: false,
      onnotice: () => {},
    });
    await upgrade.unsafe(
      "create schema recruitment_migrations; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;",
    );
    const journal = JSON.parse(
      await readFile(
        resolve(
          import.meta.dirname,
          "../../../db/recruitment/migrations/meta/_journal.json",
        ),
        "utf8",
      ),
    ) as { entries: { tag: string }[] };
    const apply = async (tag: string) => {
      const source = await readFile(
        resolve(
          import.meta.dirname,
          `../../../db/recruitment/migrations/${tag}.sql`,
        ),
        "utf8",
      );
      await upgrade!.begin(async (tx) => {
        for (const statement of source.split("--> statement-breakpoint"))
          if (statement.trim()) await tx.unsafe(statement);
      });
    };
    assert.equal(
      journal.entries.length,
      11,
      "Upgrade test must cover the exact current migration history",
    );
    for (const entry of journal.entries.slice(0, 7)) await apply(entry.tag);
    const owner = randomUUID();
    const caseId = randomUUID();
    const requestId = randomUUID();
    await upgrade`insert into auth.users(id) values(${owner}::uuid)`;
    await upgrade`insert into public.recruitment_case(id,owner_id,request_id,title,description,source_url,created_at) values(${caseId}::uuid,${owner}::uuid,${requestId}::uuid,'Legacy synthetic case','Preserve prior context','https://example.invalid/legacy','2000-01-01T12:00:00Z')`;
    const before =
      await upgrade`select * from public.recruitment_case where id=${caseId}::uuid`;
    await apply(journal.entries[7].tag);
    const after =
      await upgrade`select * from public.recruitment_case where id=${caseId}::uuid`;
    assert.deepEqual(
      after.map((row) => ({ ...row })),
      before.map((row) => ({ ...row })),
      "0007 must preserve every pre-existing case field and identity",
    );
    const [count] =
      await upgrade`select count(*)::int n from public.recruitment_case_event`;
    assert.equal(
      count.n,
      0,
      "Technical creation date must never backfill a business fact",
    );
    await upgrade.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      const [recorded] = await tx.unsafe(
        "select public.record_recruitment_case_event($1::uuid,$2::uuid,'application',null,null) result",
        [randomUUID(), caseId],
      );
      assert.equal(recorded.result.kind, "created");
    });
    const before3b =
      await upgrade`select * from public.recruitment_case where id=${caseId}::uuid`;
    const facts3a =
      await upgrade`select * from public.recruitment_case_event where case_id=${caseId}::uuid`;
    assert.equal(facts3a.length, 1);
    await apply(journal.entries[8].tag);
    const after3b =
      await upgrade`select * from public.recruitment_case where id=${caseId}::uuid`;
    const { current_stage, stage_version, ...preserved } = after3b[0];
    assert.equal(current_stage, null);
    assert.equal(stage_version, 0);
    assert.deepEqual(preserved, { ...before3b[0] });
    const factsAfter =
      await upgrade`select * from public.recruitment_case_event where case_id=${caseId}::uuid`;
    const { stage_name, previous_stage, expected_stage_version, ...oldFact } =
      factsAfter[0];
    assert.equal(stage_name, null);
    assert.equal(previous_stage, null);
    assert.equal(expected_stage_version, null);
    assert.deepEqual(oldFact, { ...facts3a[0] });
    await upgrade.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      const [invited] = await tx.unsafe(
        "select public.record_recruitment_case_stage_event($1::uuid,$2::uuid,'invitation','Technical',0,null) result",
        [randomUUID(), caseId],
      );
      assert.equal(invited.result.kind, "created");
    });
    const original3bCase =
      await upgrade`select * from public.recruitment_case where id=${caseId}::uuid`;
    const original3bFacts =
      await upgrade`select * from public.recruitment_case_event where case_id=${caseId}::uuid order by recorded_at,id`;
    await apply(journal.entries[9].tag);
    const afterIntegrityCase =
      await upgrade`select * from public.recruitment_case where id=${caseId}::uuid`;
    const { case_revision, ...casePreserved } = afterIntegrityCase[0];
    assert.ok(Number.isSafeInteger(case_revision));
    assert.deepEqual(
      casePreserved,
      { ...original3bCase[0] },
      "Integrity upgrade preserves all existing case fields",
    );
    const afterIntegrityFacts =
      await upgrade`select * from public.recruitment_case_event where case_id=${caseId}::uuid order by recorded_at,id`;
    assert.deepEqual(
      afterIntegrityFacts.map(({ applied_case_revision, ...row }) => {
        assert.equal(applied_case_revision, null);
        return { ...row };
      }),
      original3bFacts.map((row) => ({ ...row })),
      "Integrity upgrade preserves original 3A/3B facts, timestamps and request keys",
    );
    const [revisionCount] =
      await upgrade`select count(*)::int n from public.recruitment_case_event_revision`;
    assert.equal(
      revisionCount.n,
      0,
      "Upgrade must not backfill synthetic correction audit",
    );
    await upgrade.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      const [preview] = await tx.unsafe(
        "select public.preview_recruitment_case_correction($1::uuid,$2::uuid,'correct','2000-02-03',null,null) result",
        [caseId, original3bFacts[0].id],
      );
      const [corrected] = await tx.unsafe(
        "select public.correct_recruitment_case_event($1::uuid,$2::uuid,$3::uuid,'correct',$4::integer,$5::integer,'2000-02-03',null,null) result",
        [
          randomUUID(),
          caseId,
          original3bFacts[0].id,
          preview.result.caseRevision,
          preview.result.eventRevision,
        ],
      );
      assert.equal(
        corrected.result.kind,
        "created",
        "A legacy 3A fact accepts an audited correction after upgrade",
      );
      const [current] = await tx.unsafe(
        "select stage_version from public.recruitment_case where id=$1::uuid",
        [caseId],
      );
      const [next] = await tx.unsafe(
        "select public.record_recruitment_case_stage_event($1::uuid,$2::uuid,'stage-change','After upgrade',$3::integer,null) result",
        [randomUUID(), caseId, current.stage_version],
      );
      assert.equal(
        next.result.kind,
        "created",
        "An upgraded 3B case still accepts new real commands after correction",
      );
      const [replay] = await tx.unsafe(
        "select public.record_recruitment_case_event($1::uuid,$2::uuid,'application',null,null) result",
        [original3bFacts[0].request_id, caseId],
      );
      assert.equal(replay.result.kind, "replayed");
      assert.equal(
        replay.result.event.occurred_on,
        null,
        "Original request payload remains immutable after correction",
      );
    });
    const originalsAfterWrites =
      await upgrade`select * from public.recruitment_case_event where id in (${original3bFacts[0].id}::uuid,${original3bFacts[1].id}::uuid) order by recorded_at,id`;
    assert.deepEqual(
      originalsAfterWrites.map(({ applied_case_revision, ...row }) => {
        assert.equal(applied_case_revision, null);
        return { ...row };
      }),
      original3bFacts.map((row) => ({ ...row })),
      "Subsequent corrected reads and new commands never rewrite legacy originals",
    );
    const [continued] =
      await upgrade`select status from public.recruitment_case where id=${caseId}::uuid`;
    assert.equal(
      continued.status,
      "W rekrutacji",
      "An upgraded existing case accepts the real lifecycle transaction",
    );
    const before3cCase =
      await upgrade`select * from public.recruitment_case where id=${caseId}::uuid`;
    const before3cFacts =
      await upgrade`select * from public.recruitment_case_event where case_id=${caseId}::uuid order by recorded_at,id`;
    const before3cAudit =
      await upgrade`select * from public.recruitment_case_event_revision where case_id=${caseId}::uuid order by recorded_at,id`;
    await apply(journal.entries[10].tag);
    assert.deepEqual(
      (
        await upgrade`select * from public.recruitment_case where id=${caseId}::uuid`
      ).map((row) => ({ ...row })),
      before3cCase.map((row) => ({ ...row })),
      "3C upgrade preserves existing status, stage and revisions",
    );
    assert.deepEqual(
      (
        await upgrade`select * from public.recruitment_case_event where case_id=${caseId}::uuid order by recorded_at,id`
      ).map((row) => ({ ...row })),
      before3cFacts.map((row) => ({ ...row })),
      "3C upgrade preserves immutable legacy fact payloads",
    );
    assert.deepEqual(
      (
        await upgrade`select * from public.recruitment_case_event_revision where case_id=${caseId}::uuid order by recorded_at,id`
      ).map((row) => ({ ...row })),
      before3cAudit.map((row) => ({ ...row })),
      "3C upgrade preserves prior correction audit",
    );
    const [empty] =
      await upgrade`select count(*)::int n from public.recruitment_case_lifecycle`;
    assert.equal(
      empty.n,
      0,
      "3C upgrade invents no historical closures or cycles",
    );
    let legacyClosureId = "";
    let nextClosureId = "";
    await upgrade.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      const [closing] = await tx.unsafe(
        "select public.preview_recruitment_case_lifecycle($1::uuid,'close',null,'Odmowa firmy',null,false) result",
        [caseId],
      );
      const [closed] = await tx.unsafe(
        "select public.confirm_recruitment_case_lifecycle($1::uuid,$2::uuid,'close',$3::integer,0,null,'Odmowa firmy',null,false) result",
        [randomUUID(), caseId, closing.result.caseRevision],
      );
      assert.equal(closed.result.kind, "created");
      legacyClosureId = closed.result.entry.id;
      const [resuming] = await tx.unsafe(
        "select public.preview_recruitment_case_lifecycle($1::uuid,'reopen',null,null,null,false) result",
        [caseId],
      );
      assert.equal(
        resuming.result.status,
        "W rekrutacji",
        "Legacy invitation remains a valid continuation basis",
      );
      assert.equal(resuming.result.currentStage, "After upgrade");
      const [resumed] = await tx.unsafe(
        "select public.confirm_recruitment_case_lifecycle($1::uuid,$2::uuid,'reopen',$3::integer,0,null,null,null,false) result",
        [randomUUID(), caseId, resuming.result.caseRevision],
      );
      assert.equal(resumed.result.kind, "created");
      const [nextCycle] = await tx.unsafe(
        "select public.preview_recruitment_case_lifecycle($1::uuid,'close',null,'Nie aplikowano',null,false) result",
        [caseId],
      );
      const [secondClose] = await tx.unsafe(
        "select public.confirm_recruitment_case_lifecycle($1::uuid,$2::uuid,'close',$3::integer,0,null,'Nie aplikowano',null,false) result",
        [randomUUID(), caseId, nextCycle.result.caseRevision],
      );
      assert.equal(
        secondClose.result.kind,
        "created",
        "Legacy initial-cycle application does not block Not applied in the new cycle",
      );
      nextClosureId = secondClose.result.entry.id;
    });
    await assert.rejects(
      upgrade.begin(async (tx) => {
        await tx.unsafe("set local role authenticated");
        await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [
          owner,
        ]);
        await tx.unsafe(
          "select public.preview_recruitment_case_lifecycle($1::uuid,'correct-closure',$2::uuid,'Nie aplikowano',null,false) result",
          [caseId, legacyClosureId],
        );
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, "22023");
        return true;
      },
      "A legacy application with NULL applied_case_revision prevents Not applied correction of its initial closure",
    );
    await upgrade.begin(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await tx.unsafe("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      const [p] = await tx.unsafe(
        "select public.preview_recruitment_case_lifecycle($1::uuid,'correct-closure',$2::uuid,'Nie aplikowano','2002-03-04',false) result",
        [caseId, nextClosureId],
      );
      const [fixed] = await tx.unsafe(
        "select public.confirm_recruitment_case_lifecycle($1::uuid,$2::uuid,'correct-closure',$3::integer,$4::integer,$5::uuid,'Nie aplikowano','2002-03-04',false) result",
        [
          randomUUID(),
          caseId,
          p.result.caseRevision,
          p.result.closureRevision,
          nextClosureId,
        ],
      );
      assert.equal(
        fixed.result.kind,
        "created",
        "The same legacy application does not block correction of a later application-free cycle",
      );
    });
    const [three] =
      await upgrade`select count(*)::int n from public.recruitment_case_lifecycle where case_id=${caseId}::uuid`;
    assert.equal(three.n, 3, "Two closures and one reopening remain distinct");
  } finally {
    if (upgrade) await upgrade.end();
    if (created) await admin`drop database ${admin(database)}`;
    await admin.end();
  }
}
