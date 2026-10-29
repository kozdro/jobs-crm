/** Real local product schema/Auth/Data API coverage. No mock can prove RLS. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { deterministicDirectInsertRace } from "./direct-insert-race.ts";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import {
  createAccounts,
  denied,
  errorCode,
  request,
  type Reply,
} from "../rls/data-api.ts";

type Case = {
  id: string;
  owner_id?: string;
  request_id?: string;
  title: string;
  description: string | null;
  source_url: string | null;
  status: string;
  created_at: string;
};
type Command = {
  p_request_id: string;
  p_title: string;
  p_description?: string | null;
  p_source_url?: string | null;
  p_allow_duplicate?: boolean;
};
type Result = {
  kind: "created" | "replayed" | "duplicates";
  case?: Case;
  matches?: Case[];
};
const id = process.env.RECRUITMENT_TARGET_ID;
if (!id)
  throw new Error("RECRUITMENT_TARGET_ID required; use guarded slice runner");
const target = await readRecruitmentTarget(id);
const table = "/rest/v1/recruitment_case";
const rpc = "/rest/v1/rpc/create_recruitment_case";
const query = (suffix = "") => `${table}?select=*${suffix}`;
const call = (token: string | undefined, body: Command) =>
  request(target, token, rpc, "POST", body, {}, "public");
const read = (token: string | undefined, suffix = "") =>
  request(target, token, query(suffix), "GET", undefined, {}, "public");
const command = (title = `Synthetic-${randomUUID()}`): Command => ({
  p_request_id: randomUUID(),
  p_title: title,
});
function success(reply: Reply): Result {
  assert.equal(
    reply.status,
    200,
    `Expected RPC success; code=${errorCode(reply)}`,
  );
  const result = reply.body as Result;
  assert.ok(["created", "replayed", "duplicates"].includes(result.kind));
  return result;
}
function created(reply: Reply): Case {
  const result = success(reply);
  assert.ok(result.kind === "created" || result.kind === "replayed");
  assert.ok(
    result.case?.id,
    "Successful create must return the persisted case",
  );
  return result.case;
}
function rows(reply: Reply): Case[] {
  assert.equal(
    reply.status,
    200,
    `Expected SELECT success; code=${errorCode(reply)}`,
  );
  assert.ok(Array.isArray(reply.body));
  return reply.body as Case[];
}
const db = () =>
  postgres({ ...target.db, max: 1, ssl: false, onnotice: () => {} });

test(
  "First RecruitmentCase: real Auth A/B/anon, validation, atomic create, retry and RLS",
  { timeout: 120_000 },
  async (t) => {
    const [a, b] = await createAccounts(target);
    let aCase: Case;
    let bCase: Case;
    const marker = `QA-${randomUUID()}`;
    // The runner owns stdout redaction. Never stringify replies containing session material.
    async function check(name: string, fn: () => Promise<void>) {
      let failed = false;
      await t.test(name, async () => {
        try {
          await fn();
        } catch (error) {
          failed = true;
          const label =
            error instanceof Error
              ? error.message.split("\n")[0]
              : "unknown failure";
          throw new Error(
            `Required RecruitmentCase case failed: ${name}; ${label}`,
          );
        }
      });
      if (failed)
        throw new Error(`Required RecruitmentCase case failed: ${name}`);
    }

    await check(
      "QC/LC minimal title only creates saved case without application event or optional fields",
      async () => {
        const c = command(`  Kontakt z rekruterem ${marker}  `);
        aCase = created(await call(a.token, c));
        assert.equal(aCase.title, c.p_title.trim());
        assert.equal(aCase.description, null);
        assert.equal(aCase.source_url, null);
        assert.equal(aCase.status, "Zapisane");
        assert.ok(Number.isFinite(Date.parse(aCase.created_at)));
        const persisted = rows(await read(a.token, `&id=eq.${aCase.id}`));
        assert.equal(persisted.length, 1);
        assert.equal(persisted[0].owner_id, a.id);
        assert.equal(persisted[0].request_id, c.p_request_id);
        assert.equal(persisted[0].status, "Zapisane");
        bCase = created(await call(b.token, command(`B-${marker}`)));
      },
    );

    await check(
      "Unicode codepoint160 title/2000 description accepted,161/2001 rejected without partial row",
      async () => {
        const title = "ą😀".repeat(80);
        const description = "ł🚀".repeat(1000);
        assert.equal(Array.from(title).length, 160);
        assert.equal(
          title.length,
          240,
          "Astral sample must distinguish UTF16 from codepoints",
        );
        const accepted = created(
          await call(a.token, {
            ...command(title),
            p_description: description,
          }),
        );
        assert.equal(accepted.title, title);
        assert.equal(accepted.description, description);
        for (const body of [
          { ...command(`${title}ż`), p_description: null },
          { ...command(), p_description: `${description}ć` },
        ]) {
          denied(await call(a.token, body));
          assert.equal(
            rows(await read(a.token, `&request_id=eq.${body.p_request_id}`))
              .length,
            0,
          );
        }
      },
    );

    await check(
      "Missing/null/whitespace title rejected; empty description becomes absent with consistent Unicode trim",
      async () => {
        for (const title of [null, "", "   ", "\t\n\r", "\u00a0\u2003\ufeff"]) {
          const body = { ...command(), p_title: title } as unknown as Command;
          denied(await call(a.token, body));
          assert.equal(
            rows(await read(a.token, `&request_id=eq.${body.p_request_id}`))
              .length,
            0,
          );
        }
        const missing = await request(
          target,
          a.token,
          rpc,
          "POST",
          { p_request_id: randomUUID() },
          {},
          "public",
        );
        denied(missing);
        for (const description of ["", "  ", "\t\u00a0\u2003\ufeff"]) {
          const row = created(
            await call(a.token, { ...command(), p_description: description }),
          );
          assert.equal(row.description, null);
        }
        const title = `${marker}-Unicode-trim`;
        const row = created(
          await call(a.token, command(`\u00a0\t${title}\u2003\ufeff`)),
        );
        assert.equal(row.title, title);
      },
    );

    await check(
      "HTTP/HTTPS URL accepted; query/hash identifiers preserved; no source fetching",
      async () => {
        for (const source of [
          `https://example.invalid/jobs?id=${marker}&source=keep#publication`,
          `http://example.invalid/offer/${marker}?posting=42`,
        ]) {
          const row = created(
            await call(a.token, { ...command(), p_source_url: source }),
          );
          assert.equal(row.source_url, source);
        }
      },
    );

    await check(
      "Unsafe/relative/malformed source URL rejected atomically; no orphan case or fallback success",
      async () => {
        for (const source of [
          "javascript:alert(1)",
          "data:text/html,x",
          "file:///tmp/x",
          "ftp://example.invalid/x",
          "/relative",
          "https://",
          "not a url",
          "https://example.invalid/with space",
        ]) {
          const body = { ...command(), p_source_url: source };
          denied(await call(a.token, body));
          assert.equal(
            rows(await read(a.token, `&request_id=eq.${body.p_request_id}`))
              .length,
            0,
          );
        }
      },
    );

    await check(
      "A/B list, direct ID, owner filter and exact count reveal only current owner's rows",
      async () => {
        for (const [user, foreign] of [
          [a, bCase],
          [b, aCase],
        ] as const) {
          const list = rows(await read(user.token));
          assert.ok(list.length > 0, "Positive owner list precondition");
          assert.ok(
            list.every((row) => row.owner_id === user.id),
            "Cross-owner list leak",
          );

          assert.equal(
            rows(await read(user.token, `&id=eq.${foreign.id}`)).length,
            0,
            "Cross-owner ID leak",
          );
          const count = await request(
            target,
            user.token,
            `${table}?owner_id=eq.${user.id === a.id ? b.id : a.id}&select=id`,
            "HEAD",
            undefined,
            { Prefer: "count=exact" },
            "public",
          );
          assert.equal(count.status, 200);
          assert.equal(
            count.range?.split("/")[1],
            "0",
            "Cross-owner count leak",
          );
        }
      },
    );

    await check(
      "Malformed host/port/IPv6 fails RPC and direct INSERT; valid canonical IPv6 remains allowed",
      async () => {
        const invalid = [
          "https://example.invalid:65536/",
          "https://example.invalid:wrong/",
          "https://example.invalid:/",
          "https://[:::1]/",
          "https://[not-ipv6]/",
          "https://999.999.999.999/",
          "https://127.0.0.999/",
          "https:///missing-host",
          "https://example.invalid\\evil/",
          "https://exa mple.invalid/",
        ];
        for (const source of invalid) {
          const c = { ...command(), p_source_url: source };
          denied(await call(a.token, c));
          denied(
            await request(
              target,
              a.token,
              table,
              "POST",
              {
                request_id: c.p_request_id,
                title: c.p_title,
                source_url: source,
              },
              {},
              "public",
            ),
          );
          assert.equal(
            rows(await read(a.token, `&request_id=eq.${c.p_request_id}`))
              .length,
            0,
          );
        }
        const source = "https://[2001:db8::1]:8443/offer?id=42#keep";
        const accepted = created(
          await call(a.token, { ...command(), p_source_url: source }),
        );
        assert.equal(accepted.source_url, source);
      },
    );
    await check(
      "Anon has neither table SELECT/INSERT nor RPC EXECUTE, with and without anonymous JWT",
      async () => {
        for (const token of [undefined, target.anonKey]) {
          denied(await read(token));
          denied(
            await request(
              target,
              token,
              table,
              "POST",
              { title: marker, request_id: randomUUID() },
              {},
              "public",
            ),
          );
          denied(await call(token, command()));
        }
      },
    );

    await check(
      "Direct Data API cannot spoof owner/status/ID/technical creation time or mutate existing cases",
      async () => {
        for (const extra of [
          { owner_id: b.id },
          { owner_id: a.id },
          { status: "W rekrutacji" },
          { status: "Zakończone" },
          { status: "Wstrzymana" },
          { id: randomUUID() },
          { created_at: "2000-01-01T00:00:00Z" },
        ]) {
          const key = randomUUID();
          denied(
            await request(
              target,
              a.token,
              table,
              "POST",
              { title: marker, request_id: key, ...extra },
              {},
              "public",
            ),
          );
          assert.equal(
            rows(await read(a.token, `&request_id=eq.${key}`)).length,
            0,
          );
        }
        for (const [method, payload] of [
          ["PATCH", { title: "must-not-change" }],
          ["DELETE", undefined],
        ] as const)
          denied(
            await request(
              target,
              a.token,
              `${table}?id=eq.${aCase.id}`,
              method,
              payload,
              {},
              "public",
            ),
          );
        const persisted = rows(await read(a.token, `&id=eq.${aCase.id}`))[0];
        assert.equal(persisted.title, aCase.title);
        assert.equal(persisted.status, "Zapisane");
        denied(
          await request(
            target,
            a.token,
            rpc,
            "POST",
            { ...command(), p_owner_id: b.id },
            {},
            "public",
          ),
        );
        denied(
          await request(
            target,
            a.token,
            rpc,
            "POST",
            { ...command(), p_status: "W rekrutacji" },
            {},
            "public",
          ),
        );
      },
    );

    await check(
      "Duplicate title/URL returns own matches and no write; explicit choice creates independent case",
      async () => {
        const title = `Duplicate-${marker}`;
        const url = `https://example.invalid/duplicate?id=${marker}&keep=1`;
        const original = created(
          await call(a.token, { ...command(title), p_source_url: url }),
        );
        for (const c of [
          command(`  ${title}  `),
          { ...command(), p_source_url: url },
        ]) {
          const result = success(await call(a.token, c));
          assert.equal(result.kind, "duplicates");
          assert.ok(result.matches?.some((row) => row.id === original.id));
          assert.ok(result.matches?.every((row) => row.id !== bCase.id));
          assert.equal(
            rows(await read(a.token, `&request_id=eq.${c.p_request_id}`))
              .length,
            0,
            "Warning/cancel must not persist",
          );
        }
        const second = created(
          await call(a.token, {
            ...command(title),
            p_source_url: url,
            p_allow_duplicate: true,
          }),
        );
        assert.notEqual(second.id, original.id);
        const existing = rows(await read(a.token, `&id=eq.${original.id}`))[0];
        assert.equal(existing.title, original.title);
        assert.equal(existing.source_url, original.source_url);
        const unrelated = created(
          await call(a.token, command(`Different-${marker}`)),
        );
        assert.ok(unrelated.id);
      },
    );

    await check(
      "Duplicate warning never queries another owner; identical A/B business fields create independently",
      async () => {
        const title = `Private-match-${marker}`;
        const url = `https://example.invalid/private?id=${marker}`;
        const rowA = created(
          await call(a.token, { ...command(title), p_source_url: url }),
        );
        const resultB = success(
          await call(b.token, { ...command(title), p_source_url: url }),
        );
        assert.equal(resultB.kind, "created");
        assert.notEqual(resultB.case?.id, rowA.id);
        const warningB = success(await call(b.token, command(title)));
        assert.equal(warningB.kind, "duplicates");
        assert.ok(warningB.matches?.every((row) => row.id !== rowA.id));
      },
    );

    await check(
      "Identical retries/lost response reuse one committed result before duplicate checking",
      async () => {
        const c = {
          ...command(),
          p_source_url: `https://example.invalid/retry?id=${marker}`,
        };
        // Response intentionally not consumed by the caller. Timeout/response loss is not a rollback.
        const committed = await call(a.token, c);
        assert.equal(committed.status, 200);
        const result = success(await call(a.token, c));
        assert.equal(result.kind, "replayed");
        assert.ok(result.case?.id);
        const again = success(
          await call(a.token, { ...c, p_allow_duplicate: true }),
        );
        assert.equal(
          again.kind,
          "replayed",
          "Confirmation is transport control, not persisted payload",
        );
        assert.equal(again.case?.id, result.case?.id);
        assert.equal(
          rows(await read(a.token, `&request_id=eq.${c.p_request_id}`)).length,
          1,
        );
      },
    );

    await check(
      "Parallel identical requests/double-click produce exactly one case",
      async () => {
        const c = command();
        const replies = await Promise.all(
          Array.from({ length: 8 }, () => call(a.token, c)),
        );
        const results = replies.map(success);
        assert.equal(
          results.filter((result) => result.kind === "created").length,
          1,
        );
        assert.equal(
          results.filter((result) => result.kind === "replayed").length,
          7,
        );
        assert.equal(new Set(results.map((result) => result.case?.id)).size, 1);
        assert.equal(
          rows(await read(a.token, `&request_id=eq.${c.p_request_id}`)).length,
          1,
        );
      },
    );

    await check(
      "Same request key with changed payload returns409 and leaves original unchanged",
      async () => {
        const c = command();
        const original = created(await call(a.token, c));
        for (const delta of [
          { p_title: "Different title" },
          { p_description: "Different context" },
          { p_source_url: "https://example.invalid/changed" },
        ]) {
          const reply = await call(a.token, { ...c, ...delta });
          assert.equal(reply.status, 409);
          assert.equal(errorCode(reply), "PT409");
        }
        const persisted = rows(
          await read(a.token, `&request_id=eq.${c.p_request_id}`),
        );

        assert.equal(persisted.length, 1);
        assert.equal(persisted[0].id, original.id);
        assert.equal(persisted[0].title, original.title);
        assert.equal(persisted[0].description, original.description);
        assert.equal(persisted[0].source_url, original.source_url);
      },
    );

    await check(
      "Permitted direct INSERT races RPC: owner/key uniqueness survives and replay resolves committed result",
      async () => {
        for (let round = 0; round < 3; round++) {
          const c = command();
          const [direct, called] = await Promise.all([
            request(
              target,
              a.token,
              table,
              "POST",
              { request_id: c.p_request_id, title: c.p_title },
              {},
              "public",
            ),
            call(a.token, c),
          ]);
          assert.ok(
            direct.status === 201 || direct.status === 409,
            "Direct race must insert or observe unique conflict",
          );
          const result = success(called);
          assert.ok(result.kind === "created" || result.kind === "replayed");
          const one = rows(
            await read(a.token, `&request_id=eq.${c.p_request_id}`),
          );
          assert.equal(one.length, 1);
          const retry = success(await call(a.token, c));
          assert.equal(retry.kind, "replayed");
          assert.equal(retry.case?.id, one[0].id);
        }
      },
    );
    await check(
      "Same request key across owners never joins or discloses results",
      async () => {
        const c = command();
        const [rowA, rowB] = await Promise.all([
          call(a.token, c).then(created),
          call(b.token, c).then(created),
        ]);
        assert.notEqual(rowA.id, rowB.id);
        assert.equal(
          rows(await read(a.token, `&request_id=eq.${c.p_request_id}`))[0]
            .owner_id,
          a.id,
        );
        assert.equal(
          rows(await read(b.token, `&request_id=eq.${c.p_request_id}`))[0]
            .owner_id,
          b.id,
        );
      },
    );

    await check(
      "Concurrent distinct keys for same business title are serialized into create plus warning",
      async () => {
        const title = `Race-warning-${marker}`;
        const results = (
          await Promise.all([
            call(a.token, command(title)),
            call(a.token, command(title)),
          ])
        ).map(success);
        assert.equal(
          results.filter((result) => result.kind === "created").length,
          1,
        );
        assert.equal(
          results.filter((result) => result.kind === "duplicates").length,
          1,
        );
      },
    );

    await check(
      "Deterministic direct INSERT commits between key lookup and duplicate read; identical replay and changed-payload409",
      async () => {
        await deterministicDirectInsertRace(target, a, false);
      },
    );

    await check(
      "Disposable regression sensitivity: unchanged deterministic replay/conflict oracle rejects canonical old duplicate-warning logic",
      async () => {
        await deterministicDirectInsertRace(target, a, true);
      },
    );

    await check(
      "Catalog: one product table, RLS, minimal grants, INVOKER, no PUBLIC EXECUTE or cascade owner delete",
      async () => {
        const sql = db();
        try {
          const relations =
            await sql`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname`;
          assert.deepEqual(
            relations.map((row) => row.relname),
            ["recruitment_case"],
          );
          assert.equal(relations[0].relrowsecurity, true);
          for (const role of ["anon", "authenticated"]) {
            const [p] =
              await sql`select has_table_privilege(${role},'public.recruitment_case','SELECT') can_select,has_table_privilege(${role},'public.recruitment_case','INSERT') table_insert,has_table_privilege(${role},'public.recruitment_case','UPDATE') can_update,has_table_privilege(${role},'public.recruitment_case','DELETE') can_delete,has_table_privilege(${role},'public.recruitment_case','TRUNCATE') can_truncate`;
            assert.equal(p.can_select, role === "authenticated");
            assert.equal(
              p.table_insert,
              false,
              "INSERT is limited to explicit input columns",
            );
            assert.equal(p.can_update, false);
            assert.equal(p.can_delete, false);
            assert.equal(p.can_truncate, false);
            for (const column of [
              "request_id",
              "title",
              "description",
              "source_url",
              "owner_id",
              "status",
              "id",
              "created_at",
            ]) {
              const [grant] =
                await sql`select has_column_privilege(${role},'public.recruitment_case',${column},'INSERT') allowed`;
              assert.equal(
                grant.allowed,
                role === "authenticated" &&
                  ["request_id", "title", "description", "source_url"].includes(
                    column,
                  ),
              );
            }
          }
          const [fn] =
            await sql`select p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_recruitment_case'`;
          assert.equal(fn.prosecdef, false);
          assert.ok(
            fn.proconfig.some((value: string) =>
              /^search_path=(""|)$/.test(value),
            ),
          );
          const fnAcl =
            await sql`select a.grantee,a.privilege_type from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='public' and p.proname='create_recruitment_case' and a.grantee=0`;
          assert.equal(fnAcl.length, 0, "PUBLIC inherits no EXECUTE");
          for (const role of ["anon", "authenticated"]) {
            const [ledger] =
              await sql`select has_schema_privilege(${role},'recruitment_migrations','USAGE') allowed`;
            assert.equal(
              ledger.allowed,
              false,
              "Product migration ledger is private",
            );
            const [execute] =
              await sql`select has_function_privilege(${role},'public.create_recruitment_case(uuid,text,text,text,boolean)','EXECUTE') allowed`;
            assert.equal(execute.allowed, role === "authenticated");
          }
          const fks =
            await sql`select pg_get_constraintdef(c.oid) definition from pg_constraint c where c.conrelid='public.recruitment_case'::regclass and c.contype='f'`;
          assert.ok(
            fks.some(
              (row) =>
                /owner_id/.test(row.definition) &&
                /auth\.users/.test(row.definition),
            ),
          );
          assert.ok(
            fks.every((row) => !/ON DELETE CASCADE/.test(row.definition)),
          );
          const indexes =
            await sql`select indexdef from pg_indexes where schemaname='public' and tablename='recruitment_case'`;
          assert.ok(
            indexes.some(
              (row) =>
                /UNIQUE/.test(row.indexdef) &&
                /owner_id, request_id/.test(row.indexdef),
            ),
          );
          assert.ok(
            indexes.some((row) =>
              /owner_id, created_at DESC(?: NULLS LAST)?, id DESC(?: NULLS LAST)?/.test(
                row.indexdef,
              ),
            ),
          );
          const forbidden =
            await sql`select to_regclass('public.history_entry') history,to_regclass('public.calendar_event') event,to_regclass('public.case_link') link`;
          assert.equal(forbidden[0].history, null);
          assert.equal(forbidden[0].event, null);
          assert.equal(forbidden[0].link, null);
        } finally {
          await sql.end();
        }
      },
    );

    await check(
      "Disposable negative sensitivity: unchanged A/B assertion detects disabled RLS both directions",
      async () => {
        // readRecruitmentTarget has already verified this exact owned isolated project and container identity.
        const assertIsolated = async (token: string, ownerId: string) => {
          assert.ok(
            rows(await read(token)).every((row) => row.owner_id === ownerId),
            "Cross-owner list leak",
          );
        };
        await assertIsolated(a.token, a.id);
        await assertIsolated(b.token, b.id);
        const sql = db();
        try {
          await sql`alter table public.recruitment_case disable row level security`;
          await assert.rejects(
            assertIsolated(a.token, a.id),
            /Cross-owner list leak/,
          );
          await assert.rejects(
            assertIsolated(b.token, b.id),
            /Cross-owner list leak/,
          );
        } finally {
          await sql`alter table public.recruitment_case enable row level security`;
          await sql.end();
        }
        await assertIsolated(a.token, a.id);
        await assertIsolated(b.token, b.id);
      },
    );
  },
);
