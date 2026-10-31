/** DEC-054: actual Auth + Data API; run only against guarded disposable targets. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { verifyLifecycleUpgrade } from "./lifecycle-upgrade.ts";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import {
  createAccounts,
  denied,
  request,
  type Reply,
} from "../rls/data-api.ts";

type Event = {
  id: string;
  owner_id: string;
  request_id: string;
  case_id: string;
  kind: "application" | "contact";
  direction: "inbound" | "outbound" | null;
  occurred_on: string | null;
  recorded_at: string;
};
type Command = {
  p_request_id: string;
  p_case_id: string;
  p_kind: string;
  p_direction: string | null;
  p_occurred_on: string | null;
};
const targetId = process.env.RECRUITMENT_TARGET_ID;
if (!targetId) throw new Error("Lifecycle suite requires guarded target");
const target = await readRecruitmentTarget(targetId);
const eventPath = "/rest/v1/recruitment_case_event";
const casePath = "/rest/v1/recruitment_case";
const rpcPath = "/rest/v1/rpc/record_recruitment_case_event";
const api = (
  token: string | undefined,
  path: string,
  method = "GET",
  body?: unknown,
) => request(target, token, path, method, body, {}, "public");
function rows<T>(reply: Reply, expectedStatus = 200): T[] {
  assert.equal(reply.status, expectedStatus, "Expected successful owner read");
  assert.ok(Array.isArray(reply.body));
  return reply.body as T[];
}
function result(reply: Reply): { kind: "created" | "replayed"; event: Event } {
  assert.equal(reply.status, 200, "Expected successful event command");
  const value = reply.body as { kind: "created" | "replayed"; event: Event };
  assert.ok(["created", "replayed"].includes(value.kind));
  assert.ok(value.event?.id);
  return value;
}
const command = (
  caseId: string,
  overrides: Partial<Command> = {},
): Command => ({
  p_request_id: randomUUID(),
  p_case_id: caseId,
  p_kind: "application",
  p_direction: null,
  p_occurred_on: null,
  ...overrides,
});
const direct = (input: Command) => ({
  request_id: input.p_request_id,
  case_id: input.p_case_id,
  kind: input.p_kind,
  direction: input.p_direction,
  occurred_on: input.p_occurred_on,
});

// Register separately so a stale create-only suite cannot silently certify lifecycle.
test(
  "Lifecycle 3A: real facts, transactions, replay, hostile direct API and A/B isolation",
  { timeout: 120_000 },
  async (t) => {
    const [a, b] = await createAccounts(target);
    const call = (input: Command, token: string | undefined = a.token) =>
      api(token, rpcPath, "POST", input);
    async function create(token = a.token) {
      const input = {
        p_request_id: randomUUID(),
        p_title: `Lifecycle QA ${randomUUID()}`,
      };
      const reply = await api(
        token,
        "/rest/v1/rpc/create_recruitment_case",
        "POST",
        input,
      );
      assert.equal(reply.status, 200);
      const saved = (reply.body as { case: { id: string; status: string } })
        .case;
      assert.equal(saved.status, "Zapisane");
      return { id: saved.id, input };
    }
    const events = async (caseId: string, token = a.token) =>
      rows<Event>(
        await api(token, `${eventPath}?select=*&case_id=eq.${caseId}`),
      );
    const status = async (caseId: string, token = a.token) =>
      rows<{ status: string }>(
        await api(token, `${casePath}?select=status&id=eq.${caseId}`),
      )[0]?.status;
    const own = await create();
    const foreign = await create(b.token);
    const first = command(own.id, { p_occurred_on: "2000-02-01" });
    let firstEvent: Event;

    await t.test(
      "Application changes saved status atomically; actual day and server registration remain distinct",
      async () => {
        assert.deepEqual(
          await events(own.id),
          [],
          "No fictitious business backfill",
        );
        const before = Date.now();
        firstEvent = result(await call(first)).event;
        assert.equal(firstEvent.kind, "application");
        assert.equal(firstEvent.direction, null);
        assert.equal(firstEvent.occurred_on, "2000-02-01");
        assert.ok(Date.parse(firstEvent.recorded_at) >= before - 2000);
        assert.ok(Date.parse(firstEvent.recorded_at) <= Date.now() + 2000);
        assert.equal(await status(own.id), "Kontakt rozpoczęty");
        assert.equal((await events(own.id)).length, 1);
        const createReplay = await api(
          a.token,
          "/rest/v1/rpc/create_recruitment_case",
          "POST",
          own.input,
        );
        assert.equal(
          createReplay.status,
          200,
          "Create replay must accept now-contacted case",
        );
        assert.equal((createReplay.body as { kind: string }).kind, "replayed");
        assert.equal(
          (createReplay.body as { case: { status: string } }).case.status,
          "Kontakt rozpoczęty",
        );
      },
    );
    await t.test(
      "Inbound and outbound contact add distinct true facts with unknown date or older day, without status regression",
      async () => {
        for (const [direction, day] of [
          ["inbound", null],
          ["outbound", "2000-01-01"],
        ] as const) {
          const saved = result(
            await call(
              command(own.id, {
                p_kind: "contact",
                p_direction: direction,
                p_occurred_on: day,
              }),
            ),
          ).event;
          assert.equal(saved.kind, "contact");
          assert.equal(saved.direction, direction);
          assert.equal(saved.occurred_on, day);
          assert.equal(await status(own.id), "Kontakt rozpoczęty");
        }
        assert.equal((await events(own.id)).length, 3);
      },
    );
    await t.test(
      "Lost committed response and same-key concurrent retries return one immutable event",
      async () => {
        const input = command(own.id);
        await call(input); // Deliberately ignore the response: server commit is not a browser acknowledgement.
        const replies = await Promise.all(
          Array.from({ length: 4 }, () => call(input)),
        );
        const values = replies.map(result);
        assert.ok(values.every((value) => value.kind === "replayed"));
        assert.equal(new Set(values.map((value) => value.event.id)).size, 1);
        assert.equal(
          (await events(own.id)).filter(
            (event) => event.request_id === input.p_request_id,
          ).length,
          1,
        );
        const snapshot = await events(own.id);
        for (const changed of [
          { ...input, p_occurred_on: "2000-01-01" },
          { ...input, p_kind: "contact", p_direction: "inbound" },
          { ...input, p_case_id: (await create()).id },
        ])
          assert.equal(
            (await call(changed)).status,
            409,
            "Consumed key cannot represent a different fact",
          );
        assert.deepEqual(await events(own.id), snapshot);
      },
    );
    await t.test(
      "Fresh concurrent same intent and two different intents preserve every true fact exactly once",
      async () => {
        const fresh = await create();
        const input = command(fresh.id);
        const outcomes = (
          await Promise.all([call(input), call(input), call(input)])
        ).map(result);
        assert.equal(
          outcomes.filter((value) => value.kind === "created").length,
          1,
        );
        assert.equal(new Set(outcomes.map((value) => value.event.id)).size, 1);
        const distinct = [
          command(fresh.id, { p_kind: "contact", p_direction: "inbound" }),
          command(fresh.id, { p_kind: "contact", p_direction: "outbound" }),
        ];
        const saved = (
          await Promise.all(distinct.map((value) => call(value)))
        ).map(result);
        assert.equal(new Set(saved.map((value) => value.event.id)).size, 2);
        assert.equal((await events(fresh.id)).length, 3);
        assert.equal(await status(fresh.id), "Kontakt rozpoczęty");
      },
    );
    await t.test(
      "Invalid kinds, directions and dates produce no facts or status writes through RPC or direct insert",
      async () => {
        const fresh = await create();
        for (const invalid of [
          { p_kind: "automatic-receipt" },
          { p_kind: "contact", p_direction: null },
          { p_direction: "outbound" },
          { p_kind: "contact", p_direction: "sideways" },
          { p_occurred_on: "2999-01-01" },
          { p_occurred_on: "2025-02-29" },
          { p_occurred_on: "not-a-day" },
        ]) {
          const input = command(fresh.id, invalid);
          denied(await call(input));
          denied(await api(a.token, eventPath, "POST", direct(input)));
        }
        assert.deepEqual(await events(fresh.id), []);
        assert.equal(await status(fresh.id), "Zapisane");
      },
    );
    await t.test(
      "One direct bulk statement rolls back the first fact and its triggered status when a later fact is invalid",
      async () => {
        const fresh = await create();
        denied(
          await api(a.token, eventPath, "POST", [
            direct(command(fresh.id)),
            direct(command(fresh.id, { p_kind: "invalid" })),
          ]),
        );
        assert.deepEqual(await events(fresh.id), []);
        assert.equal(
          await status(fresh.id),
          "Zapisane",
          "Event and status share the transaction",
        );
      },
    );
    await t.test(
      "Owner status cannot change before facts; direct input follows same fact/status atomicity",
      async () => {
        const fresh = await create();
        denied(
          await api(a.token, `${casePath}?id=eq.${fresh.id}`, "PATCH", {
            status: "Kontakt rozpoczęty",
          }),
        );
        assert.equal(await status(fresh.id), "Zapisane");
        const input = command(fresh.id, {
          p_kind: "contact",
          p_direction: "outbound",
        });
        const inserted = await api(a.token, eventPath, "POST", direct(input));
        assert.equal(inserted.status, 201);
        assert.equal(await status(fresh.id), "Kontakt rozpoczęty");
        const replay = result(await call(input));
        assert.equal(replay.kind, "replayed");
        assert.equal(replay.event.id, (await events(fresh.id))[0].id);
        for (const value of [
          "Zapisane",
          "W rekrutacji",
          "Zakończone",
          "Wstrzymane",
        ])
          denied(
            await api(a.token, `${casePath}?id=eq.${fresh.id}`, "PATCH", {
              status: value,
            }),
          );
        assert.equal(await status(fresh.id), "Kontakt rozpoczęty");
      },
    );
    await t.test(
      "Direct insert racing RPC cannot duplicate owner/key and replay resolves the surviving committed fact",
      async () => {
        const fresh = await create();
        const input = command(fresh.id);
        const [rpc, insert] = await Promise.all([
          call(input),
          api(a.token, eventPath, "POST", direct(input)),
        ]);
        result(rpc);
        assert.ok([201, 409].includes(insert.status));
        const stored = await events(fresh.id);
        assert.equal(stored.length, 1);
        assert.equal(result(await call(input)).event.id, stored[0].id);
      },
    );
    await t.test(
      "Owner and technical dates/IDs cannot be supplied; history is append-only even via direct API",
      async () => {
        const fresh = await create();
        for (const extra of [
          { owner_id: a.id },
          { owner_id: b.id },
          { recorded_at: "2000-01-01T00:00:00Z" },
          { id: randomUUID() },
        ])
          denied(
            await api(a.token, eventPath, "POST", {
              ...direct(command(fresh.id)),
              ...extra,
            }),
          );
        for (const extra of [
          { p_owner_id: b.id },
          { p_recorded_at: "2000-01-01T00:00:00Z" },
        ])
          denied(
            await api(a.token, rpcPath, "POST", {
              ...command(fresh.id),
              ...extra,
            }),
          );
        const before = await events(own.id);
        for (const method of ["PATCH", "DELETE"])
          denied(
            await api(
              a.token,
              `${eventPath}?id=eq.${firstEvent.id}`,
              method,
              method === "PATCH" ? { occurred_on: "2001-01-01" } : undefined,
            ),
          );
        assert.deepEqual(await events(own.id), before);
        assert.deepEqual(await events(fresh.id), []);
      },
    );
    await t.test(
      "A/B/anon cannot cross case relations, event list/ID/filter/count or action results",
      async () => {
        for (const [attacker, victim] of [
          [a, b],
          [b, a],
        ] as const) {
          const victimCase = victim.id === a.id ? own.id : foreign.id;
          result(await call(command(victimCase), victim.token));
          const victimEvents = await events(victimCase, victim.token);
          assert.ok(victimEvents.length > 0);
          assert.deepEqual(await events(victimCase, attacker.token), []);
          assert.deepEqual(
            rows(
              await api(
                attacker.token,
                `${eventPath}?id=eq.${victimEvents[0].id}&select=*`,
              ),
            ),
            [],
          );
          const filtered = await api(
            attacker.token,
            `${eventPath}?owner_id=eq.${victim.id}&select=id`,
          );
          assert.deepEqual(rows(filtered), []);
          assert.equal(filtered.range?.split("/")[1], "0");
          denied(await call(command(victimCase), attacker.token));
          denied(
            await api(
              attacker.token,
              eventPath,
              "POST",
              direct(command(victimCase)),
            ),
          );
          denied(
            await api(attacker.token, eventPath, "POST", {
              ...direct(command(victimCase)),
              owner_id: victim.id,
            }),
          );
        }
        denied(await api(undefined, `${eventPath}?select=*`));
        denied(await api(undefined, rpcPath, "POST", command(own.id)));
        denied(
          await api(undefined, eventPath, "POST", direct(command(own.id))),
        );
        const reusedKey = randomUUID();
        const left = result(
          await call(command(own.id, { p_request_id: reusedKey }), a.token),
        );
        const right = result(
          await call(command(foreign.id, { p_request_id: reusedKey }), b.token),
        );
        assert.notEqual(left.event.id, right.event.id);
        const absent = await call(command(randomUUID()), a.token);
        const other = await call(command(foreign.id), a.token);
        assert.equal(
          absent.status,
          other.status,
          "Missing/cross-owner cases use the same denial",
        );
        assert.deepEqual(
          absent.body,
          other.body,
          "No existence oracle in RPC response",
        );
      },
    );
    await t.test(
      "Warsaw calendar boundary accepts today's date and rejects tomorrow regardless of database session timezone",
      async () => {
        const sql = postgres({
          ...target.db,
          max: 1,
          ssl: false,
          onnotice: () => {},
        });
        try {
          const [days] =
            await sql`select to_char((current_timestamp at time zone 'Europe/Warsaw')::date,'YYYY-MM-DD') today,to_char((current_timestamp at time zone 'Europe/Warsaw')::date+1,'YYYY-MM-DD') tomorrow`;
          const fresh = await create();
          result(await call(command(fresh.id, { p_occurred_on: days.today })));
          denied(
            await call(command(fresh.id, { p_occurred_on: days.tomorrow })),
          );
          denied(
            await api(
              a.token,
              eventPath,
              "POST",
              direct(command(fresh.id, { p_occurred_on: days.tomorrow })),
            ),
          );
          assert.equal((await events(fresh.id)).length, 1);
        } finally {
          await sql.end();
        }
      },
    );
    await t.test(
      "Warsaw day remains authoritative under UTC and Pacific SQL session timezones",
      async () => {
        const sql = postgres({
          ...target.db,
          max: 1,
          ssl: false,
          onnotice: () => {},
        });
        try {
          const [days] =
            await sql`select to_char((current_timestamp at time zone 'Europe/Warsaw')::date,'YYYY-MM-DD') today,to_char((current_timestamp at time zone 'Europe/Warsaw')::date+1,'YYYY-MM-DD') tomorrow`;
          for (const zone of [
            "UTC",
            "Pacific/Honolulu",
            "Pacific/Kiritimati",
          ]) {
            const fresh = await create();
            const inZone = async (day: string) =>
              sql.begin(async (tx) => {
                await tx.unsafe("select set_config('TimeZone',$1,true)", [
                  zone,
                ]);
                const [setting] = await tx.unsafe(
                  "select current_setting('TimeZone') zone",
                );
                assert.equal(
                  setting.zone,
                  zone,
                  "Test must really change PostgreSQL session timezone",
                );
                await tx.unsafe("set local role authenticated");
                await tx.unsafe(
                  "select set_config('request.jwt.claim.sub',$1,true)",
                  [a.id],
                );
                const [reply] = await tx.unsafe(
                  "select public.record_recruitment_case_event($1::uuid,$2::uuid,'application',null,$3::date) result",
                  [randomUUID(), fresh.id, day],
                );
                return reply.result;
              });
            assert.equal((await inZone(days.today)).kind, "created");
            await assert.rejects(
              inZone(days.tomorrow),
              (error: unknown) =>
                typeof error === "object" &&
                error !== null &&
                "code" in error &&
                error.code === "22023",
            );
            assert.equal((await events(fresh.id)).length, 1);
          }
        } finally {
          await sql.end();
        }
      },
    );
    await t.test(
      "Equal-day equal-registration UUID ordering and paged identities remain stable and disjoint",
      async () => {
        const fresh = await create();
        const ids: string[] = [];
        for (let index = 0; index < 28; index++)
          ids.push(
            result(
              await call(command(fresh.id, { p_occurred_on: "2000-01-01" })),
            ).event.id,
          );
        const sql = postgres({
          ...target.db,
          max: 1,
          ssl: false,
          onnotice: () => {},
        });
        try {
          // Immutable through every user path; admin fixture only forces a realistic timestamp tie.
          await sql`update public.recruitment_case_event set recorded_at='2000-02-01T12:00:00Z' where case_id=${fresh.id}::uuid`;
          const query = `${eventPath}?select=id&case_id=eq.${fresh.id}&order=occurred_on.desc.nullslast,recorded_at.desc,id.desc`;
          const readPage = async (offset: number) => {
            const reply = await api(
              a.token,
              query + `&offset=${offset}&limit=25`,
            );
            assert.equal(
              reply.range,
              `${offset}-${Math.min(offset + 24, 27)}/28`,
              "Exact owner-scoped range/count must describe this page",
            );
            return rows<{ id: string }>(reply, 206).map((row) => row.id);
          };
          const pageOne = await readPage(0);
          const pageTwo = await readPage(25);
          const again = await readPage(0);
          const expected = [...ids].sort().reverse();
          assert.deepEqual(pageOne, expected.slice(0, 25));
          assert.deepEqual(pageTwo, expected.slice(25));
          assert.deepEqual(again, pageOne);
          assert.equal(new Set([...pageOne, ...pageTwo]).size, 28);
          assert.ok(pageOne.every((id) => !pageTwo.includes(id)));
        } finally {
          await sql.end();
        }
      },
    );
    await t.test(
      "Embedded event↔case relation reads preserve positive ownership and deny foreign parent/child metadata",
      async () => {
        const fk = "recruitment_case_event_owned_case_fk";
        for (const [owner, ownCase, otherCase] of [
          [a, own.id, foreign.id],
          [b, foreign.id, own.id],
        ] as const) {
          const ownEvents = await events(ownCase, owner.token);
          assert.ok(ownEvents.length > 0);
          const joined = rows<{
            id: string;
            case: { id: string; owner_id: string };
          }>(
            await api(
              owner.token,
              `${eventPath}?select=id,case:recruitment_case!${fk}(id,owner_id)&case_id=eq.${ownCase}`,
            ),
          );
          assert.equal(joined.length, ownEvents.length);
          assert.ok(
            joined.every(
              (row) =>
                row.case.id === ownCase && row.case.owner_id === owner.id,
            ),
          );
          assert.deepEqual(
            rows(
              await api(
                owner.token,
                `${eventPath}?select=id,case:recruitment_case!${fk}(id,owner_id)&case_id=eq.${otherCase}`,
              ),
            ),
            [],
          );
          const parent = rows<{
            id: string;
            events: { id: string; case_id: string; owner_id: string }[];
          }>(
            await api(
              owner.token,
              `${casePath}?select=id,events:recruitment_case_event!${fk}(id,case_id,owner_id)&id=eq.${ownCase}`,
            ),
          );
          assert.equal(parent.length, 1);
          assert.equal(parent[0].events.length, ownEvents.length);
          assert.ok(
            parent[0].events.every(
              (row) => row.case_id === ownCase && row.owner_id === owner.id,
            ),
          );
          assert.deepEqual(
            rows(
              await api(
                owner.token,
                `${casePath}?select=id,events:recruitment_case_event!${fk}(id,case_id,owner_id)&id=eq.${otherCase}`,
              ),
            ),
            [],
          );
        }
      },
    );
    await t.test(
      "Historical facts cannot authorize a direct status correction; immutable registration time cannot be rewritten",
      async () => {
        const fresh = await create();
        const saved = result(await call(command(fresh.id))).event;
        const sql = postgres({
          ...target.db,
          max: 1,
          ssl: false,
          onnotice: () => {},
        });
        try {
          // Impossible-to-create-through-user-path state, confined to a verified disposable target.
          // Disable only this guard inside one transaction; PostgreSQL restores it on rollback too.
          await sql.begin(async (tx) => {
            await tx.unsafe(
              "alter table public.recruitment_case disable trigger recruitment_case_guard_status",
            );
            await tx.unsafe(
              "update public.recruitment_case set status='Zapisane' where id=$1::uuid",
              [fresh.id],
            );
            await tx.unsafe(
              "alter table public.recruitment_case enable trigger recruitment_case_guard_status",
            );
          });
          denied(
            await api(a.token, `${casePath}?id=eq.${fresh.id}`, "PATCH", {
              status: "Kontakt rozpoczęty",
            }),
          );
          assert.equal(await status(fresh.id), "Zapisane");
          denied(
            await api(a.token, `${eventPath}?id=eq.${saved.id}`, "PATCH", {
              recorded_at: "2000-01-01T00:00:00Z",
            }),
          );
          const stored = (await events(fresh.id))[0];
          assert.equal(
            Date.parse(stored.recorded_at),
            Date.parse(saved.recorded_at),
          );
          assert.equal(stored.id, saved.id);
          // A new true fact can repair the synthetic state through the real authorized path.
          result(
            await call(
              command(fresh.id, { p_kind: "contact", p_direction: "inbound" }),
            ),
          );
          assert.equal(await status(fresh.id), "Kontakt rozpoczęty");
        } finally {
          await sql.end();
        }
      },
    );
    await t.test(
      "Physical upgrades through 3A and 3B preserve existing cases and real facts without fictional backfill",
      async () => {
        await verifyLifecycleUpgrade(target);
      },
    );
    await t.test(
      "Catalog: RLS, append-only column grants, invoker functions and same-owner relation constraints",
      async () => {
        const sql = postgres({
          ...target.db,
          max: 1,
          ssl: false,
          onnotice: () => {},
        });
        try {
          const [relation] =
            await sql`select relrowsecurity from pg_class where oid='public.recruitment_case_event'::regclass`;
          assert.equal(relation.relrowsecurity, true);
          for (const role of ["anon", "authenticated"]) {
            const [p] =
              await sql`select has_table_privilege(${role},'public.recruitment_case_event','SELECT') s,has_table_privilege(${role},'public.recruitment_case_event','INSERT') i,has_table_privilege(${role},'public.recruitment_case_event','UPDATE') u,has_table_privilege(${role},'public.recruitment_case_event','DELETE') d,has_table_privilege(${role},'public.recruitment_case_event','TRUNCATE') t`;
            assert.equal(p.s, role === "authenticated");
            assert.equal(p.i, false);
            assert.equal(p.u, false);
            assert.equal(p.d, false);
            assert.equal(p.t, false);
            for (const col of [
              "request_id",
              "case_id",
              "kind",
              "direction",
              "occurred_on",
              "id",
              "owner_id",
              "recorded_at",
            ]) {
              const [grant] =
                await sql`select has_column_privilege(${role},'public.recruitment_case_event',${col},'INSERT') allowed`;
              assert.equal(
                grant.allowed,
                role === "authenticated" &&
                  [
                    "request_id",
                    "case_id",
                    "kind",
                    "direction",
                    "occurred_on",
                  ].includes(col),
              );
            }
          }
          const [fn] =
            await sql`select p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_recruitment_case_event'`;
          assert.equal(fn.prosecdef, false);
          assert.ok(
            fn.proconfig.some((v: string) => /^search_path=(""|)$/.test(v)),
          );
          const acl =
            await sql`select a.grantee from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='public' and p.proname='record_recruitment_case_event' and a.grantee=0`;
          assert.equal(acl.length, 0);
          const constraints =
            await sql`select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.recruitment_case_event'::regclass and contype='f'`;
          assert.ok(
            constraints.some(
              (row) =>
                /case_id/.test(row.definition) &&
                /owner_id/.test(row.definition),
            ),
          );
          assert.ok(
            constraints.every(
              (row) => !/ON DELETE CASCADE/.test(row.definition),
            ),
          );
        } finally {
          await sql.end();
        }
      },
    );
  },
);
