/** DEC-057: real Auth/Data API/RLS proof for closure cycles and audited corrections. */
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
if (!id) throw new Error("3C requires guarded disposable target");
const target = await readRecruitmentTarget(id);
const rpc = "/rest/v1/rpc/";
const lifecycle = "/rest/v1/recruitment_case_lifecycle";
const revisions = "/rest/v1/recruitment_closure_revision";
const current = "/rest/v1/recruitment_case_lifecycle_current";
type Row = Record<string, unknown>;
type State = {
  status: string;
  current_stage: string | null;
  stage_version: number;
  case_revision: number;
};
type Preview = {
  caseRevision: number;
  closureRevision: number | null;
  status: string;
  currentStage: string | null;
  cycle: number;
  before: unknown;
  after: unknown;
};
type Input = {
  p_case_id: string;
  p_operation: string;
  p_closure_id: string | null;
  p_outcome: string | null;
  p_occurred_on: string | null;
  p_offer_confirmed: boolean;
};
function ok<T>(reply: Reply): T {
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return reply.body as T;
}

test(
  "DEC057 closure/reopening cycles, audited history and private commands",
  { timeout: 240_000 },
  async (t) => {
    const [a, b] = await createAccounts(target);
    const api = (
      path: string,
      method = "GET",
      body?: unknown,
      token: string | null = a.token,
    ) => request(target, token ?? undefined, path, method, body, {}, "public");
    const call = (
      name: string,
      input: unknown,
      token: string | null = a.token,
    ) => api(`${rpc}${name}`, "POST", input, token);
    const create = async () =>
      ok<{ case: { id: string } }>(
        await call("create_recruitment_case", {
          p_request_id: randomUUID(),
          p_title: `3C QA ${randomUUID()}`,
        }),
      ).case.id;
    const state = async (caseId: string) =>
      ok<State[]>(
        await api(
          `/rest/v1/recruitment_case?select=status,current_stage,stage_version,case_revision&id=eq.${caseId}`,
        ),
      )[0];
    const rows = async (table: string, caseId: string) =>
      ok<Row[]>(
        await api(
          `${table}?select=*&case_id=eq.${caseId}&order=recorded_at.asc,id.asc`,
        ),
      );
    const input = (caseId: string, changes: Partial<Input> = {}): Input => ({
      p_case_id: caseId,
      p_operation: "close",
      p_closure_id: null,
      p_outcome: "Inny",
      p_occurred_on: null,
      p_offer_confirmed: false,
      ...changes,
    });
    const preview = async (command: Input) =>
      ok<Preview>(await call("preview_recruitment_case_lifecycle", command));
    const confirmInput = (
      command: Input,
      p: Preview,
      requestId = randomUUID(),
    ) => ({
      ...command,
      p_request_id: requestId,
      p_expected_case_revision: p.caseRevision,
      p_expected_closure_revision: p.closureRevision,
    });
    const execute = async (command: Input) => {
      const p = await preview(command);
      const payload = confirmInput(command, p);
      const result = ok<{
        kind: string;
        entry: Row | null;
        revision: Row | null;
      }>(await call("confirm_recruitment_case_lifecycle", payload));
      return { result, input: payload, preview: p };
    };
    const close = (
      caseId: string,
      outcome = "Inny",
      day: string | null = null,
    ) => execute(input(caseId, { p_outcome: outcome, p_occurred_on: day }));
    const reopen = (caseId: string) =>
      execute(input(caseId, { p_operation: "reopen", p_outcome: null }));
    const correction = (
      caseId: string,
      closureId: string,
      outcome = "Inny",
      day: string | null = null,
    ) =>
      input(caseId, {
        p_operation: "correct-closure",
        p_closure_id: closureId,
        p_outcome: outcome,
        p_occurred_on: day,
      });
    const application = async (caseId: string, day: string | null = null) => {
      const command = {
        p_request_id: randomUUID(),
        p_case_id: caseId,
        p_kind: "application",
        p_direction: null,
        p_occurred_on: day,
      };
      return {
        input: command,
        result: ok<{ event: Row; kind: string }>(
          await call("record_recruitment_case_event", command),
        ),
      };
    };
    const invitation = async (caseId: string) =>
      ok<{ event: Row }>(
        await call("record_recruitment_case_stage_event", {
          p_request_id: randomUUID(),
          p_case_id: caseId,
          p_kind: "invitation",
          p_stage_name: "Screening",
          p_expected_stage_version: (await state(caseId)).stage_version,
          p_occurred_on: null,
        }),
      );
    const voidFact = async (caseId: string, eventId: string) => {
      const command = {
        p_case_id: caseId,
        p_event_id: eventId,
        p_operation: "void",
        p_occurred_on: null,
        p_direction: null,
        p_stage_name: null,
      };
      const p = ok<{
        caseRevision: number;
        eventRevision: number;
        status: string;
        currentStage: string | null;
      }>(await call("preview_recruitment_case_correction", command));
      const result = await call("correct_recruitment_case_event", {
        ...command,
        p_request_id: randomUUID(),
        p_expected_case_revision: p.caseRevision,
        p_expected_event_revision: p.eventRevision,
      });
      ok(result);
      return p;
    };

    await t.test(
      "Missing/unknown outcome, unconfirmed offer and invalid date never change state or history",
      async () => {
        const c = await create();
        const before = await state(c);
        for (const changes of [
          { p_outcome: null },
          { p_outcome: "Invented result" },
          { p_outcome: "Oferta przyjęta" },
          { p_outcome: "Oferta odrzucona przez użytkownika" },
          { p_occurred_on: "2999-01-01" },
          { p_occurred_on: "2025-02-29" },
          { p_outcome: "Inny", p_offer_confirmed: true },
        ]) {
          denied(
            await call("preview_recruitment_case_lifecycle", input(c, changes)),
          );
        }
        assert.deepEqual(await state(c), before);
        assert.deepEqual(await rows(lifecycle, c), []);
        const p = await preview(input(c));
        assert.equal(p.status, "Zakończone");
        assert.equal(p.currentStage, null);
        assert.deepEqual(await state(c), before, "preview performs no writes");
        assert.deepEqual(await rows(lifecycle, c), []);
      },
    );

    await t.test(
      "Every approved outcome can be chosen explicitly; offers need factual confirmation",
      async () => {
        for (const outcome of [
          "Oferta przyjęta",
          "Oferta odrzucona przez użytkownika",
          "Odmowa firmy",
          "Rezygnacja użytkownika",
          "Brak odpowiedzi",
          "Anulowanie procesu",
          "Nie aplikowano",
          "Inny",
        ]) {
          const c = await create();
          await execute(
            input(c, {
              p_outcome: outcome,
              p_offer_confirmed: outcome.startsWith("Oferta "),
            }),
          );
          assert.equal((await state(c)).status, "Zakończone");
          assert.equal((await rows(lifecycle, c)).length, 1);
          assert.equal(
            (await rows("/rest/v1/recruitment_case_event", c)).length,
            0,
            "outcome invents no application/contact/invitation",
          );
        }
      },
    );

    await t.test(
      "Not applied is restricted to closing cycle, including old-closure correction and backdated facts",
      async () => {
        const c = await create();
        await application(c, "2000-01-01");
        denied(
          await call(
            "preview_recruitment_case_lifecycle",
            input(c, { p_outcome: "Nie aplikowano" }),
          ),
        );
        const first = await close(c, "Odmowa firmy");
        const firstId = String(first.result.entry!.id);
        await reopen(c);
        const second = await close(c, "Nie aplikowano");
        assert.equal((await rows(lifecycle, c)).length, 3);
        denied(
          await call(
            "preview_recruitment_case_lifecycle",
            correction(c, firstId, "Nie aplikowano"),
          ),
        );
        await execute(
          correction(
            c,
            String(second.result.entry!.id),
            "Nie aplikowano",
            "2001-02-03",
          ),
        );
        await reopen(c);
        await application(c, "1999-01-01");
        denied(
          await call(
            "preview_recruitment_case_lifecycle",
            input(c, { p_outcome: "Nie aplikowano" }),
          ),
        );
        await execute(
          correction(
            c,
            String(second.result.entry!.id),
            "Nie aplikowano",
            null,
          ),
        );
        const list = await rows(lifecycle, c);
        assert.deepEqual(
          list.filter((row) => row.kind === "close").map((row) => row.outcome),
          ["Odmowa firmy", "Nie aplikowano"],
          "correction never rewrites originals",
        );
      },
    );

    await t.test(
      "close/reopen/close keeps distinct originals, stage snapshot and corrected facts justify continuation",
      async () => {
        const c = await create();
        const f = await invitation(c);
        const first = await close(c, "Odmowa firmy", "2000-02-03");
        const originals = await rows(lifecycle, c);
        assert.equal((await state(c)).current_stage, null);
        assert.equal((await state(c)).status, "Zakończone");
        const closedPreview = await voidFact(c, String(f.event.id));
        assert.equal(
          closedPreview.status,
          "Zakończone",
          "old fact correction cannot implicitly reopen",
        );
        assert.equal((await state(c)).status, "Zakończone");
        assert.deepEqual(await rows(lifecycle, c), originals);
        const resumed = await reopen(c);
        assert.equal(
          resumed.preview.status,
          "Zapisane",
          "void invitation cannot justify W rekrutacji restoration",
        );
        assert.equal((await state(c)).current_stage, null);
        const second = await close(c, "Nie aplikowano");
        assert.notEqual(first.result.entry!.id, second.result.entry!.id);
        const all = await rows(lifecycle, c);
        assert.deepEqual(
          all.find((row) => row.id === first.result.entry!.id),
          originals[0],
        );
        assert.equal(all.length, 3);
        assert.equal(
          (await rows("/rest/v1/recruitment_case_event", c)).length,
          1,
          "reopen fabricates no contact/invitation",
        );
      },
    );

    await t.test(
      "Audited closure corrections change only effective outcome/day, not state, original, cycle or activity count",
      async () => {
        const c = await create();
        const first = await close(c, "Inny");
        const closureId = String(first.result.entry!.id);
        const original = await rows(lifecycle, c);
        const before = await state(c);
        const fixed = await execute(
          correction(c, closureId, "Rezygnacja użytkownika", "2001-01-01"),
        );
        assert.equal(fixed.result.kind, "created");
        assert.deepEqual(await rows(lifecycle, c), original);
        const after = await state(c);
        assert.equal(after.status, before.status);
        assert.equal(after.current_stage, before.current_stage);
        const audit = await rows(revisions, c);
        assert.equal(audit.length, 1);
        assert.equal(audit[0].owner_id, a.id);
        assert.equal(typeof audit[0].recorded_at, "string");
        const effective = await rows(current, c);
        assert.equal(effective[0].outcome, "Rezygnacja użytkownika");
        assert.equal(effective[0].occurred_on, "2001-01-01");
        await reopen(c);
        await close(c, "Brak odpowiedzi");
        await execute(correction(c, closureId, "Inny", null));
        const final = await rows(lifecycle, c);
        assert.equal(final.length, 3);
        assert.deepEqual(
          final.find((row) => row.id === closureId),
          original[0],
        );
        assert.equal((await rows(revisions, c)).length, 2);
        assert.equal((await state(c)).status, "Zakończone");
      },
    );

    await t.test(
      "Identical replay, conflicting payload and old replay after reopen never repeat lifecycle effects",
      async () => {
        const c = await create();
        const first = await close(c);
        const replay = ok<{ kind: string }>(
          await call("confirm_recruitment_case_lifecycle", first.input),
        );
        assert.equal(replay.kind, "replayed");
        denied(
          await call("confirm_recruitment_case_lifecycle", {
            ...first.input,
            p_outcome: "Brak odpowiedzi",
          }),
        );
        const resumed = await reopen(c);
        const before = await state(c);
        assert.equal(
          ok<{ kind: string }>(
            await call("confirm_recruitment_case_lifecycle", first.input),
          ).kind,
          "replayed",
        );
        assert.deepEqual(await state(c), before);
        await close(c, "Nie aplikowano");
        const closed = await state(c);
        assert.equal(
          ok<{ kind: string }>(
            await call("confirm_recruitment_case_lifecycle", resumed.input),
          ).kind,
          "replayed",
        );
        assert.deepEqual(await state(c), closed);
        assert.equal((await rows(lifecycle, c)).length, 3);
      },
    );

    await t.test(
      "New facts cannot silently reopen; old fact replay on closed case does not revive state",
      async () => {
        const c = await create();
        const fact = await application(c);
        await close(c);
        const before = await state(c);
        denied(
          await call("record_recruitment_case_event", {
            ...fact.input,
            p_request_id: randomUUID(),
          }),
        );
        assert.equal(
          ok<{ kind: string }>(
            await call("record_recruitment_case_event", fact.input),
          ).kind,
          "replayed",
        );
        assert.deepEqual(await state(c), before);
        assert.equal((await rows(lifecycle, c)).length, 1);
      },
    );

    await t.test(
      "Real close/close race admits exactly one command and stale ABA preview is refused",
      async () => {
        const c = await create();
        const command = input(c);
        const p = await preview(command);
        const replies = await Promise.all([
          call("confirm_recruitment_case_lifecycle", confirmInput(command, p)),
          call("confirm_recruitment_case_lifecycle", confirmInput(command, p)),
        ]);
        assert.equal(replies.filter((r) => r.status === 200).length, 1);
        replies.filter((r) => r.status !== 200).forEach(denied);
        assert.equal((await rows(lifecycle, c)).length, 1);
        await reopen(c);
        denied(
          await call(
            "confirm_recruitment_case_lifecycle",
            confirmInput(command, p),
          ),
        );
        assert.equal((await rows(lifecycle, c)).length, 2);
        assert.equal((await state(c)).status, "Zapisane");
      },
    );

    await t.test(
      "Real close/correction race preserves atomic closed barrier and rejects stale loser",
      async () => {
        const c = await create();
        const fact = await application(c);
        const closing = input(c);
        const p = await preview(closing);
        const changing = {
          p_case_id: c,
          p_event_id: String(fact.result.event.id),
          p_operation: "void",
          p_occurred_on: null,
          p_direction: null,
          p_stage_name: null,
        };
        const cp = ok<{ caseRevision: number; eventRevision: number }>(
          await call("preview_recruitment_case_correction", changing),
        );
        const replies = await Promise.all([
          call("confirm_recruitment_case_lifecycle", confirmInput(closing, p)),
          call("correct_recruitment_case_event", {
            ...changing,
            p_request_id: randomUUID(),
            p_expected_case_revision: cp.caseRevision,
            p_expected_event_revision: cp.eventRevision,
          }),
        ]);
        assert.equal(replies.filter((r) => r.status === 200).length, 1);
        replies.filter((r) => r.status !== 200).forEach(denied);
        const final = await state(c);
        assert.equal(final.case_revision, p.caseRevision + 1);
        assert.equal(
          final.status,
          replies[0].status === 200 ? "Zakończone" : "Zapisane",
        );
      },
    );

    await t.test(
      "Stale reopen preview after closed-fact correction is refused; two real reopen requests cannot start two cycles",
      async () => {
        const c = await create();
        const f = await invitation(c);
        await close(c);
        const command = input(c, { p_operation: "reopen", p_outcome: null });
        const stale = await preview(command);
        assert.equal(stale.status, "W rekrutacji");
        await voidFact(c, String(f.event.id));
        denied(
          await call(
            "confirm_recruitment_case_lifecycle",
            confirmInput(command, stale),
          ),
        );
        assert.equal((await state(c)).status, "Zakończone");
        const fresh = await preview(command);
        assert.equal(fresh.status, "Zapisane");
        const replies = await Promise.all([
          call(
            "confirm_recruitment_case_lifecycle",
            confirmInput(command, fresh),
          ),
          call(
            "confirm_recruitment_case_lifecycle",
            confirmInput(command, fresh),
          ),
        ]);
        assert.equal(replies.filter((r) => r.status === 200).length, 1);
        replies.filter((r) => r.status !== 200).forEach(denied);
        assert.equal((await rows(lifecycle, c)).length, 2);
      },
    );

    await t.test(
      "Concurrent identical request applies once; revision retry after a later correction preserves latest effective data",
      async () => {
        const c = await create();
        const command = input(c);
        const p = await preview(command);
        const payload = confirmInput(command, p);
        const replies = await Promise.all([
          call("confirm_recruitment_case_lifecycle", payload),
          call("confirm_recruitment_case_lifecycle", payload),
        ]);
        const results = replies.map((reply) =>
          ok<{ kind: string; entry: Row }>(reply),
        );
        assert.deepEqual(results.map((r) => r.kind).sort(), [
          "created",
          "replayed",
        ]);
        assert.equal(results[0].entry.id, results[1].entry.id);
        const closureId = String(results[0].entry.id);
        const first = await execute(
          correction(c, closureId, "Rezygnacja użytkownika"),
        );
        await execute(correction(c, closureId, "Brak odpowiedzi"));
        const before = await state(c);
        assert.equal(
          ok<{ kind: string }>(
            await call("confirm_recruitment_case_lifecycle", first.input),
          ).kind,
          "replayed",
        );
        assert.deepEqual(await state(c), before);
        assert.equal((await rows(current, c))[0].outcome, "Brak odpowiedzi");
        assert.equal((await rows(revisions, c)).length, 2);
        denied(
          await call("confirm_recruitment_case_lifecycle", {
            ...first.input,
            p_occurred_on: "2000-01-01",
          }),
        );
      },
    );

    await t.test(
      "Failure AFTER case projection rolls back closure and state, allowing same intent to succeed later",
      async () => {
        const c = await create();
        const command = input(c);
        const p = await preview(command);
        const payload = confirmInput(command, p);
        const before = await state(c);
        const sql = postgres({
          ...target.db,
          max: 1,
          ssl: false,
          onnotice: () => {},
        });
        const name = `qa_3c_failure_${randomUUID().replaceAll("-", "")}`;
        try {
          await sql.unsafe(
            `CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Synthetic 3C after-projection failure'; END $$`,
          );
          await sql.unsafe(
            `REVOKE ALL ON FUNCTION public.${name}() FROM PUBLIC,anon,authenticated,service_role`,
          );
          await sql.unsafe(
            `CREATE TRIGGER ${name} AFTER UPDATE ON public.recruitment_case FOR EACH ROW WHEN (NEW.id='${c}'::uuid) EXECUTE FUNCTION public.${name}()`,
          );
          denied(await call("confirm_recruitment_case_lifecycle", payload));
          assert.deepEqual(await rows(lifecycle, c), []);
          assert.deepEqual(await rows(revisions, c), []);
          assert.deepEqual(await state(c), before);
        } finally {
          await sql.unsafe(
            `DROP TRIGGER IF EXISTS ${name} ON public.recruitment_case`,
          );
          await sql.unsafe(`DROP FUNCTION IF EXISTS public.${name}()`);
          await sql.end();
        }
        assert.equal(
          ok<{ kind: string }>(
            await call("confirm_recruitment_case_lifecycle", payload),
          ).kind,
          "created",
        );
      },
    );

    await t.test(
      "A owner reads originals/current/audit; B and anon cannot leak via list, direct ID, count or request recovery",
      async () => {
        const c = await create();
        const first = await close(c);
        const closureId = String(first.result.entry!.id);
        const changed = await execute(
          correction(c, closureId, "Brak odpowiedzi"),
        );
        for (const table of [lifecycle, current, revisions]) {
          assert.equal((await rows(table, c)).length, 1);
          for (const query of [
            `case_id=eq.${c}`,
            `id=eq.${table === revisions ? changed.result.revision!.id : closureId}`,
            `request_id=eq.${table === revisions ? changed.input.p_request_id : first.input.p_request_id}`,
          ]) {
            const path = `${table}?select=*&${query}`;
            const foreign = await api(path, "GET", undefined, b.token);
            assert.deepEqual(ok(foreign), []);
            assert.equal(foreign.range?.split("/")[1], "0");
            denied(await api(path, "GET", undefined, null));
          }
        }
        for (const token of [b.token, null]) {
          denied(
            await call(
              "preview_recruitment_case_lifecycle",
              correction(c, closureId),
              token,
            ),
          );
          denied(
            await call(
              "confirm_recruitment_case_lifecycle",
              first.input,
              token,
            ),
          );
        }
        const foreign = await create();
        denied(
          await call(
            "preview_recruitment_case_lifecycle",
            correction(foreign, closureId),
          ),
        );
      },
    );

    await t.test(
      "Direct mutations cannot forge closure, revision, actor, time, or arbitrary status",
      async () => {
        const c = await create();
        const first = await close(c);
        const closureId = String(first.result.entry!.id);
        const original = await rows(lifecycle, c);
        for (const table of [lifecycle, revisions]) {
          denied(
            await api(`${table}?case_id=eq.${c}`, "PATCH", {
              outcome: "Nie aplikowano",
            }),
          );
          denied(await api(`${table}?case_id=eq.${c}`, "DELETE"));
          denied(
            await api(table, "POST", {
              id: randomUUID(),
              owner_id: b.id,
              case_id: c,
              request_id: randomUUID(),
              kind: "close",
              outcome: "Inny",
              occurred_on: null,
              recorded_at: "2000-01-01T00:00:00Z",
              closure_id: closureId,
            }),
          );
        }
        denied(
          await api(`/rest/v1/recruitment_case?id=eq.${c}`, "PATCH", {
            status: "Zapisane",
            current_stage: null,
          }),
        );
        assert.deepEqual(await rows(lifecycle, c), original);
        assert.equal((await state(c)).status, "Zakończone");
      },
    );
  },
);
