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
      9,
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
    const [continued] =
      await upgrade`select status from public.recruitment_case where id=${caseId}::uuid`;
    assert.equal(
      continued.status,
      "W rekrutacji",
      "An upgraded existing case accepts the real lifecycle transaction",
    );
  } finally {
    if (upgrade) await upgrade.end();
    if (created) await admin`drop database ${admin(database)}`;
    await admin.end();
  }
}
