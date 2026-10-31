/** DEC-056: corrections are audited commands, never replacement business facts. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import {
  createAccounts,
  denied,
  request,
  type Reply,
} from "../rls/data-api.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id)
  throw new Error("History integrity requires guarded disposable target");
const target = await readRecruitmentTarget(id);
const cases = "/rest/v1/recruitment_case";
const events = "/rest/v1/recruitment_case_event";
const revisions = "/rest/v1/recruitment_case_event_revision";
const previewRpc = "/rest/v1/rpc/preview_recruitment_case_correction";
const correctRpc = "/rest/v1/rpc/correct_recruitment_case_event";
type State = {
  status: string;
  current_stage: string | null;
  stage_version: number;
  case_revision: number;
};
type Fact = {
  id: string;
  recorded_at: string;
  occurred_on: string | null;
  direction: string | null;
  stage_name: string | null;
  previous_stage: string | null;
};
type Values = {
  occurredOn: string | null;
  direction: string | null;
  stageName: string | null;
  voided: boolean;
};
type Preview = {
  caseRevision: number;
  eventRevision: number;
  before: Values;
  after: Values;
  status: string;
  currentStage: string | null;
  blockedBy: string[];
};
type Correction = {
  p_case_id: string;
  p_event_id: string;
  p_operation: "correct" | "void";
  p_occurred_on: string | null;
  p_direction: string | null;
  p_stage_name: string | null;
};
function ok<T>(reply: Reply): T {
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return reply.body as T;
}

test(
  "DEC056 history correction integrity, replay, concurrency and private audit",
  { timeout: 180_000 },
  async (t) => {
    const [a, b] = await createAccounts(target);
    const api = (
      path: string,
      method = "GET",
      body?: unknown,
      token: string | null = a.token,
    ) => request(target, token ?? undefined, path, method, body, {}, "public");
    const create = async (token = a.token) => {
      const input = {
        p_request_id: randomUUID(),
        p_title: `History integrity ${randomUUID()}`,
      };
      const result = ok<{ case: { id: string } }>(
        await api("/rest/v1/rpc/create_recruitment_case", "POST", input, token),
      );
      return { id: result.case.id, input };
    };
    const state = async (caseId: string) =>
      ok<State[]>(
        await api(
          `${cases}?select=status,current_stage,stage_version,case_revision&id=eq.${caseId}`,
        ),
      )[0];
    const facts = async (caseId: string) =>
      ok<Fact[]>(
        await api(
          `${events}?select=*&case_id=eq.${caseId}&order=recorded_at.asc,id.asc`,
        ),
      );
    const audit = async (caseId: string) =>
      ok<Record<string, unknown>[]>(
        await api(
          `${revisions}?select=*&case_id=eq.${caseId}&order=recorded_at.asc,id.asc`,
        ),
      );
    const record = async (
      caseId: string,
      kind = "application",
      direction: string | null = null,
      day: string | null = null,
    ) => {
      const input = {
        p_request_id: randomUUID(),
        p_case_id: caseId,
        p_kind: kind,
        p_direction: direction,
        p_occurred_on: day,
      };
      const result = ok<{ kind: string; event: Fact }>(
        await api("/rest/v1/rpc/record_recruitment_case_event", "POST", input),
      );
      return { ...result, input };
    };
    const stage = async (
      caseId: string,
      kind = "invitation",
      name = "Screening",
      day: string | null = null,
    ) => {
      const input = {
        p_request_id: randomUUID(),
        p_case_id: caseId,
        p_kind: kind,
        p_stage_name: name,
        p_expected_stage_version: (await state(caseId)).stage_version,
        p_occurred_on: day,
      };
      const result = ok<{ kind: string; event: Fact }>(
        await api(
          "/rest/v1/rpc/record_recruitment_case_stage_event",
          "POST",
          input,
        ),
      );
      return { ...result, input };
    };
    const correction = (
      caseId: string,
      event: Fact,
      changes: Partial<Correction> = {},
    ): Correction => ({
      p_case_id: caseId,
      p_event_id: event.id,
      p_operation: "correct",
      p_occurred_on: event.occurred_on,
      p_direction: event.direction,
      p_stage_name: event.stage_name,
      ...changes,
      ...(changes.p_operation === "void"
        ? { p_occurred_on: null, p_direction: null, p_stage_name: null }
        : {}),
    });
    const preview = async (input: Correction) =>
      ok<Preview>(await api(previewRpc, "POST", input));
    const confirmed = (
      input: Correction,
      p: Preview,
      requestId = randomUUID(),
    ) => ({
      ...input,
      p_request_id: requestId,
      p_expected_case_revision: p.caseRevision,
      p_expected_event_revision: p.eventRevision,
    });
    const correct = async (input: Correction) => {
      const p = await preview(input);
      assert.deepEqual(p.blockedBy, []);
      const command = confirmed(input, p);
      return {
        input: command,
        result: ok<{ kind: string; revision: Record<string, unknown> }>(
          await api(correctRpc, "POST", command),
        ),
        preview: p,
      };
    };

    await t.test(
      "Date and direction corrections preserve original facts and timestamps; no-op preview writes nothing",
      async () => {
        const c = await create();
        const f = await record(c.id, "contact", "inbound", "2000-01-01");
        const original = await facts(c.id);
        const before = await state(c.id);
        const input = correction(c.id, f.event, {
          p_occurred_on: "2001-02-03",
          p_direction: "outbound",
        });
        const p = await preview(input);
        assert.deepEqual(await audit(c.id), []);
        assert.deepEqual(await state(c.id), before);
        assert.deepEqual(p.before, {
          occurredOn: "2000-01-01",
          direction: "inbound",
          stageName: null,
          voided: false,
        });
        assert.equal(p.status, "Kontakt rozpoczęty");
        await correct(input);
        assert.deepEqual(
          await facts(c.id),
          original,
          "business fact payload and recorded_at stay immutable",
        );
        const firstAudit = await audit(c.id);
        assert.equal(firstAudit.length, 1);
        assert.equal(firstAudit[0].owner_id, a.id);
        assert.equal(typeof firstAudit[0].recorded_at, "string");
        assert.equal((await state(c.id)).status, "Kontakt rozpoczęty");
        assert.ok((await state(c.id)).case_revision > before.case_revision);
        const unknown = await correct({ ...input, p_occurred_on: null });
        assert.equal(unknown.preview.after.occurredOn, null);
        const known = await correct({ ...input, p_occurred_on: "2024-02-29" });
        assert.equal(known.preview.after.occurredOn, "2024-02-29");
        assert.equal((await audit(c.id)).length, 3);
        assert.deepEqual(await facts(c.id), original);
        for (const bad of [
          { ...input, p_occurred_on: "2999-01-01" },
          { ...input, p_occurred_on: "2025-02-29" },
          { ...input, p_direction: null },
          { ...input, p_stage_name: "Forged stage" },
        ])
          denied(await api(previewRpc, "POST", bad));
      },
    );

    await t.test(
      "Void last or one of several contact/application facts chooses saved/contacted without inventing a business fact",
      async () => {
        const c = await create();
        const f = await record(c.id);
        const g = await record(c.id, "contact", "inbound");
        const first = await correct(
          correction(c.id, f.event, { p_operation: "void" }),
        );
        assert.equal(first.preview.status, "Kontakt rozpoczęty");
        assert.equal((await state(c.id)).status, "Kontakt rozpoczęty");
        const second = await correct(
          correction(c.id, g.event, { p_operation: "void" }),
        );
        assert.equal(second.preview.status, "Zapisane");
        assert.equal((await state(c.id)).status, "Zapisane");
        assert.equal((await facts(c.id)).length, 2);
        assert.equal((await audit(c.id)).length, 2);
        denied(await api(previewRpc, "POST", correction(c.id, g.event)));
        denied(
          await api(
            previewRpc,
            "POST",
            correction(c.id, g.event, { p_operation: "void" }),
          ),
        );
      },
    );

    await t.test(
      "Stage name correction uses original command order, preserves later snapshots, and void exposes prior effective stage",
      async () => {
        const c = await create();
        const aStage = await stage(
          c.id,
          "invitation",
          "Original",
          "2001-01-01",
        );
        const bStage = await stage(
          c.id,
          "stage-change",
          "Technical",
          "2000-01-01",
        );
        const original = await facts(c.id);
        await correct(
          correction(c.id, aStage.event, {
            p_stage_name: "Corrected original",
            p_occurred_on: "2002-01-01",
          }),
        );
        assert.equal((await state(c.id)).current_stage, "Technical");
        assert.deepEqual(await facts(c.id), original);
        assert.equal((await facts(c.id))[1].previous_stage, "Original");
        await correct(
          correction(c.id, bStage.event, {
            p_stage_name: "Corrected technical",
          }),
        );
        assert.equal((await state(c.id)).current_stage, "Corrected technical");
        const p = await preview(
          correction(c.id, bStage.event, { p_operation: "void" }),
        );
        assert.equal(p.currentStage, "Corrected original");
        await correct(correction(c.id, bStage.event, { p_operation: "void" }));
        assert.equal((await state(c.id)).current_stage, "Corrected original");
        await correct(correction(c.id, aStage.event, { p_operation: "void" }));
        assert.equal((await state(c.id)).status, "Zapisane");
        assert.equal((await state(c.id)).current_stage, null);
        assert.equal((await facts(c.id)).length, 2);
      },
    );

    await t.test(
      "Invite A -> stage B -> invite C cannot void A and orphan B despite later surviving C; no cascade",
      async () => {
        const c = await create();
        const first = await stage(c.id, "invitation", "A");
        const dependent = await stage(c.id, "stage-change", "B");
        const later = await stage(c.id, "invitation", "C");
        const input = correction(c.id, first.event, { p_operation: "void" });
        const p = await preview(input);
        assert.deepEqual(p.blockedBy, [dependent.event.id]);
        const before = await state(c.id);
        denied(await api(correctRpc, "POST", confirmed(input, p)));
        assert.deepEqual(await state(c.id), before);
        assert.deepEqual(await audit(c.id), []);
        assert.equal((await facts(c.id)).length, 3);
        await correct(
          correction(c.id, dependent.event, { p_operation: "void" }),
        );
        await correct(input);
        assert.equal((await state(c.id)).current_stage, "C");
        await correct(correction(c.id, later.event, { p_operation: "void" }));
        assert.equal((await state(c.id)).status, "Zapisane");
      },
    );

    await t.test(
      "Original and correction request keys stay consumed after correction/void; retries never restore old state",
      async () => {
        const c = await create();
        const f = await record(c.id, "contact", "inbound");
        const first = await correct(
          correction(c.id, f.event, { p_direction: "outbound" }),
        );
        await correct(
          correction(c.id, f.event, {
            p_operation: "void",
            p_direction: "outbound",
          }),
        );
        const before = await state(c.id);
        const replayOriginal = ok<{ kind: string; event: Fact }>(
          await api(
            "/rest/v1/rpc/record_recruitment_case_event",
            "POST",
            f.input,
          ),
        );
        assert.equal(replayOriginal.kind, "replayed");
        assert.equal(replayOriginal.event.direction, "inbound");
        const replay = ok<{ kind: string; revision: { id: string } }>(
          await api(correctRpc, "POST", first.input),
        );
        assert.equal(replay.kind, "replayed");
        assert.equal(replay.revision.id, first.result.revision.id);
        assert.deepEqual(await state(c.id), before);
        assert.equal((await audit(c.id)).length, 2);
        assert.equal((await facts(c.id)).length, 1);
        assert.equal(
          (
            await api(correctRpc, "POST", {
              ...first.input,
              p_direction: "inbound",
            })
          ).status,
          409,
        );
        const createReplay = ok<{ case: State }>(
          await api("/rest/v1/rpc/create_recruitment_case", "POST", c.input),
        );
        assert.equal(createReplay.case.status, "Zapisane");
      },
    );

    await t.test(
      "Same-key corrections race once; distinct preview revisions conflict atomically; all real fact kinds invalidate preview",
      async () => {
        const c = await create();
        const f = await record(c.id, "contact", "inbound");
        const input = correction(c.id, f.event, { p_direction: "outbound" });
        const p = await preview(input);
        const cmd = confirmed(input, p);
        const race = (
          await Promise.all([
            api(correctRpc, "POST", cmd),
            api(correctRpc, "POST", cmd),
            api(correctRpc, "POST", cmd),
          ])
        ).map((reply) => ok<{ kind: string; revision: { id: string } }>(reply));
        assert.equal(
          race.filter((value) => value.kind === "created").length,
          1,
        );
        assert.equal(new Set(race.map((value) => value.revision.id)).size, 1);
        assert.equal((await audit(c.id)).length, 1);
        const fresh = await preview({ ...input, p_occurred_on: "2000-01-01" });
        const [left, right] = await Promise.all([
          api(
            correctRpc,
            "POST",
            confirmed({ ...input, p_occurred_on: "2000-01-01" }, fresh),
          ),
          api(
            correctRpc,
            "POST",
            confirmed(
              {
                ...input,
                p_operation: "void",
                p_occurred_on: null,
                p_direction: null,
                p_stage_name: null,
              },
              fresh,
            ),
          ),
        ]);
        assert.deepEqual([left.status, right.status].sort(), [200, 412]);
        assert.equal((await audit(c.id)).length, 2);
        for (const kind of [
          "application",
          "contact",
          "invitation",
          "stage-change",
        ]) {
          const next = await create();
          const base = await record(next.id, "contact", "inbound");
          if (kind === "stage-change") await stage(next.id);
          const change = correction(next.id, base.event, {
            p_direction: "outbound",
          });
          const old = await preview(change);
          if (["invitation", "stage-change"].includes(kind))
            await stage(next.id, kind, "Concurrent");
          else
            await record(next.id, kind, kind === "contact" ? "outbound" : null);
          const before = await state(next.id);
          assert.equal(
            (await api(correctRpc, "POST", confirmed(change, old))).status,
            412,
          );
          assert.deepEqual(await audit(next.id), []);
          assert.deepEqual(await state(next.id), before);
        }
      },
    );

    await t.test(
      "Correction races every real fact kind with atomic accepted outcomes and no lost audit",
      async () => {
        for (const kind of [
          "application",
          "contact",
          "invitation",
          "stage-change",
        ]) {
          const c = await create();
          const f = await record(c.id, "contact", "inbound");
          if (kind === "stage-change") await stage(c.id);
          const before = await state(c.id);
          const input = correction(c.id, f.event, { p_direction: "outbound" });
          const p = await preview(input);
          const command = confirmed(input, p);
          const [correctionResult, factResult] = await Promise.all([
            api(correctRpc, "POST", command),
            ["invitation", "stage-change"].includes(kind)
              ? api(
                  "/rest/v1/rpc/record_recruitment_case_stage_event",
                  "POST",
                  {
                    p_request_id: randomUUID(),
                    p_case_id: c.id,
                    p_kind: kind,
                    p_stage_name: "Racing",
                    p_expected_stage_version: before.stage_version,
                    p_occurred_on: null,
                  },
                )
              : api("/rest/v1/rpc/record_recruitment_case_event", "POST", {
                  p_request_id: randomUUID(),
                  p_case_id: c.id,
                  p_kind: kind,
                  p_direction: kind === "contact" ? "outbound" : null,
                  p_occurred_on: null,
                }),
          ]);
          assert.ok([200, 412].includes(correctionResult.status));
          assert.ok([200, 412].includes(factResult.status));
          assert.ok(
            correctionResult.status === 200 || factResult.status === 200,
          );
          if (!["invitation", "stage-change"].includes(kind))
            assert.equal(factResult.status, 200);
          const accepted =
            Number(correctionResult.status === 200) +
            Number(factResult.status === 200);
          assert.equal(
            (await state(c.id)).case_revision,
            before.case_revision + accepted,
          );
          assert.equal(
            (await audit(c.id)).length,
            Number(correctionResult.status === 200),
          );
          const unchangedOriginal = (await facts(c.id)).find(
            (x) => x.id === f.event.id,
          )!;
          assert.equal(unchangedOriginal.direction, "inbound");
        }
      },
    );

    await t.test(
      "Void and re-enter cannot revive stale stage version (ABA); old invitation replay never re-applies",
      async () => {
        const c = await create();
        const old = await stage(c.id);
        const active = await state(c.id);
        const staleStage = {
          ...old.input,
          p_request_id: randomUUID(),
          p_kind: "stage-change",
          p_expected_stage_version: active.stage_version,
          p_stage_name: "Stale",
        };
        await correct(correction(c.id, old.event, { p_operation: "void" }));
        const returned = await state(c.id);
        assert.equal(returned.status, "Zapisane");
        assert.ok(returned.stage_version > active.stage_version);
        assert.equal(
          (
            await api(
              "/rest/v1/rpc/record_recruitment_case_stage_event",
              "POST",
              staleStage,
            )
          ).status,
          412,
          "Voiding the active foundation produces a stale conflict even before re-entry",
        );
        const latest = await stage(c.id, "invitation", "Fresh");
        assert.equal(latest.kind, "created");
        assert.equal(
          (
            await api(
              "/rest/v1/rpc/record_recruitment_case_stage_event",
              "POST",
              staleStage,
            )
          ).status,
          412,
        );
        const before = await state(c.id);
        const replay = ok<{ kind: string }>(
          await api(
            "/rest/v1/rpc/record_recruitment_case_stage_event",
            "POST",
            old.input,
          ),
        );
        assert.equal(replay.kind, "replayed");
        assert.deepEqual(await state(c.id), before);
      },
    );

    await t.test(
      "Void of active foundation races stage-change without orphan history or partial audit",
      async () => {
        for (let round = 0; round < 3; round++) {
          const c = await create();
          const f = await stage(c.id);
          const before = await state(c.id);
          const input = correction(c.id, f.event, { p_operation: "void" });
          const p = await preview(input);
          const [voided, changed] = await Promise.all([
            api(correctRpc, "POST", confirmed(input, p)),
            api("/rest/v1/rpc/record_recruitment_case_stage_event", "POST", {
              p_request_id: randomUUID(),
              p_case_id: c.id,
              p_kind: "stage-change",
              p_stage_name: "Concurrent stage",
              p_expected_stage_version: before.stage_version,
              p_occurred_on: null,
            }),
          ]);
          assert.deepEqual([voided.status, changed.status].sort(), [200, 412]);
          if (voided.status === 200) {
            assert.equal((await state(c.id)).status, "Zapisane");
            assert.equal((await state(c.id)).current_stage, null);
            assert.equal((await audit(c.id)).length, 1);
            assert.equal((await facts(c.id)).length, 1);
          } else {
            assert.equal((await state(c.id)).status, "W rekrutacji");
            assert.equal((await state(c.id)).current_stage, "Concurrent stage");
            assert.equal((await audit(c.id)).length, 0);
            assert.equal((await facts(c.id)).length, 2);
          }
          assert.equal(
            (await state(c.id)).case_revision,
            before.case_revision + 1,
          );
        }
      },
    );

    await t.test(
      "Failure AFTER projected case update rolls back correction audit and state in the same real API transaction",
      async () => {
        const c = await create();
        const f = await record(c.id, "contact", "inbound");
        const input = correction(c.id, f.event, { p_direction: "outbound" });
        const p = await preview(input);
        const before = await state(c.id);
        const original = await facts(c.id);
        const sql = postgres({
          ...target.db,
          max: 1,
          ssl: false,
          onnotice: () => {},
        });
        const suffix = randomUUID().replaceAll("-", "");
        const functionName = `qa_history_rollback_${suffix}`;
        const triggerName = `qa_history_rollback_${suffix}`;
        try {
          // Privileged setup creates only an exact-case failure probe on our disposable target. The attempted command still uses real Auth/Data API/RLS.
          await sql.unsafe(
            `CREATE FUNCTION public.${functionName}() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Synthetic after-projection failure'; END $$`,
          );
          await sql.unsafe(
            `REVOKE ALL ON FUNCTION public.${functionName}() FROM PUBLIC,anon,authenticated,service_role`,
          );
          await sql.unsafe(
            `CREATE TRIGGER ${triggerName} AFTER UPDATE ON public.recruitment_case FOR EACH ROW WHEN (NEW.id='${c.id}'::uuid) EXECUTE FUNCTION public.${functionName}()`,
          );
          denied(await api(correctRpc, "POST", confirmed(input, p)));
          assert.deepEqual(await audit(c.id), []);
          assert.deepEqual(await state(c.id), before);
          assert.deepEqual(await facts(c.id), original);
        } finally {
          await sql.unsafe(
            `DROP TRIGGER IF EXISTS ${triggerName} ON public.recruitment_case`,
          );
          await sql.unsafe(`DROP FUNCTION IF EXISTS public.${functionName}()`);
          await sql.end();
        }
        await correct(input);
        assert.equal((await audit(c.id)).length, 1);
      },
    );

    await t.test(
      "A/B/anon cannot expose original or revision data by list, ID, count, relationships or recovery keys",
      async () => {
        const c = await create();
        const f = await record(c.id, "contact", "inbound");
        const change = await correct(
          correction(c.id, f.event, { p_direction: "outbound" }),
        );
        const revisionId = change.result.revision.id as string;
        for (const path of [
          `${revisions}?select=*&case_id=eq.${c.id}`,
          `${revisions}?select=*&id=eq.${revisionId}`,
          `${revisions}?select=*&request_id=eq.${change.input.p_request_id}`,
          `${revisions}?select=id,event:recruitment_case_event!recruitment_revision_event_fk(id,kind)&case_id=eq.${c.id}`,
          `${cases}?select=id,audit:recruitment_case_event_revision!recruitment_revision_owned_case_fk(id,operation)&id=eq.${c.id}`,
          `/rest/v1/recruitment_case_event_current?select=*&id=eq.${f.event.id}`,
        ]) {
          const hidden = await api(path, "GET", undefined, b.token);
          assert.deepEqual(ok(hidden), []);
          assert.equal(hidden.range?.split("/")[1], "0");
          denied(await api(path, "GET", undefined, null));
        }
        for (const token of [b.token, null]) {
          denied(
            await api(previewRpc, "POST", correction(c.id, f.event), token),
          );
          denied(await api(correctRpc, "POST", change.input, token));
        }
        const other = await create(b.token);
        const foreignRelation = correction(other.id, f.event, {
          p_direction: "outbound",
        });
        denied(await api(previewRpc, "POST", foreignRelation, b.token));
      },
    );

    await t.test(
      "Direct Data API cannot forge audit, effective state, ownership, actor/time or rewrite original facts",
      async () => {
        const c = await create();
        const f = await record(c.id);
        const before = await state(c.id);
        for (const patch of [
          { case_revision: 99 },
          { stage_version: 99 },
          { status: "Zapisane" },
        ])
          denied(await api(`${cases}?id=eq.${c.id}`, "PATCH", patch));
        for (const path of [
          events,
          revisions,
          "/rest/v1/recruitment_case_event_current",
        ]) {
          for (const method of ["PATCH", "DELETE"]) {
            const reply = await api(
              `${path}?id=eq.${f.event.id}`,
              method,
              method === "PATCH" ? { occurred_on: "2000-01-01" } : undefined,
            );
            denied(reply);
          }
        }
        const change = correction(c.id, f.event, {
          p_occurred_on: "2000-01-01",
        });
        const p = await preview(change);
        const direct = {
          case_id: c.id,
          event_id: f.event.id,
          operation: "correct",
          request_id: randomUUID(),
          occurred_on: "2000-01-01",
          direction: null,
          stage_name: null,
          expected_case_revision: p.caseRevision,
          expected_event_revision: p.eventRevision,
        };
        for (const extra of [
          { owner_id: b.id },
          { recorded_at: "2000-01-01T00:00:00Z" },
          { id: randomUUID() },
          { revision: 99 },
          { before_values: {} },
          { after_values: { voided: true } },
          { resulting_status: "Zapisane" },
        ])
          denied(
            await api(revisions, "POST", {
              ...direct,
              request_id: randomUUID(),
              ...extra,
            }),
          );
        denied(
          await api(revisions, "POST", [
            direct,
            { ...direct, request_id: randomUUID(), operation: "invalid" },
          ]),
        );
        assert.deepEqual(await state(c.id), before);
        assert.deepEqual(await audit(c.id), []);
        assert.equal((await facts(c.id)).length, 1);
      },
    );
  },
);
