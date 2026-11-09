/** DEC-064: disposable Auth/Data API proof for the six Global Search groups. */
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

const targetId = process.env.RECRUITMENT_TARGET_ID;
if (!targetId) throw new Error("Search requires a guarded disposable target");
const target = await readRecruitmentTarget(targetId);

type Row = Record<string, unknown> & { id: string };
type Group = { items: Row[]; hasMore: boolean };
type Groups = Record<
  "cases" | "companies" | "contacts" | "links" | "notes" | "events",
  Group
>;
function ok<T>(reply: Reply): T {
  assert.equal(
    reply.status,
    200,
    `Expected RPC success; status=${reply.status}`,
  );
  return reply.body as T;
}

test(
  "Global Search owner-scoped Data API, complete groups and pagination",
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
      body: unknown,
      token: string | null = a.token,
    ) => api(`/rest/v1/rpc/${name}`, "POST", body, token);
    const search = (
      query: string,
      pages: Record<string, number> = {},
      limit = 20,
      token: string | null = a.token,
    ) =>
      call(
        "global_search",
        { p_query: query, p_pages: pages, p_limit: limit },
        token,
      );
    const marker = `search${randomUUID().replaceAll("-", "")}`;
    const foreignMarker = `foreign${randomUUID().replaceAll("-", "")}`;
    const url = `https://example.invalid/${marker}?source=alpha`;
    const created = ok<{ case: Row }>(
      await call("create_recruitment_case", {
        p_request_id: randomUUID(),
        p_title: `${marker} stanowisko`,
        p_source_url: url,
      }),
    ).case;
    const createProfile = async (
      profileType: "organization" | "contact",
      name: string,
    ) =>
      ok<{ profile: Row }>(
        await call("execute_catalog_command", {
          p_request_id: randomUUID(),
          p_payload: {
            operation: "create-profile",
            profileType,
            name,
            email: null,
          },
        }),
      ).profile;
    const company = await createProfile("organization", `${marker} firma`);
    const contact = await createProfile("contact", `${marker} kontakt`);
    const event = ok<{ event: Row }>(
      await call("execute_recruitment_calendar_command", {
        p_request_id: randomUUID(),
        p_payload: {
          operation: "create",
          values: {
            title: "Rozmowa syntetyczna",
            description: `${marker} opis wydarzenia`,
            caseId: created.id,
            status: "planned",
            schedule: {
              startDate: "2099-05-15",
              startTime: null,
              endDate: null,
              endTime: null,
              allDay: false,
              timeZone: "Europe/Warsaw",
              startOffset: null,
              endOffset: null,
            },
            timeZone: "Europe/Warsaw",
            actual: null,
            participants: [],
          },
        },
      }),
    ).event;

    await t.test(
      "case, standalone company, contact, legacy URL and planned calendar event are independently searchable",
      async () => {
        const result = ok<Groups>(await search(marker));
        for (const name of [
          "cases",
          "companies",
          "contacts",
          "links",
          "notes",
          "events",
        ] as const) {
          assert.ok(result[name], `Missing group ${name}`);
          assert.ok(Array.isArray(result[name].items));
          assert.equal(typeof result[name].hasMore, "boolean");
        }
        assert.ok(result.cases.items.some((row) => row.id === created.id));
        assert.ok(result.companies.items.some((row) => row.id === company.id));
        assert.ok(result.contacts.items.some((row) => row.id === contact.id));
        assert.ok(result.links.items.some((row) => row.case_id === created.id));
        assert.ok(result.events.items.some((row) => row.id === event.id));
        assert.ok(
          ok<Groups>(await search("?source=alpha")).links.items.some(
            (row) => row.case_id === created.id,
          ),
        );
      },
    );

    await t.test(
      "owner A positive control; B and anon cannot infer results or metadata",
      async () => {
        assert.ok(
          JSON.stringify(ok<Groups>(await search(marker))).includes(created.id),
        );
        const foreign = ok<Groups>(await search(marker, {}, 20, b.token));
        for (const group of Object.values(foreign)) {
          assert.deepEqual(group.items, []);
          assert.equal(group.hasMore, false);
        }
        const serialized = JSON.stringify(foreign);
        for (const secret of [
          marker,
          url,
          created.id,
          company.id,
          contact.id,
          event.id,
        ])
          assert.ok(!serialized.includes(secret));
        denied(await search(marker, {}, 20, null));
        const foreignCase = ok<{ case: Row }>(
          await call(
            "create_recruitment_case",
            {
              p_request_id: randomUUID(),
              p_title: foreignMarker,
            },
            b.token,
          ),
        ).case;
        assert.ok(
          JSON.stringify(
            ok<Groups>(await search(foreignMarker, {}, 20, b.token)),
          ).includes(foreignCase.id),
        );
        assert.ok(
          !JSON.stringify(ok<Groups>(await search(foreignMarker))).includes(
            foreignCase.id,
          ),
        );
      },
    );

    await t.test(
      "notes preserve unknown dates, correction/void, idempotency, audit and owner isolation",
      async () => {
        const oldText = `noteold${randomUUID().replaceAll("-", "")}`;
        const newText = `notenew${randomUUID().replaceAll("-", "")}`;
        const command = (
          payload: Record<string, unknown>,
          requestId = randomUUID(),
          token: string | null = a.token,
        ) =>
          call(
            "execute_case_content_command",
            { p_request_id: requestId, p_payload: payload },
            token,
          );
        const createPayload = {
          operation: "create-note",
          caseId: created.id,
          body: oldText,
          dateKind: "ordinary",
          occurredOn: null,
        };
        const key = randomUUID();
        const first = ok<{ kind: string; note: Row & { revision: number } }>(
          await command(createPayload, key),
        );
        const replay = ok<{ kind: string; note: Row }>(
          await command(createPayload, key),
        );
        assert.equal(replay.kind, "replayed");
        assert.equal(replay.note.id, first.note.id);
        denied(await command({ ...createPayload, body: newText }, key));
        assert.ok(
          ok<Groups>(await search(oldText)).notes.items.some(
            (row) => row.id === first.note.id,
          ),
        );
        assert.deepEqual(
          ok<Groups>(await search(oldText, {}, 20, b.token)).notes.items,
          [],
        );
        denied(
          await command(
            {
              operation: "void-note",
              caseId: created.id,
              id: first.note.id,
              expectedRevision: first.note.revision,
            },
            randomUUID(),
            b.token,
          ),
        );
        denied(await command(createPayload, randomUUID(), null));
        for (const table of ["case_note", "case_content_command"]) {
          const foreign = await api(
            `/rest/v1/${table}?select=*&case_id=eq.${created.id}`,
            "GET",
            undefined,
            b.token,
          );
          assert.deepEqual(ok<Row[]>(foreign), []);
          denied(
            await api(
              `/rest/v1/${table}?select=*&case_id=eq.${created.id}`,
              "GET",
              undefined,
              null,
            ),
          );
        }
        denied(
          await api(`/rest/v1/case_note?id=eq.${first.note.id}`, "PATCH", {
            body: "forged",
          }),
        );
        const corrected = ok<{
          note: Row & {
            revision: number;
            date_kind: string;
            occurred_on: string | null;
          };
        }>(
          await command({
            operation: "correct-note",
            caseId: created.id,
            id: first.note.id,
            expectedRevision: first.note.revision,
            body: newText,
            dateKind: "historical",
            occurredOn: null,
          }),
        );
        assert.equal(corrected.note.date_kind, "historical");
        assert.equal(corrected.note.occurred_on, null);
        assert.deepEqual(ok<Groups>(await search(oldText)).notes.items, []);
        assert.ok(
          ok<Groups>(await search(newText)).notes.items.some(
            (row) => row.id === first.note.id,
          ),
        );
        denied(
          await command({
            operation: "void-note",
            caseId: created.id,
            id: first.note.id,
            expectedRevision: first.note.revision,
          }),
        );
        ok(
          await command({
            operation: "void-note",
            caseId: created.id,
            id: first.note.id,
            expectedRevision: corrected.note.revision,
          }),
        );
        assert.deepEqual(ok<Groups>(await search(newText)).notes.items, []);
        const audit = ok<Row[]>(
          await api(
            `/rest/v1/case_content_command?select=*&target_id=eq.${first.note.id}`,
          ),
        );
        assert.equal(audit.length, 3);
      },
    );

    await t.test(
      "legacy direct INSERT stays visible, correction replaces its source and void cannot resurrect it",
      async () => {
        const oldMarker = `legacyold${randomUUID().replaceAll("-", "")}`;
        const newMarker = `legacynew${randomUUID().replaceAll("-", "")}`;
        const direct = await api("/rest/v1/recruitment_case", "POST", {
          request_id: randomUUID(),
          title: `Legacy ${randomUUID()}`,
          source_url: `https://example.invalid/${oldMarker}`,
        });
        assert.equal(direct.status, 201);
        const caseId = (direct.body as Row[])[0].id;
        const initial = ok<Groups>(await search(oldMarker)).links.items.filter(
          (row) => row.case_id === caseId,
        );
        assert.equal(initial.length, 1);
        assert.equal(initial[0].source, "legacy");
        const command = (
          payload: Record<string, unknown>,
          requestId = randomUUID(),
          token: string | null = a.token,
        ) =>
          call(
            "execute_case_content_command",
            { p_request_id: requestId, p_payload: payload },
            token,
          );
        const edited = ok<{ link: Row & { revision: number } }>(
          await command({
            operation: "correct-link",
            caseId,
            id: caseId,
            source: "legacy",
            expectedRevision: 0,
            url: `https://example.invalid/${newMarker}`,
            role: "other",
            position: 0,
          }),
        );
        assert.deepEqual(
          ok<Groups>(await search(oldMarker)).links.items.filter(
            (row) => row.case_id === caseId,
          ),
          [],
        );
        assert.equal(
          ok<Groups>(await search(newMarker)).links.items.filter(
            (row) => row.case_id === caseId,
          ).length,
          1,
        );
        denied(
          await command(
            {
              operation: "void-link",
              caseId,
              id: caseId,
              source: "legacy",
              expectedRevision: edited.link.revision,
            },
            randomUUID(),
            b.token,
          ),
        );
        ok(
          await command({
            operation: "void-link",
            caseId,
            id: caseId,
            source: "legacy",
            expectedRevision: edited.link.revision,
          }),
        );
        assert.deepEqual(
          ok<Groups>(await search(oldMarker)).links.items.filter(
            (row) => row.case_id === caseId,
          ),
          [],
        );
        assert.deepEqual(
          ok<Groups>(await search(newMarker)).links.items.filter(
            (row) => row.case_id === caseId,
          ),
          [],
        );
      },
    );

    await t.test(
      "reorder swaps a legacy and additional link in both directions with revisions and audit",
      async () => {
        const originalUrl = `https://example.invalid/legacy-${randomUUID()}`;
        const otherUrl = `https://example.invalid/other-${randomUUID()}`;
        const direct = await api("/rest/v1/recruitment_case", "POST", {
          request_id: randomUUID(),
          title: `Reorder ${randomUUID()}`,
          source_url: originalUrl,
        });
        assert.equal(direct.status, 201);
        const caseId = (direct.body as Row[])[0].id;
        const command = (payload: Record<string, unknown>) =>
          call("execute_case_content_command", {
            p_request_id: randomUUID(),
            p_payload: payload,
          });
        const link = ok<{ link: Row & { revision: number } }>(
          await command({
            operation: "add-link",
            caseId,
            url: otherUrl,
            role: "other",
          }),
        ).link;
        const moved = ok<{ link: Row & { revision: number } }>(
          await command({
            operation: "correct-link",
            caseId,
            id: link.id,
            source: "additional",
            expectedRevision: link.revision,
            url: otherUrl,
            role: "other",
            position: 0,
          }),
        ).link;
        const read = async () =>
          ok<(Row & { position: number; revision: number; source: string })[]>(
            await api(
              `/rest/v1/case_link_current?select=*&case_id=eq.${caseId}&order=position.asc`,
            ),
          );
        const forward = await read();
        assert.deepEqual(
          forward.map((entry) => entry.source),
          ["additional", "legacy"],
        );
        assert.deepEqual(
          forward.map((entry) => entry.position),
          [0, 1],
        );
        assert.equal(forward[0].revision, moved.revision);
        assert.equal(forward[1].revision, 1);
        ok(
          await command({
            operation: "correct-link",
            caseId,
            id: caseId,
            source: "legacy",
            expectedRevision: forward[1].revision,
            url: originalUrl,
            role: "unspecified",
            position: 0,
          }),
        );
        const back = await read();
        assert.deepEqual(
          back.map((entry) => entry.source),
          ["legacy", "additional"],
        );
        assert.deepEqual(
          back.map((entry) => entry.position),
          [0, 1],
        );
        assert.equal(back[0].revision, 2);
        assert.equal(back[1].revision, 2);
        const audit = ok<Row[]>(
          await api(
            `/rest/v1/case_content_command?select=*&case_id=eq.${caseId}`,
          ),
        );
        const moves = audit.filter((entry) =>
          Boolean((entry.after_values as Record<string, unknown>)?.reordered),
        );
        assert.equal(moves.length, 2);
        assert.deepEqual(
          ok<Row[]>(
            await api(
              `/rest/v1/case_link_current?select=*&case_id=eq.${caseId}`,
              "GET",
              undefined,
              b.token,
            ),
          ),
          [],
        );
      },
    );

    await t.test(
      "Quick Capture matches additional active links and stale link revision invalidates duplicate acknowledgement",
      async () => {
        const caseTitle = `QA QC ${randomUUID()}`;
        const extraUrl = `https://example.invalid/extra-${randomUUID()}`;
        const existing = ok<{ case: Row }>(
          await call("create_recruitment_case", {
            p_request_id: randomUUID(),
            p_title: caseTitle,
          }),
        ).case;
        const content = (payload: Record<string, unknown>) =>
          call("execute_case_content_command", {
            p_request_id: randomUUID(),
            p_payload: payload,
          });
        const link = ok<{ link: Row & { revision: number } }>(
          await content({
            operation: "add-link",
            caseId: existing.id,
            url: extraUrl,
            role: "other",
          }),
        ).link;
        const intent = {
          title: caseTitle,
          description: null,
          sourceUrl: extraUrl,
          action: { kind: "save_only" },
        };
        const requestId = randomUUID();
        type Warning = {
          kind: string;
          matches: Row[];
          intentFingerprint: string;
          matchSetFingerprint: string;
        };
        const warning = ok<Warning>(
          await call("create_recruitment_case_atomic", {
            p_request_id: requestId,
            p_intent: intent,
          }),
        );
        assert.equal(warning.kind, "duplicates");
        assert.ok(warning.matches.some((row) => row.id === existing.id));
        ok(
          await content({
            operation: "correct-link",
            caseId: existing.id,
            id: link.id,
            source: "additional",
            expectedRevision: link.revision,
            url: extraUrl,
            role: "profile",
            position: 0,
          }),
        );
        const refreshed = ok<Warning>(
          await call("create_recruitment_case_atomic", {
            p_request_id: requestId,
            p_intent: intent,
            p_duplicate_acknowledgement: {
              intentFingerprint: warning.intentFingerprint,
              matchSetFingerprint: warning.matchSetFingerprint,
              createSeparateCase: true,
            },
          }),
        );
        assert.equal(refreshed.kind, "duplicates");
        assert.notEqual(
          refreshed.matchSetFingerprint,
          warning.matchSetFingerprint,
        );
        assert.ok(refreshed.matches.some((row) => row.id === existing.id));
      },
    );

    await t.test(
      "Polish NFC, diacritics, prefixes, multiple words and literal special characters follow 1A",
      async () => {
        const marker = `accent${randomUUID().replaceAll("-", "")}`;
        const title = `Łódź inżynier ${marker}`;
        const original = ok<{ case: Row }>(
          await call("create_recruitment_case", {
            p_request_id: randomUUID(),
            p_title: title,
            p_source_url: `https://example.invalid/${marker}?path=literal%25_value`,
          }),
        ).case;
        for (const query of [
          `lodz inzyn ${marker}`,
          `ŁO\u0301DZ\u0301 INŻYNIER ${marker}`,
          `lod inz ${marker}`,
        ]) {
          assert.ok(
            ok<Groups>(await search(query)).cases.items.some(
              (row) => row.id === original.id,
            ),
            `Failed matching ${query === marker ? "marker" : "Polish normalized text"}`,
          );
        }
        assert.ok(
          ok<Groups>(
            await search(`${marker}?path=literal%25_value`),
          ).links.items.some((row) => row.case_id === original.id),
        );
        assert.deepEqual(
          ok<Groups>(await search(`absent${marker}%_`)).links.items,
          [],
        );
        denied(await search(""));
        denied(await search("a".repeat(201)));
      },
    );

    await t.test(
      "literal name fragments are found and FTS/literal overlap does not duplicate a result",
      async () => {
        const part = `infix${randomUUID().replaceAll("-", "")}`;
        const subject = ok<{ case: Row }>(
          await call("create_recruitment_case", {
            p_request_id: randomUUID(),
            p_title: `Przed${part}Po`,
          }),
        ).case;
        const companyWithFragment = await createProfile(
          "organization",
          `FirmaPrzed${part}Po`,
        );
        const result = ok<Groups>(await search(part));
        assert.equal(
          result.cases.items.filter((row) => row.id === subject.id).length,
          1,
        );
        assert.equal(
          result.companies.items.filter(
            (row) => row.id === companyWithFragment.id,
          ).length,
          1,
        );
        const whole = ok<Groups>(await search(`Przed${part}Po`));
        assert.equal(
          whole.cases.items.filter((row) => row.id === subject.id).length,
          1,
        );
      },
    );

    await t.test(
      "direct RPC validates nulls, malformed page types and large page offsets",
      async () => {
        const invoke = (pages: unknown, limit: unknown) =>
          call("global_search", {
            p_query: marker,
            p_pages: pages,
            p_limit: limit,
          });
        for (const [pages, limit] of [
          [null, 20],
          [{}, null],
          [{ cases: 0 }, 20],
          [{ cases: -1 }, 20],
          [{ cases: "1" }, 20],
          [{ cases: 1.5 }, 20],
          [{ invalid: 1 }, 20],
          [[], 20],
          [{}, 21],
        ])
          denied(await invoke(pages, limit));
        const far = ok<Groups>(await invoke({ cases: 1000000000000000 }, 20));
        assert.deepEqual(far.cases.items, []);
        assert.equal(far.cases.hasMore, false);
      },
    );

    await t.test(
      "all later results remain reachable, without duplicate rows on stable data",
      async () => {
        const pageMarker = `pages${randomUUID().replaceAll("-", "")}`;
        const ids: string[] = [];
        for (let n = 0; n < 23; n++) {
          const response = await api("/rest/v1/recruitment_case", "POST", {
            request_id: randomUUID(),
            title: `${pageMarker} ${n}`,
          });
          assert.equal(response.status, 201);
          ids.push((response.body as Row[])[0].id);
        }
        const first = ok<Groups>(await search(pageMarker, { cases: 1 }));
        const second = ok<Groups>(await search(pageMarker, { cases: 2 }));
        assert.equal(first.cases.items.length, 20);
        assert.equal(first.cases.hasMore, true);
        assert.equal(second.cases.items.length, 3);
        assert.equal(second.cases.hasMore, false);
        const found = [...first.cases.items, ...second.cases.items].map(
          (row) => row.id,
        );
        assert.equal(new Set(found).size, 23);
        assert.deepEqual(new Set(found), new Set(ids));
      },
    );

    await t.test(
      "synthetic FTS performance evidence: actual RPC and the case read-model predicate",
      async () => {
        const database = postgres({
          ...target.db,
          max: 1,
          ssl: false,
          onnotice: () => {},
        });
        const term = `bench${randomUUID().replaceAll("-", "")}`;
        try {
          await database`
            INSERT INTO public.recruitment_case (owner_id,request_id,title,description)
            SELECT ${a.id}::uuid,gen_random_uuid(),
              CASE WHEN n % 100 = 0 THEN ${term} || ' specialist' ELSE 'synthetic role ' || n::text END,
              'synthetic performance fixture'
            FROM generate_series(1,10000) n
          `;
          await database`ANALYZE public.recruitment_case`;
          const explain = () =>
            database.begin(async (transaction) => {
              const tx = transaction as unknown as typeof database;
              await tx`SELECT set_config('request.jwt.claim.sub',${a.id},true)`;
              await tx`SET LOCAL ROLE authenticated`;
              const actualRpc = await tx`
              EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
              SELECT public.global_search(${term},'{}'::jsonb,20)
            `;
              // Same owner-scoped predicate, score and ordering as the case branch
              // in global_search. The outer PL/pgSQL EXPLAIN does not expose nested plans.
              const caseBranch = await tx`
              EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
              WITH source AS NOT MATERIALIZED (
                SELECT c.id,c.title,coalesce(c.description,'') AS snippet,c.created_at,
                  public.search_normalize(coalesce(c.title,'')||' '||coalesce(c.description,'')) AS body
                FROM public.recruitment_case c WHERE c.owner_id=auth.uid()
              ), candidates AS (
                SELECT * FROM source WHERE to_tsvector('pg_catalog.simple'::regconfig,body) @@ to_tsquery('pg_catalog.simple'::regconfig,${term}||':*')
                UNION
                SELECT * FROM source WHERE strpos(public.search_normalize(title),${term})>0
              ), matched AS (
                SELECT *,CASE WHEN public.search_normalize(title)=${term} OR public.search_normalize(snippet)=${term} THEN 0
                  WHEN strpos(body,${term})>0 THEN 1 ELSE 2 END AS grade,
                  ts_rank(to_tsvector('pg_catalog.simple'::regconfig,body),to_tsquery('pg_catalog.simple'::regconfig,${term}||':*')) AS rank
                FROM candidates
              ) SELECT * FROM matched ORDER BY grade,rank DESC,created_at DESC,id ASC OFFSET 0 LIMIT 21
            `;
              return {
                actualRpc: actualRpc[0]["QUERY PLAN"],
                caseBranch: caseBranch[0]["QUERY PLAN"],
              };
            });
          const beforeVacuum = await explain();
          await database`VACUUM (ANALYZE) public.recruitment_case`;
          const afterVacuum = await explain();
          const definitions =
            await database`SELECT pg_get_indexdef('public.recruitment_case_search_gin'::regclass) AS definition`;
          assert.ok(beforeVacuum.actualRpc);
          assert.ok(beforeVacuum.caseBranch);
          assert.ok(afterVacuum.actualRpc);
          assert.ok(afterVacuum.caseBranch);
          console.log(
            `FTS_PERF_SYNTHETIC rows=10000 owner=A matchEvery=100 ${JSON.stringify({ beforeVacuum, afterVacuum, indexDefinition: definitions[0].definition })}`,
          );
        } finally {
          await database.end();
        }
      },
    );
  },
);
