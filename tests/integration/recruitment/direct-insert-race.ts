/** Deterministic HTTP concurrency + deliberate regression, owned disposable target only. */
import assert from "node:assert/strict";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import {
  readRecruitmentTarget,
  verifyRecruitmentMigrations,
  type RecruitmentTarget,
} from "../../../scripts/recruitment/target.ts";
import { request, type User, type Reply } from "../rls/data-api.ts";

const signature = "public.create_recruitment_case(uuid,text,text,text,boolean)";
const policyName = "recruitment_case_select_owner";
const schema = "recruitment_race_qa";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rpcPath = "/rest/v1/rpc/create_recruitment_case";
type Sql = ReturnType<typeof postgres>;

async function snapshot(sql: Sql) {
  const [fn] =
    await sql`select pg_get_functiondef(p.oid) definition,p.prosecdef,p.proacl::text acl from pg_proc p where p.oid=${signature}::regprocedure`;
  const [policy] =
    await sql`select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='recruitment_case' and policyname=${policyName}`;
  assert.ok(
    fn?.definition && policy?.qual,
    "Expected exact product function/policy before test instrumentation",
  );
  assert.equal(fn.prosecdef, false, "Product function must remain INVOKER");
  return { fn, policy };
}

function expectedOutcome(reply: Reply, directId: string, changed: boolean) {
  if (changed) {
    assert.equal(
      reply.status,
      409,
      "Committed different payload must conflict, never return duplicate warning",
    );
    assert.equal((reply.body as { code?: string }).code, "PT409");
  } else {
    assert.equal(reply.status, 200);
    const result = reply.body as { kind?: string; case?: { id?: string } };
    assert.equal(
      result.kind,
      "replayed",
      "Committed identical intent must replay, never return duplicate warning",
    );
    assert.equal(result.case?.id, directId);
  }
}

/**
 * Pauses only the known duplicate row during the aggregation statement.
 * PG_CONTEXT gating prevents an optimizer-selected earlier key lookup from
 * accidentally triggering the barrier and giving a false concurrency proof.
 */
async function scheduledRequest(
  target: RecruitmentTarget,
  owner: User,
  sql: Sql,
  holder: Sql,
  originalQual: string,
  changed: boolean,
) {
  const priorKey = randomUUID();
  const requestId = randomUUID();
  const title = `Deterministic-${randomUUID()}`;
  const seeded = await request(
    target,
    owner.token,
    rpcPath,
    "POST",
    {
      p_request_id: priorKey,
      p_title: title,
    },
    {},
    "public",
  );
  assert.equal(seeded.status, 200);
  assert.equal((seeded.body as { kind?: string }).kind, "created");

  const barrierNamespace = 98214;
  const barrierObject = randomInt(1, 2_147_483_647);
  // All interpolated DDL literals below are locally generated UUIDs/integers.
  await sql.unsafe(`CREATE OR REPLACE FUNCTION recruitment_race_qa.barrier(value uuid)
    RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
    AS $barrier$
    DECLARE stack text;
    BEGIN
      IF value = '${priorKey}'::uuid THEN
        GET DIAGNOSTICS stack = PG_CONTEXT;
        IF pg_catalog.strpos(stack, 'jsonb_agg(candidate.projection') > 0 THEN
          PERFORM pg_catalog.pg_advisory_xact_lock(${barrierNamespace}, ${barrierObject});
        END IF;
      END IF;
      RETURN true;
    END;
    $barrier$;`);
  await sql`revoke all on function recruitment_race_qa.barrier(uuid) from PUBLIC,anon,authenticated,service_role`;
  await sql`grant execute on function recruitment_race_qa.barrier(uuid) to authenticated`;
  await sql.unsafe(
    `ALTER POLICY recruitment_case_select_owner ON public.recruitment_case USING ((${originalQual}) AND recruitment_race_qa.barrier(request_id))`,
  );

  let held = false;
  let pending: Promise<Reply> | undefined;
  try {
    await holder`select pg_advisory_lock(${barrierNamespace},${barrierObject})`;
    held = true;
    pending = request(
      target,
      owner.token,
      rpcPath,
      "POST",
      {
        p_request_id: requestId,
        p_title: title,
      },
      {},
      "public",
    );
    const deadline = Date.now() + 5000;
    let blocked = false;
    while (Date.now() < deadline) {
      const waiters =
        await sql`select pid from pg_locks where locktype='advisory' and classid=${barrierNamespace}::oid and objid=${barrierObject}::oid and objsubid=2 and granted=false`;
      if (waiters.length === 1) {
        blocked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(
      blocked,
      true,
      "RPC must be proven paused during duplicate query before direct INSERT",
    );

    const inserted = await request(
      target,
      owner.token,
      "/rest/v1/recruitment_case",
      "POST",
      {
        request_id: requestId,
        title,
        description: changed ? "Concurrent direct payload differs" : null,
      },
      {},
      "public",
    );
    assert.equal(
      inserted.status,
      201,
      "Direct INSERT must commit while RPC duplicate read is paused",
    );
    const directId = (inserted.body as { id: string }[])[0]?.id;
    assert.ok(directId);

    await holder`select pg_advisory_unlock(${barrierNamespace},${barrierObject})`;
    held = false;
    const reply = await pending;
    return { reply, directId, changed };
  } finally {
    if (held)
      await holder`select pg_advisory_unlock(${barrierNamespace},${barrierObject})`;
    // Settle the real HTTP request before removing a policy/function it uses.
    if (pending) await Promise.allSettled([pending]);
    await sql.unsafe(
      `ALTER POLICY recruitment_case_select_owner ON public.recruitment_case USING (${originalQual})`,
    );
  }
}

export async function deterministicDirectInsertRace(
  target: RecruitmentTarget,
  owner: User,
  deliberateOldLogic: boolean,
) {
  // Reconfirm exact ownership/config/container identity before fixture-only DDL.
  await readRecruitmentTarget(target.id);
  await verifyRecruitmentMigrations(target.id);
  const sql = postgres({
    ...target.db,
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  const holder = postgres({
    ...target.db,
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  const before = await snapshot(sql);
  const beforeHash = hash(before);
  let createdSchema = false;
  try {
    const [existing] = await sql`select to_regnamespace(${schema}) present`;
    assert.equal(
      existing.present,
      null,
      "Refuse replacing an existing QA schema",
    );
    await sql`create schema recruitment_race_qa`;
    createdSchema = true;
    await sql`revoke all on schema recruitment_race_qa from PUBLIC,anon,authenticated,service_role`;
    await sql`grant usage on schema recruitment_race_qa to authenticated`;
    if (deliberateOldLogic) {
      const source = await readFile(
        new URL(
          "../../../db/recruitment/migrations/0002_recruitment_access_and_create.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const oldDefinition = source.match(
        /CREATE FUNCTION public\.create_recruitment_case\([\s\S]+?\n\$fn\$;/,
      )?.[0];
      assert.ok(
        oldDefinition,
        "Canonical historical function is required for regression sensitivity",
      );
      await sql.unsafe(
        oldDefinition.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"),
      );
    }
    for (const changed of [false, true]) {
      const outcome = await scheduledRequest(
        target,
        owner,
        sql,
        holder,
        before.policy.qual,
        changed,
      );
      if (deliberateOldLogic) {
        assert.equal(outcome.reply.status, 200);
        assert.equal(
          (outcome.reply.body as { kind?: string }).kind,
          "duplicates",
          "Negative control must reproduce the actual old duplicate-warning bug",
        );
        assert.throws(
          () => expectedOutcome(outcome.reply, outcome.directId, changed),
          { name: "AssertionError" },
          "Unchanged replay/conflict oracle must reject the deliberately regressed function",
        );
      } else expectedOutcome(outcome.reply, outcome.directId, changed);
    }
  } finally {
    try {
      // Exact canonical function + original policy, with identity/ACL proof after.
      await sql.unsafe(before.fn.definition);
      await sql.unsafe(
        `ALTER POLICY recruitment_case_select_owner ON public.recruitment_case USING (${before.policy.qual})`,
      );
      if (createdSchema) {
        await sql`drop function if exists recruitment_race_qa.barrier(uuid)`;
        await sql`drop schema recruitment_race_qa`;
      }
      const after = await snapshot(sql);
      assert.equal(
        hash(after),
        beforeHash,
        "Exact function/policy/ACL/INVOKER fingerprint must be restored",
      );
      const [leftover] = await sql`select to_regnamespace(${schema}) present`;
      assert.equal(leftover.present, null, "No test helper/schema may remain");
    } finally {
      await Promise.all([sql.end(), holder.end()]);
      await verifyRecruitmentMigrations(target.id);
    }
  }
}
