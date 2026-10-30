/** DEC-055: real guarded Auth/Data API, never persistent DEV. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import {
  createAccounts,
  denied,
  request,
  type Reply,
} from "../rls/data-api.ts";
const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Stages require guarded target");
const target = await readRecruitmentTarget(id);
const cases = "/rest/v1/recruitment_case";
const events = "/rest/v1/recruitment_case_event";
const rpc = "/rest/v1/rpc/record_recruitment_case_stage_event";
const oldRpc = "/rest/v1/rpc/record_recruitment_case_event";
type State = {
  status: string;
  current_stage: string | null;
  stage_version: number;
};
type Fact = {
  id: string;
  request_id: string;
  kind: string;
  stage_name: string | null;
  previous_stage: string | null;
  expected_stage_version: number | null;
};
function rows<T>(reply: Reply): T[] {
  assert.equal(reply.status, 200);
  assert.ok(Array.isArray(reply.body));
  return reply.body as T[];
}
function success(reply: Reply) {
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return reply.body as { kind: string; event: Fact };
}
test(
  "Lifecycle 3B: qualifying invitations, snapshots, optimistic conflicts and isolation",
  { timeout: 120_000 },
  async (t) => {
    const [a, b] = await createAccounts(target);
    const api = (
      path: string,
      method = "GET",
      body?: unknown,
      token: string | null = a.token,
    ) => request(target, token ?? undefined, path, method, body, {}, "public");
    const input = (
      caseId: string,
      version = 0,
      name = "Screening",
      kind = "invitation",
    ) => ({
      p_request_id: randomUUID(),
      p_case_id: caseId,
      p_kind: kind,
      p_stage_name: name,
      p_expected_stage_version: version,
      p_occurred_on: null as string | null,
    });
    const call = (body: ReturnType<typeof input>, token = a.token) =>
      api(rpc, "POST", body, token);
    const state = async (caseId: string) =>
      rows<State>(
        await api(
          `${cases}?select=status,current_stage,stage_version&id=eq.${caseId}`,
        ),
      )[0];
    const facts = async (caseId: string) =>
      rows<Fact>(
        await api(
          `${events}?select=*&case_id=eq.${caseId}&order=recorded_at.asc,id.asc`,
        ),
      );
    const create = async (token = a.token) => {
      const body = {
        p_request_id: randomUUID(),
        p_title: `Stages QA ${randomUUID()}`,
      };
      const reply = await api(
        "/rest/v1/rpc/create_recruitment_case",
        "POST",
        body,
        token,
      );
      assert.equal(reply.status, 200);
      return { id: (reply.body as { case: { id: string } }).case.id, body };
    };
    const contact = (caseId: string) => ({
      p_request_id: randomUUID(),
      p_case_id: caseId,
      p_kind: "contact",
      p_direction: "inbound",
      p_occurred_on: null,
    });
    await t.test(
      "Saved and contacted cases enter active directly with one invitation, no invented contact or meeting",
      async () => {
        for (const contacted of [false, true]) {
          const c = await create();
          if (contacted) success(await api(oldRpc, "POST", contact(c.id)));
          const before = await facts(c.id);
          const cmd = input(c.id);
          const fact = success(await call(cmd)).event;
          assert.equal(fact.kind, "invitation");
          assert.equal(fact.stage_name, "Screening");
          assert.equal(fact.previous_stage, null);
          assert.deepEqual(await state(c.id), {
            status: "W rekrutacji",
            current_stage: "Screening",
            stage_version: 1,
          });
          assert.equal((await facts(c.id)).length, before.length + 1);
          const replay = await api(
            "/rest/v1/rpc/create_recruitment_case",
            "POST",
            c.body,
          );
          assert.equal(replay.status, 200);
          assert.equal(
            (replay.body as { case: State }).case.status,
            "W rekrutacji",
          );
        }
      },
    );
    await t.test(
      "Repeat invitation and explicit skipped-stage change preserve names, backdated facts set current stage and old replay cannot roll back",
      async () => {
        const c = await create();
        const first = input(c.id);
        const saved = success(await call(first));
        const next = input(c.id, 1, "Rozmowa techniczna");
        next.p_occurred_on = "2000-01-01";
        success(await call(next));
        const change = input(c.id, 2, "Oferta", "stage-change");
        success(await call(change));
        assert.deepEqual(await state(c.id), {
          status: "W rekrutacji",
          current_stage: "Oferta",
          stage_version: 3,
        });
        const all = await facts(c.id);
        assert.deepEqual(
          all.map((x) => [x.kind, x.stage_name, x.previous_stage]),
          [
            ["invitation", "Screening", null],
            ["invitation", "Rozmowa techniczna", "Screening"],
            ["stage-change", "Oferta", "Rozmowa techniczna"],
          ],
        );
        const replay = success(await call(first));
        assert.equal(replay.kind, "replayed");
        assert.equal(replay.event.id, saved.event.id);
        assert.equal((await state(c.id)).stage_version, 3);
        assert.equal((await facts(c.id)).length, 3);
        for (const old of [
          contact(c.id),
          { ...contact(c.id), p_kind: "application", p_direction: null },
        ])
          success(await api(oldRpc, "POST", old));
        assert.deepEqual(await state(c.id), {
          status: "W rekrutacji",
          current_stage: "Oferta",
          stage_version: 3,
        });
      },
    );
    await t.test(
      "Empty/oversize/malformed dates and unqualified kind cannot write; 160 Unicode codepoints and leap-day succeed",
      async () => {
        const c = await create();
        for (const bad of [
          { ...input(c.id), p_stage_name: "" },
          { ...input(c.id), p_stage_name: " \t " },
          { ...input(c.id), p_stage_name: "😀".repeat(161) },
          { ...input(c.id), p_occurred_on: "2025-02-29" },
          { ...input(c.id), p_occurred_on: "2999-01-01" },
          { ...input(c.id), p_occurred_on: "not-a-day" },
          input(c.id, 0, "Screening", "receipt"),
          input(c.id, 0, "Screening", "stage-change"),
        ])
          denied(await call(bad));
        assert.equal((await facts(c.id)).length, 0);
        assert.deepEqual(await state(c.id), {
          status: "Zapisane",
          current_stage: null,
          stage_version: 0,
        });
        const good = input(c.id, 0, `  ${"😀".repeat(160)}  `);
        good.p_occurred_on = "2024-02-29";
        assert.equal(
          success(await call(good)).event.stage_name,
          "😀".repeat(160),
        );
      },
    );
    await t.test(
      "Lost-response replay and fresh same-key races create once; consumed key payload conflicts do not mutate",
      async () => {
        const c = await create();
        const cmd = input(c.id);
        const values = (
          await Promise.all([call(cmd), call(cmd), call(cmd)])
        ).map(success);
        assert.equal(values.filter((x) => x.kind === "created").length, 1);
        assert.equal(new Set(values.map((x) => x.event.id)).size, 1);
        const original = await facts(c.id);
        for (const changed of [
          { ...cmd, p_stage_name: "Different" },
          { ...cmd, p_expected_stage_version: 1 },
          { ...cmd, p_kind: "stage-change" },
          { ...cmd, p_occurred_on: "2000-01-01" },
        ])
          assert.equal((await call(changed)).status, 409);
        assert.deepEqual(await facts(c.id), original);
        assert.equal(success(await call(cmd)).kind, "replayed");
        assert.equal((await state(c.id)).stage_version, 1);
      },
    );
    await t.test(
      "Concurrent distinct keys conflict atomically; ABA stage names cannot hide a stale version",
      async () => {
        const c = await create();
        success(await call(input(c.id)));
        const [left, right] = await Promise.all([
          call(input(c.id, 1, "Technical", "stage-change")),
          call(input(c.id, 1, "Task", "stage-change")),
        ]);
        assert.deepEqual([left.status, right.status].sort(), [200, 412]);
        assert.equal((await facts(c.id)).length, 2);
        assert.equal((await state(c.id)).stage_version, 2);
        success(await call(input(c.id, 2, "Screening", "stage-change")));
        const before = await facts(c.id);
        assert.equal(
          (await call(input(c.id, 1, "Stale", "stage-change"))).status,
          412,
        );
        assert.deepEqual(await facts(c.id), before);
        assert.equal((await state(c.id)).current_stage, "Screening");
      },
    );
    await t.test(
      "Direct stage insert shares invariants and mixed old/new commands preserve both real facts",
      async () => {
        const c = await create();
        const cmd = input(c.id);
        const direct = {
          request_id: cmd.p_request_id,
          case_id: c.id,
          kind: "invitation",
          stage_name: "Screening",
          expected_stage_version: 0,
          occurred_on: null,
        };
        const [inserted, old] = await Promise.all([
          api(events, "POST", direct),
          api(oldRpc, "POST", contact(c.id)),
        ]);
        assert.equal(inserted.status, 201);
        success(old);
        assert.deepEqual(await state(c.id), {
          status: "W rekrutacji",
          current_stage: "Screening",
          stage_version: 1,
        });
        assert.equal((await facts(c.id)).length, 2);
        assert.equal(success(await call(cmd)).kind, "replayed");
        const oldInput = contact(c.id);
        const oldResult = success(await api(oldRpc, "POST", oldInput));
        success(await call(input(c.id, 1, "Later", "stage-change")));
        assert.equal(
          success(await api(oldRpc, "POST", oldInput)).event.id,
          oldResult.event.id,
        );
        assert.equal((await state(c.id)).current_stage, "Later");
        const before = await facts(c.id);
        assert.equal(
          (await api(events, "POST", { ...direct, request_id: randomUUID() }))
            .status,
          412,
        );
        assert.deepEqual(await facts(c.id), before);
      },
    );
    await t.test(
      "A/B/anon cannot discover stage facts by list, ID, count, case relations or recovery key; owner keys are scoped",
      async () => {
        const ca = await create();
        const cb = await create(b.token);
        const sameKey = randomUUID();
        const ia = { ...input(ca.id), p_request_id: sameKey };
        const ib = { ...input(cb.id), p_request_id: sameKey };
        const ea = success(await call(ia)).event;
        const eb = success(await call(ib, b.token)).event;
        assert.notEqual(ea.id, eb.id);
        for (const [attacker, victim, cmd, event] of [
          [b, a, ia, ea],
          [a, b, ib, eb],
        ] as const) {
          for (const query of [
            `${events}?select=*&case_id=eq.${cmd.p_case_id}`,
            `${events}?select=*&id=eq.${event.id}`,
            `${events}?select=*&request_id=eq.${sameKey}&owner_id=eq.${victim.id}`,
            `${cases}?select=id,current_stage,stage_version,events:recruitment_case_event!recruitment_case_event_owned_case_fk(id,stage_name)&id=eq.${cmd.p_case_id}`,
            `${events}?select=id,stage_name,case:recruitment_case!recruitment_case_event_owned_case_fk(id,current_stage)&case_id=eq.${cmd.p_case_id}`,
          ]) {
            const deniedRead = await api(
              query,
              "GET",
              undefined,
              attacker.token,
            );
            assert.deepEqual(rows(deniedRead), []);
            assert.equal(deniedRead.range?.split("/")[1], "0");
          }
          denied(
            await call({ ...cmd, p_request_id: randomUUID() }, attacker.token),
          );
        }
        denied(
          await api(
            `${events}?select=stage_name,previous_stage`,
            "GET",
            undefined,
            null,
          ),
        );
        denied(await api(rpc, "POST", input(ca.id, 1), null));
      },
    );
    await t.test(
      "Direct Data API cannot forge state, snapshot, technical fields or change immutable facts",
      async () => {
        const c = await create();
        for (const patch of [
          { status: "W rekrutacji" },
          { current_stage: "Forged" },
          { stage_version: 1 },
          { status: "W rekrutacji", current_stage: "Forged", stage_version: 1 },
        ])
          denied(await api(`${cases}?id=eq.${c.id}`, "PATCH", patch));
        const cmd = input(c.id);
        for (const extra of [
          { owner_id: b.id },
          { recorded_at: "2000-01-01T00:00:00Z" },
          { previous_stage: "Forged" },
          { id: randomUUID() },
        ])
          denied(
            await api(events, "POST", {
              request_id: randomUUID(),
              case_id: c.id,
              kind: "invitation",
              stage_name: "Screening",
              expected_stage_version: 0,
              ...extra,
            }),
          );
        const saved = success(await call(cmd)).event;
        for (const method of ["PATCH", "DELETE"])
          denied(
            await api(
              `${events}?id=eq.${saved.id}`,
              method,
              method === "PATCH" ? { stage_name: "Rewrite" } : undefined,
            ),
          );
        assert.equal((await facts(c.id)).length, 1);
        assert.equal((await state(c.id)).current_stage, "Screening");
      },
    );
    await t.test(
      "A later invalid direct bulk fact rolls back invitation, active status and stage together",
      async () => {
        const c = await create();
        denied(
          await api(events, "POST", [
            {
              request_id: randomUUID(),
              case_id: c.id,
              kind: "invitation",
              stage_name: "Screening",
              expected_stage_version: 0,
            },
            {
              request_id: randomUUID(),
              case_id: c.id,
              kind: "invalid",
              stage_name: null,
              expected_stage_version: null,
            },
          ]),
        );
        assert.deepEqual(await facts(c.id), []);
        assert.deepEqual(await state(c.id), {
          status: "Zapisane",
          current_stage: null,
          stage_version: 0,
        });
      },
    );
  },
);
