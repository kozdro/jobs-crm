/** DEC-059: actual private read BFF + real JWT/Data API on guarded synthetic target. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { createServerClient } from "@supabase/ssr";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import {
  createAccounts,
  request,
  type Reply,
  type User,
} from "../rls/data-api.ts";

const targetId = process.env.RECRUITMENT_TARGET_ID;
if (!targetId)
  throw new Error("Workspace requires a guarded disposable target");
const target = await readRecruitmentTarget(targetId);
type Row = Record<string, unknown> & {
  id: string;
  status?: string;
  created_at?: string;
};
type Slice = { cases: Row[]; hasMore: boolean; page: number };
type Workspace = { list: Slice | null; columns: Record<string, Slice> };
function ok<T>(reply: Reply): T {
  assert.equal(reply.status, 200, `Data API status=${reply.status}`);
  return reply.body as T;
}
async function cookieFor(user: User) {
  const jar = new Map<string, string>();
  const client = createServerClient(target.apiUrl, target.anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const c of cookies) jar.set(c.name, c.value);
      },
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  assert.equal(error, null, "Synthetic cookie login must succeed");
  assert.equal(data.user?.id, user.id);
  await client.auth.stopAutoRefresh();
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

test(
  "DEC059 complete read-only workspace with direct M:N filtering and owner isolation",
  { timeout: 240_000 },
  async (t) => {
    const [a, b] = await createAccounts(target);
    const cookies = new Map([
      [a.id, await cookieFor(a)],
      [b.id, await cookieFor(b)],
    ]);
    const api = (path: string, method = "GET", body?: unknown, user = a) =>
      request(target, user.token, path, method, body, {}, "public");
    const rpc = async <T>(name: string, body: unknown, user = a) =>
      ok<T>(await api(`/rest/v1/rpc/${name}`, "POST", body, user));
    const create = async (title: string, user = a) =>
      (
        await rpc<{ case: Row }>(
          "create_recruitment_case",
          { p_request_id: randomUUID(), p_title: title },
          user,
        )
      ).case;
    const profile = async (type: string, name: string, user = a) =>
      (
        await rpc<{ profile: Row }>(
          "execute_catalog_command",
          {
            p_request_id: randomUUID(),
            p_payload: {
              operation: "create-profile",
              profileType: type,
              name,
              email: null,
            },
          },
          user,
        )
      ).profile;
    const attach = async (
      type: string,
      leftId: string,
      rightId: string,
      role: string | null = null,
    ) =>
      rpc<{ relation: Row }>("execute_catalog_command", {
        p_request_id: randomUUID(),
        p_payload: {
          operation: "attach",
          relationType: type,
          leftId,
          rightId,
          role,
        },
      });
    const read = async (
      params: Record<string, string | string[]> = {},
      user: User | null = a,
      expected = user?.id,
    ) => {
      const q = new URLSearchParams();
      if (expected) q.set("expectedUserId", expected);
      for (const [k, values] of Object.entries(params))
        for (const value of Array.isArray(values) ? values : [values])
          q.append(k, value);
      return fetch(`${target.appOrigin}/recruitments/workspace-data?${q}`, {
        headers: user ? { Cookie: cookies.get(user.id)! } : {},
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
    };
    const body = async <T>(params: Record<string, string | string[]> = {}) => {
      const r = await read(params);
      assert.equal(r.status, 200, "Workspace read must succeed");
      assert.match(r.headers.get("cache-control") ?? "", /private/);
      assert.match(r.headers.get("cache-control") ?? "", /no-store/);
      return (await r.json()) as T;
    };
    const marker = randomUUID();
    const saved: Row[] = [];
    for (let i = 0; i < 31; i++)
      saved.push(
        await create(`Workspace ${marker} ${String(i).padStart(2, "0")}`),
      );
    const organizations: Row[] = [],
      contacts: Row[] = [];
    for (let i = 0; i < 28; i++) {
      organizations.push(
        await profile("organization", `Workspace organization ${marker} ${i}`),
      );
      contacts.push(
        await profile("contact", `Workspace person ${marker} ${i}`),
      );
    }
    const org = organizations[0],
      person = contacts[0];
    await attach("case-organization", saved[0].id, org.id, "agency");
    await attach(
      "case-organization",
      saved[0].id,
      organizations[1].id,
      "employer",
    );
    await attach("case-contact", saved[0].id, person.id);
    await attach("case-organization", saved[1].id, org.id, "employer");
    await attach("organization-contact", org.id, contacts[1].id);
    const detached = await attach("case-contact", saved[1].id, person.id);
    await rpc("execute_catalog_command", {
      p_request_id: randomUUID(),
      p_payload: {
        operation: "detach",
        relationId: detached.relation.id,
        expectedRevision: detached.relation.revision,
      },
    });
    const contactCase = await create(`Workspace contact ${marker}`);
    await rpc("record_recruitment_case_event", {
      p_request_id: randomUUID(),
      p_case_id: contactCase.id,
      p_kind: "contact",
      p_direction: "inbound",
      p_occurred_on: null,
    });
    const recruiting = await create(`Workspace recruiting ${marker}`);
    await rpc("record_recruitment_case_stage_event", {
      p_request_id: randomUUID(),
      p_case_id: recruiting.id,
      p_kind: "invitation",
      p_stage_name: "Ocena techniczna",
      p_expected_stage_version: 0,
      p_occurred_on: null,
    });
    const closed = await create(`Workspace closed ${marker}`);
    const closure = {
      p_case_id: closed.id,
      p_operation: "close",
      p_closure_id: null,
      p_outcome: "Inny",
      p_occurred_on: null,
      p_offer_confirmed: false,
    };
    const preview = await rpc<Record<string, unknown>>(
      "preview_recruitment_case_lifecycle",
      closure,
    );
    await rpc("confirm_recruitment_case_lifecycle", {
      ...closure,
      p_request_id: randomUUID(),
      p_expected_case_revision: preview.caseRevision,
      p_expected_closure_revision: preview.closureRevision,
    });
    // Relation-filtered result itself crosses the page boundary; both aliases must filter BEFORE range.
    for (const item of saved) {
      await attach(
        "case-organization",
        item.id,
        organizations[2].id,
        "employer",
      );
      await attach("case-contact", item.id, contacts[2].id);
    }
    // Bounded preview is a fragment, with truthful continuation flags at each independent boundary.
    for (let i = 0; i < 7; i++)
      if (i !== 2)
        await attach(
          "case-organization",
          saved[2].id,
          organizations[i].id,
          "agency",
        );
    for (let i = 0; i < contacts.length; i++)
      if (i !== 2) await attach("case-contact", saved[2].id, contacts[i].id);
    for (let i = 0; i < 6; i++)
      await rpc("record_recruitment_case_event", {
        p_request_id: randomUUID(),
        p_case_id: recruiting.id,
        p_kind: "contact",
        p_direction: "outbound",
        p_occurred_on: null,
      });
    const foreign = await create(`Workspace PRIVATE ${marker}`, b);
    const foreignOrg = await profile(
      "organization",
      `Workspace PRIVATE ORG ${marker}`,
      b,
    );
    const foreignPerson = await profile(
      "contact",
      `Workspace PRIVATE PERSON ${marker}`,
      b,
    );

    // Setup only: force a real technical timestamp tie on this account's synthetic fixtures.
    const sql = postgres({ ...target.db, max: 1 });
    try {
      await sql`update public.recruitment_case set created_at = '2020-01-01T00:00:00Z' where owner_id = ${a.id} and id in ${sql(saved.map((r) => r.id))}`;
    } finally {
      await sql.end();
    }
    const all = ok<Row[]>(
      await api(
        "/rest/v1/recruitment_case?select=*&order=created_at.desc,id.desc",
      ),
    );
    assert.equal(all.length, 34);
    const snapshotTables = [
      "recruitment_case",
      "recruitment_case_event",
      "recruitment_case_lifecycle",
      "recruitment_closure_revision",
      "catalog_profile",
      "catalog_relation",
      "catalog_command",
    ];
    const snapshot = () =>
      Promise.all(
        snapshotTables.map(async (table) => ({
          table,
          rows: ok<Row[]>(await api(`/rest/v1/${table}?select=*&order=id.asc`)),
        })),
      );
    const before = await snapshot();

    await t.test(
      "global list pagination includes all >25 cases exactly once with stable date/id tie ordering",
      async () => {
        for (const sort of ["newest", "oldest"]) {
          const found: string[] = [];
          for (let page = 1; page < 10; page++) {
            const r = await body<Workspace>({
              view: "list",
              sort,
              page: String(page),
            });
            assert.ok(r.list);
            found.push(...r.list.cases.map((c) => c.id));
            if (!r.list.hasMore) break;
            assert.ok(page < 9, "Pagination must terminate");
          }
          const expected = all.map((r) => r.id);
          assert.deepEqual(
            found,
            sort === "newest" ? expected : expected.reverse(),
          );
          assert.equal(new Set(found).size, 34);
        }
      },
    );
    await t.test(
      "Kanban per-column pagination retains all saved cases beyond first25 and exact status/stage",
      async () => {
        const found: string[] = [];
        for (let page = 1; page < 10; page++) {
          const r = await body<Workspace>({
            view: "kanban",
            savedPage: String(page),
          });
          const column = r.columns["Zapisane"];
          assert.ok(column);
          assert.ok(column.cases.every((c) => c.status === "Zapisane"));
          found.push(...column.cases.map((c) => c.id));
          if (!column.hasMore) break;
        }
        assert.deepEqual(
          found,
          all.filter((r) => r.status === "Zapisane").map((r) => r.id),
        );
        assert.equal(new Set(found).size, 31);
        const r = await body<Workspace>({ view: "kanban", closedOpen: "1" });
        assert.equal(
          r.columns["Kontakt rozpoczęty"].cases[0].id,
          contactCase.id,
        );
        assert.equal(
          r.columns["W rekrutacji"].cases[0].current_stage,
          "Ocena techniczna",
        );
        assert.equal(r.columns["Zakończone"].cases[0].id, closed.id);
      },
    );
    await t.test(
      "filters before pagination use direct active org+person AND, statuses OR, no M:N duplicates",
      async () => {
        const getIds = async (q: Record<string, string | string[]>) =>
          (await body<Workspace>({ view: "list", ...q })).list!.cases.map(
            (r) => r.id,
          );
        assert.deepEqual(
          await getIds({ organization: org.id }),
          all
            .filter((r) => [saved[0].id, saved[1].id].includes(r.id))
            .map((r) => r.id),
        );
        assert.deepEqual(
          await getIds({ organization: org.id, contact: person.id }),
          [saved[0].id],
        );
        assert.deepEqual(
          await getIds({ contact: contacts[1].id }),
          [saved[2].id],
          "Organization-contact must not add the organization's other cases",
        );
        assert.deepEqual(
          await getIds({ status: ["Kontakt rozpoczęty", "W rekrutacji"] }),
          all
            .filter((r) => [contactCase.id, recruiting.id].includes(r.id))
            .map((r) => r.id),
        );
        assert.deepEqual(
          await getIds({ status: "W rekrutacji", organization: org.id }),
          [],
        );
      },
    );
    await t.test(
      "relation-filtered >25 AND result is complete in list and independently paginated Kanban",
      async () => {
        const expected = all
          .filter((row) => saved.some((item) => item.id === row.id))
          .map((row) => row.id);
        for (const view of ["list", "kanban"]) {
          const found: string[] = [];
          for (let page = 1; page < 10; page++) {
            const r = await body<Workspace>({
              view,
              organization: organizations[2].id,
              contact: contacts[2].id,
              page: String(page),
              savedPage: String(page),
            });
            const slice = view === "list" ? r.list! : r.columns["Zapisane"];
            found.push(...slice.cases.map((row) => row.id));
            if (!slice.hasMore) break;
          }
          assert.deepEqual(found, expected);
          assert.equal(new Set(found).size, 31);
        }
      },
    );
    await t.test(
      "preview truncation has explicit organization/contact/history continuation flags",
      async () => {
        const relations = await body<{
          case: { organizations: Row[] };
          contacts: Row[];
          organizationsHasMore: boolean;
          contactsHasMore: boolean;
        }>({ mode: "preview", id: saved[2].id });
        assert.equal(relations.case.organizations.length, 5);
        assert.equal(relations.organizationsHasMore, true);
        assert.equal(relations.contacts.length, 25);
        assert.equal(relations.contactsHasMore, true);
        const history = await body<{
          history: unknown[];
          hasMoreHistory: boolean;
        }>({ mode: "preview", id: recruiting.id });
        assert.equal(history.history.length, 5);
        assert.equal(history.hasMoreHistory, true);
      },
    );
    await t.test(
      "lookup options are paginated beyond25, exact ID available, foreign IDs reveal no name",
      async () => {
        for (const type of ["organization", "contact"]) {
          const found: string[] = [];
          for (let page = 1; page < 10; page++) {
            const r = await body<{ profiles: Row[]; hasMore: boolean }>({
              mode: "options",
              type,
              page: String(page),
            });
            found.push(...r.profiles.map((p) => p.id));
            if (!r.hasMore) break;
          }
          assert.equal(found.length, 28);
          assert.equal(new Set(found).size, 28);
          const id = type === "organization" ? org.id : person.id;
          const exact = await body<{ profiles: Row[] }>({
            mode: "options",
            type,
            id,
          });
          assert.deepEqual(
            exact.profiles.map((p) => p.id),
            [id],
          );
          const foreignId =
            type === "organization" ? foreignOrg.id : foreignPerson.id;
          const inaccessible = await body<{ profiles: Row[] }>({
            mode: "options",
            type,
            id: foreignId,
          });
          assert.deepEqual(inaccessible.profiles, []);
        }
      },
    );
    await t.test(
      "precise owner preview preserves relations and true history while inaccessible ID is404",
      async () => {
        const result = await body<{
          case: Row;
          contacts: Row[];
          history: unknown[];
        }>({ mode: "preview", id: saved[0].id });
        assert.equal(result.case.id, saved[0].id);
        assert.ok(JSON.stringify(result).includes(person.id));
        assert.ok(JSON.stringify(result).includes(org.id));
        const withHistory = await body<{ history: unknown[] }>({
          mode: "preview",
          id: recruiting.id,
        });
        assert.ok(withHistory.history.length > 0);
        for (const id of [foreign.id, randomUUID()])
          assert.equal((await read({ mode: "preview", id })).status, 404);
      },
    );
    await t.test(
      "A/B/anon, mismatched expectedUserId, forged owner and malformed query cannot leak metadata",
      async () => {
        assert.equal((await read({}, null, a.id)).status, 401);
        assert.equal((await read({}, b, a.id)).status, 403);
        const bRead = await read({ view: "list" }, b);
        assert.equal(bRead.status, 200);
        const text = await bRead.text();
        assert.ok(!text.includes(saved[0].id));
        assert.ok(!text.includes(org.id));
        for (const q of [
          { organization: foreignOrg.id },
          { contact: foreignPerson.id },
        ] as Record<string, string | string[]>[]) {
          const r = await body<Workspace>({ view: "list", ...q });
          assert.deepEqual(r.list!.cases, []);
        }
        for (const params of [
          { page: "0" },
          { sort: "activity" },
          { organization: "invalid" },
          { mode: "preview", id: "invalid" },
        ] as Record<string, string | string[]>[])
          assert.equal((await read(params)).status, 400);
        const direct = ok<Row[]>(
          await api(
            `/rest/v1/recruitment_case?select=id,title&id=eq.${foreign.id}`,
          ),
        );
        assert.deepEqual(direct, []);
        for (const [table, id] of [
          ["catalog_profile", foreignOrg.id],
          ["catalog_profile", foreignPerson.id],
        ])
          assert.deepEqual(
            ok<Row[]>(
              await api(`/rest/v1/${table}?select=id,name&id=eq.${id}`),
            ),
            [],
          );
        const count = await api(
          `/rest/v1/recruitment_case?select=id&owner_id=eq.${b.id}`,
          "HEAD",
        );
        assert.equal(count.range?.split("/")[1], "0");
      },
    );
    await t.test(
      "every presentation read leaves business state, facts, closure, relations and audit byte-equivalent",
      async () => {
        assert.deepEqual(await snapshot(), before);
      },
    );
  },
);
