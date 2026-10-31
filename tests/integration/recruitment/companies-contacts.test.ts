/** DEC-058: real user JWT/Data API proof. All names and addresses are synthetic. */
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
if (!targetId) throw new Error("CC requires a guarded disposable target");
const target = await readRecruitmentTarget(targetId);
type Row = {
  id: string;
  type: string;
  name: string;
  email: string | null;
  revision: number;
  active: boolean;
  role: string | null;
  owner_id: string;
  [key: string]: unknown;
};
type Result = {
  kind: "saved" | "replayed" | "duplicates";
  profile?: Row;
  relation?: Row;
  matches?: Row[];
  matchToken?: string[];
};
type Payload = Record<string, unknown>;
function ok<T>(reply: Reply): T {
  assert.equal(
    reply.status,
    200,
    `Data API expected success, status=${reply.status}`,
  );
  return reply.body as T;
}

test(
  "DEC058 private profiles, explicit relationships, dedup and immutable command audit",
  { timeout: 240_000 },
  async (t) => {
    const [a, b] = await createAccounts(target);
    const api = (
      path: string,
      method = "GET",
      body?: unknown,
      token: string | null = a.token,
      headers: Record<string, string> = {},
    ) =>
      request(
        target,
        token ?? undefined,
        path,
        method,
        body,
        headers,
        "public",
      );
    const rpc = (
      payload: Payload,
      key = randomUUID(),
      token: string | null = a.token,
    ) =>
      api(
        "/rest/v1/rpc/execute_catalog_command",
        "POST",
        { p_request_id: key, p_payload: payload },
        token,
      );
    const create = async (
      type = "contact",
      name = `CC synthetic ${randomUUID()}`,
      email: string | null = null,
      token = a.token,
    ) => {
      const result = ok<Result>(
        await rpc(
          { operation: "create-profile", profileType: type, name, email },
          randomUUID(),
          token,
        ),
      );
      assert.equal(result.kind, "saved");
      assert.ok(result.profile);
      return result.profile;
    };
    const get = async (
      table: string,
      filter = "",
      token: string | null = a.token,
    ) =>
      ok<Row[]>(
        await api(
          `/rest/v1/${table}?select=*&${filter}`,
          "GET",
          undefined,
          token,
        ),
      );
    const profile = async (id: string) =>
      (await get("catalog_profile", `id=eq.${id}`))[0];
    const relation = async (id: string) =>
      (await get("catalog_relation", `id=eq.${id}`))[0];
    const caseCreate = async (token = a.token) =>
      ok<{ case: { id: string } }>(
        await api(
          "/rest/v1/rpc/create_recruitment_case",
          "POST",
          { p_request_id: randomUUID(), p_title: `CC case ${randomUUID()}` },
          token,
        ),
      ).case.id;
    const attach = async (
      type: string,
      left: string,
      right: string,
      role: string | null = null,
    ) => {
      const payload = {
        operation: "attach",
        relationType: type,
        leftId: left,
        rightId: right,
        role,
      };
      const result = ok<Result>(await rpc(payload));
      assert.ok(result.relation);
      return { value: result.relation, payload };
    };
    const detach = async (value: Row) => {
      const payload = {
        operation: "detach",
        relationId: value.id,
        expectedRevision: value.revision,
      };
      const result = ok<Result>(await rpc(payload));
      assert.ok(result.relation);
      return { value: result.relation, payload };
    };

    await t.test(
      "Contact without case and independent organization profiles, names/email trim and Unicode",
      async () => {
        const before = (await get("recruitment_case")).length;
        const p = await create(
          "contact",
          "  Łódź 🚀  ",
          "  qa+tag@example.invalid  ",
        );
        assert.equal(p.name, "Łódź 🚀");
        assert.equal(p.email, "qa+tag@example.invalid");
        const organization = await create("organization");
        assert.equal(organization.type, "organization");
        assert.equal(organization.email, null);
        assert.equal((await get("recruitment_case")).length, before);
        const max = await create("contact", "🚀".repeat(160));
        assert.equal(Array.from(max.name).length, 160);
      },
    );
    await t.test(
      "DB validation cannot be bypassed through direct RPC",
      async () => {
        for (const payload of [
          { profileType: "contact", name: " " },
          { profileType: "contact", name: "x".repeat(161) },
          { profileType: "contact", name: "Valid", email: "bad" },
          {
            profileType: "contact",
            name: "Valid",
            email: `${"a".repeat(250)}@example.invalid`,
          },
          {
            profileType: "organization",
            name: "Valid",
            email: "qa@example.invalid",
          },
          { profileType: "invalid", name: "Valid" },
          { profileType: "contact", name: "Valid", owner_id: b.id },
        ])
          denied(await rpc({ operation: "create-profile", ...payload }));
      },
    );
    await t.test(
      "NFC/whitespace/case duplicates warn, acknowledged explicit distinct profile preserves identity",
      async () => {
        const marker = randomUUID();
        const first = await create("organization", `ŁÓDŹ  ${marker}`);
        const payload = {
          operation: "create-profile",
          profileType: "organization",
          name: `  Ło\u0301dz\u0301 \t ${marker} `,
          email: null,
        };
        const warning = ok<Result>(await rpc(payload));
        assert.equal(warning.kind, "duplicates");
        assert.ok(warning.matches?.some((p) => p.id === first.id));
        const accepted = ok<Result>(
          await rpc({ ...payload, acknowledgedMatches: warning.matchToken }),
        );
        assert.equal(accepted.kind, "saved");
        assert.notEqual(accepted.profile!.id, first.id);
        assert.equal((await profile(first.id)).name, first.name);
      },
    );
    await t.test(
      "Email match is owner scoped; +tag/dots/diacritics are not discarded",
      async () => {
        const email = `cc-${randomUUID()}+tag@example.invalid`;
        const first = await create("contact", `Email A ${randomUUID()}`, email);
        const warn = ok<Result>(
          await rpc({
            operation: "create-profile",
            profileType: "contact",
            name: `Email B ${randomUUID()}`,
            email: email.toUpperCase(),
          }),
        );
        assert.equal(warn.kind, "duplicates");
        assert.ok(warn.matches!.some((p) => p.id === first.id));
        const noTag = await create(
          "contact",
          `Email C ${randomUUID()}`,
          email.replace("+tag", ""),
        );
        assert.notEqual(noTag.id, first.id);
        const foreign = await create(
          "contact",
          `Foreign ${randomUUID()}`,
          `foreign-${randomUUID()}@example.invalid`,
          b.token,
        );
        const own = await create("contact", foreign.name, foreign.email);
        assert.notEqual(own.id, foreign.id);
      },
    );
    await t.test(
      "New duplicate appearing after warning invalidates acknowledgment; concurrent first creates yield one warning",
      async () => {
        const name = `Race ${randomUUID()}`;
        const first = await create("contact", name);
        const payload = {
          operation: "create-profile",
          profileType: "contact",
          name,
          email: null,
        };
        const warning = ok<Result>(await rpc(payload));
        assert.equal(warning.kind, "duplicates");
        const second = ok<Result>(
          await rpc({ ...payload, acknowledgedMatches: warning.matchToken }),
        );
        assert.ok(second.profile);
        const stale = ok<Result>(
          await rpc({ ...payload, acknowledgedMatches: warning.matchToken }),
        );
        assert.equal(stale.kind, "duplicates");
        assert.equal(stale.matches!.length, 2);
        const freshName = `Parallel ${randomUUID()}`;
        const replies = await Promise.all([
          rpc({ ...payload, name: freshName }),
          rpc({ ...payload, name: freshName }),
        ]);
        assert.deepEqual(replies.map((r) => ok<Result>(r).kind).sort(), [
          "duplicates",
          "saved",
        ]);
        assert.ok(first.id);
      },
    );
    await t.test(
      "Same request retries and parallel retries create exactly once; payload mismatch conflicts",
      async () => {
        const key = randomUUID();
        const payload = {
          operation: "create-profile",
          profileType: "contact",
          name: `Intent ${randomUUID()}`,
          email: null,
        };
        const results = (
          await Promise.all([rpc(payload, key), rpc(payload, key)])
        ).map((r) => ok<Result>(r));
        assert.deepEqual(results.map((r) => r.kind).sort(), [
          "replayed",
          "saved",
        ]);
        assert.equal(results[0].profile!.id, results[1].profile!.id);
        denied(await rpc({ ...payload, name: "Changed payload" }, key));
        const audit = await get("catalog_command", `request_id=eq.${key}`);
        assert.equal(audit.length, 1);
        assert.equal(audit[0].owner_id, a.id);
      },
    );
    await t.test(
      "Edit is versioned, excludes self from matches, warns on another profile and audit retains original",
      async () => {
        const first = await create();
        const second = await create();
        const unchanged = ok<Result>(
          await rpc({
            operation: "edit-profile",
            profileType: "contact",
            profileId: first.id,
            name: first.name,
            email: `self-${randomUUID()}@example.invalid`,
            expectedRevision: first.revision,
          }),
        );
        assert.equal(unchanged.kind, "saved");
        const now = await profile(first.id);
        const edit = {
          operation: "edit-profile",
          profileType: "contact",
          profileId: first.id,
          name: second.name,
          email: null,
          expectedRevision: now.revision,
        };
        const warning = ok<Result>(await rpc(edit));
        assert.equal(warning.kind, "duplicates");
        assert.deepEqual(
          warning.matches!.map((x) => x.id),
          [second.id],
        );
        const key = randomUUID();
        const accepted = ok<Result>(
          await rpc({ ...edit, acknowledgedMatches: warning.matchToken }, key),
        );
        assert.equal(accepted.kind, "saved");
        assert.equal(accepted.profile!.id, first.id);
        denied(await rpc({ ...edit, name: "Stale edit" }));
        const audit = await get("catalog_command", `request_id=eq.${key}`);
        assert.equal(audit.length, 1);
        assert.ok(audit[0].before_values);
        assert.ok(audit[0].after_values);
      },
    );
    await t.test(
      "Concurrent edit/edit returns one success and one stale conflict",
      async () => {
        const p = await create();
        const base = {
          operation: "edit-profile",
          profileType: "contact",
          profileId: p.id,
          email: null,
          expectedRevision: p.revision,
        };
        const replies = await Promise.all([
          rpc({ ...base, name: `Edit A ${randomUUID()}` }),
          rpc({ ...base, name: `Edit B ${randomUUID()}` }),
        ]);
        assert.equal(replies.filter((r) => r.status === 200).length, 1);
        assert.equal(replies.filter((r) => r.status >= 400).length, 1);
      },
    );
    await t.test(
      "Explicit M:N profiles: two contacts/case, one contact/two cases, organization role per case",
      async () => {
        const org = await create("organization");
        const c1 = await caseCreate(),
          c2 = await caseCreate();
        const p1 = await create(),
          p2 = await create();
        await attach("case-contact", c1, p1.id);
        await attach("case-contact", c1, p2.id);
        await attach("case-contact", c2, p1.id);
        await attach("case-organization", c1, org.id, "agency");
        await attach("case-organization", c2, org.id, "employer");
        assert.equal(
          (
            await get(
              "catalog_relation",
              `case_id=eq.${c1}&type=eq.case-contact&active=eq.true`,
            )
          ).length,
          2,
        );
        assert.equal(
          (
            await get(
              "catalog_relation",
              `contact_id=eq.${p1.id}&type=eq.case-contact&active=eq.true`,
            )
          ).length,
          2,
        );
        assert.equal(
          (
            await get(
              "catalog_relation",
              `organization_id=eq.${org.id}&type=eq.organization-contact`,
            )
          ).length,
          0,
          "Shared case must not infer organization-contact link",
        );
        const direct = await attach("organization-contact", org.id, p1.id);
        assert.equal(direct.value.type, "organization-contact");
        const anotherOrg = await create("organization");
        await attach("organization-contact", anotherOrg.id, p1.id);
        assert.equal(
          (
            await get(
              "catalog_relation",
              `contact_id=eq.${p1.id}&type=eq.organization-contact&active=eq.true`,
            )
          ).length,
          2,
        );
      },
    );
    await t.test(
      "Agency without known employer and explicit dual role, no fake unknown profile",
      async () => {
        const c = await caseCreate();
        const org = await create("organization");
        const person = await create();
        await attach("case-organization", c, org.id, "agency");
        await attach("case-contact", c, person.id);
        const orgLinks = await get(
          "catalog_relation",
          `case_id=eq.${c}&type=eq.case-organization&active=eq.true`,
        );
        assert.equal(orgLinks.length, 1);
        assert.equal(orgLinks[0].role, "agency");
        await attach("case-organization", c, org.id, "employer");
        assert.equal(
          (
            await get(
              "catalog_relation",
              `case_id=eq.${c}&type=eq.case-organization&active=eq.true`,
            )
          ).length,
          2,
        );
      },
    );
    await t.test(
      "Attach races cannot duplicate active relation; detach/relink stale retry never resurrects",
      async () => {
        const c = await caseCreate();
        const p = await create();
        const payload = {
          operation: "attach",
          relationType: "case-contact",
          leftId: c,
          rightId: p.id,
          role: null,
        };
        const keys = [randomUUID(), randomUUID()];
        const replies = await Promise.all(keys.map((key) => rpc(payload, key)));
        assert.equal(replies.filter((r) => r.status === 200).length, 1);
        const firstKey =
          keys[replies.findIndex((reply) => reply.status === 200)];
        const active = await get(
          "catalog_relation",
          `case_id=eq.${c}&contact_id=eq.${p.id}&active=eq.true`,
        );
        assert.equal(active.length, 1);
        await detach(active[0]);
        const attachResult = await rpc(payload, firstKey);
        assert.equal(ok<Result>(attachResult).kind, "replayed");
        assert.equal(
          (
            await get(
              "catalog_relation",
              `case_id=eq.${c}&contact_id=eq.${p.id}&active=eq.true`,
            )
          ).length,
          0,
        );
        const relink = ok<Result>(await rpc(payload));
        assert.ok(relink.relation);
        const relinkBefore = await relation(relink.relation.id);
        ok<Result>(await rpc(payload, firstKey));
        assert.deepEqual(await relation(relink.relation.id), relinkBefore);
        denied(
          await rpc({
            operation: "detach",
            relationId: active[0].id,
            expectedRevision: active[0].revision,
          }),
        );
      },
    );
    await t.test(
      "Role change is atomic, conflicts if target role exists, concurrent role/detach is guarded",
      async () => {
        const c = await caseCreate();
        const org = await create("organization");
        const employer = (
          await attach("case-organization", c, org.id, "employer")
        ).value;
        const agency = (await attach("case-organization", c, org.id, "agency"))
          .value;
        denied(
          await rpc({
            operation: "change-role",
            relationId: employer.id,
            expectedRevision: employer.revision,
            role: "agency",
          }),
        );
        assert.equal((await relation(employer.id)).role, "employer");
        await detach(agency);
        const command = {
          operation: "change-role",
          relationId: employer.id,
          expectedRevision: employer.revision,
          role: "agency",
        };
        const outcomes = await Promise.all([
          rpc(command),
          rpc({
            operation: "detach",
            relationId: employer.id,
            expectedRevision: employer.revision,
          }),
        ]);
        assert.equal(outcomes.filter((r) => r.status === 200).length, 1);
      },
    );
    await t.test(
      "Cross-owner links fail both ways with rollback and unavailable ID behavior",
      async () => {
        const ownCase = await caseCreate(),
          foreignCase = await caseCreate(b.token);
        const own = await create(),
          foreign = await create("contact", undefined, null, b.token);
        const org = await create("organization");
        for (const [token, left, right] of [
          [a.token, ownCase, foreign.id],
          [a.token, foreignCase, own.id],
          [b.token, ownCase, foreign.id],
          [b.token, foreignCase, own.id],
        ] as const)
          denied(
            await rpc(
              {
                operation: "attach",
                relationType: "case-contact",
                leftId: left,
                rightId: right,
                role: null,
              },
              randomUUID(),
              token,
            ),
          );
        denied(
          await rpc({
            operation: "attach",
            relationType: "organization-contact",
            leftId: org.id,
            rightId: foreign.id,
            role: null,
          }),
        );
        denied(
          await rpc({
            operation: "attach",
            relationType: "case-contact",
            leftId: ownCase,
            rightId: randomUUID(),
            role: null,
          }),
        );
        assert.equal(
          (await get("catalog_relation", `case_id=eq.${ownCase}`)).length,
          0,
        );
      },
    );
    await t.test(
      "A positive reads; B/anon cannot list/direct ID/count/audit/request or obtain duplicate metadata",
      async () => {
        const key = randomUUID();
        const result = ok<Result>(
          await rpc(
            {
              operation: "create-profile",
              profileType: "contact",
              name: `Private ${randomUUID()}`,
              email: null,
            },
            key,
          ),
        );
        const p = result.profile!;
        const c = await caseCreate();
        const r = (await attach("case-contact", c, p.id)).value;
        for (const [table, id] of [
          ["catalog_profile", p.id],
          ["catalog_relation", r.id],
          [
            "catalog_command",
            (await get("catalog_command", `request_id=eq.${key}`))[0].id,
          ],
        ]) {
          assert.equal((await get(table, `id=eq.${id}`)).length, 1);
          const foreign = await api(`/rest/v1/${table}?id=eq.${id}`);
          assert.equal(foreign.status, 200);
          for (const query of [
            `id=eq.${id}`,
            `owner_id=eq.${a.id}`,
            table === "catalog_command"
              ? `request_id=eq.${key}`
              : `id=eq.${id}`,
          ]) {
            const deniedRead = await api(
              `/rest/v1/${table}?select=*&${query}`,
              "GET",
              undefined,
              b.token,
            );
            assert.deepEqual(ok(deniedRead), []);
            assert.equal(deniedRead.range?.split("/")[1], "0");
            denied(
              await api(
                `/rest/v1/${table}?select=*&${query}`,
                "GET",
                undefined,
                null,
              ),
            );
          }
        }
        denied(
          await rpc(
            {
              operation: "edit-profile",
              profileType: "contact",
              profileId: p.id,
              name: "Not allowed",
              email: null,
              expectedRevision: p.revision,
            },
            randomUUID(),
            b.token,
          ),
        );
        denied(
          await rpc(
            {
              operation: "detach",
              relationId: r.id,
              expectedRevision: r.revision,
            },
            randomUUID(),
            b.token,
          ),
        );
        denied(
          await rpc(
            {
              operation: "create-profile",
              profileType: "contact",
              name: "No anon",
              email: null,
            },
            randomUUID(),
            null,
          ),
        );
      },
    );
    await t.test(
      "Direct command input enforces canonical transaction, protected audit fields and mutation grants",
      async () => {
        const key = randomUUID();
        const payload = {
          operation: "create-profile",
          profileType: "contact",
          name: `Direct ${randomUUID()}`,
          email: null,
        };
        const inserted = await api("/rest/v1/catalog_command", "POST", {
          request_id: key,
          payload,
        });
        assert.equal(inserted.status, 201);
        const replay = ok<Result>(await rpc(payload, key));
        assert.equal(replay.kind, "replayed");
        assert.ok(replay.profile);
        for (const [field, value] of Object.entries({
          id: randomUUID(),
          owner_id: b.id,
          result: { kind: "saved" },
          target_id: randomUUID(),
          operation: "attach",
          before_values: { fake: true },
          after_values: { fake: true },
          recorded_at: "2000-01-01T00:00:00Z",
        }))
          denied(
            await api("/rest/v1/catalog_command", "POST", {
              request_id: randomUUID(),
              payload,
              [field]: value,
            }),
          );
        for (const table of [
          "catalog_profile",
          "catalog_relation",
          "catalog_command",
        ]) {
          const row =
            table === "catalog_profile"
              ? replay.profile!
              : table === "catalog_command"
                ? (await get(table, `request_id=eq.${key}`))[0]
                : null;
          if (row) {
            denied(
              await api(`/rest/v1/${table}?id=eq.${row.id}`, "PATCH", {
                owner_id: b.id,
              }),
            );
            denied(await api(`/rest/v1/${table}?id=eq.${row.id}`, "DELETE"));
          }
        }
        denied(
          await api("/rest/v1/catalog_profile", "POST", {
            type: "contact",
            name: "Bypass",
            owner_id: a.id,
          }),
        );
        denied(
          await api("/rest/v1/catalog_relation", "POST", {
            type: "case-contact",
            case_id: await caseCreate(),
            contact_id: replay.profile!.id,
          }),
        );
      },
    );
    await t.test(
      "Rollback after profile mutation leaves no partial row or consumed intent",
      async () => {
        const sql = postgres({
          ...target.db,
          max: 1,
          ssl: false,
          onnotice: () => {},
        });
        const name = `qa_cc_failure_${randomUUID().replaceAll("-", "")}`;
        const payload = {
          operation: "create-profile",
          profileType: "contact",
          name: `Rollback ${randomUUID()}`,
          email: null,
        };
        const key = randomUUID();
        try {
          await sql.unsafe(
            `CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Synthetic CC rollback probe'; END $$`,
          );
          await sql.unsafe(
            `REVOKE ALL ON FUNCTION public.${name}() FROM PUBLIC,anon,authenticated,service_role`,
          );
          await sql.unsafe(
            `CREATE TRIGGER ${name} AFTER INSERT ON public.catalog_profile FOR EACH ROW WHEN (NEW.owner_id='${a.id}'::uuid) EXECUTE FUNCTION public.${name}()`,
          );
          denied(await rpc(payload, key));
          assert.equal(
            (await get("catalog_command", `request_id=eq.${key}`)).length,
            0,
          );
          assert.equal(
            (
              await get(
                "catalog_profile",
                `name=eq.${encodeURIComponent(payload.name)}`,
              )
            ).length,
            0,
          );
        } finally {
          await sql.unsafe(
            `DROP TRIGGER IF EXISTS ${name} ON public.catalog_profile`,
          );
          await sql.unsafe(`DROP FUNCTION IF EXISTS public.${name}()`);
          await sql.end();
        }
        assert.equal(ok<Result>(await rpc(payload, key)).kind, "saved");
      },
    );
    await t.test(
      "Catalog changes on closed case preserve lifecycle/facts/revisions, never fabricate participation",
      async () => {
        const c = await caseCreate();
        ok(
          await api("/rest/v1/rpc/record_recruitment_case_event", "POST", {
            p_request_id: randomUUID(),
            p_case_id: c,
            p_kind: "contact",
            p_direction: "inbound",
            p_occurred_on: null,
          }),
        );
        const preview = ok<{ caseRevision: number }>(
          await api("/rest/v1/rpc/preview_recruitment_case_lifecycle", "POST", {
            p_case_id: c,
            p_operation: "close",
            p_closure_id: null,
            p_outcome: "Inny",
            p_occurred_on: null,
            p_offer_confirmed: false,
          }),
        );
        ok(
          await api("/rest/v1/rpc/confirm_recruitment_case_lifecycle", "POST", {
            p_request_id: randomUUID(),
            p_case_id: c,
            p_operation: "close",
            p_expected_case_revision: preview.caseRevision,
            p_expected_closure_revision: null,
            p_closure_id: null,
            p_outcome: "Inny",
            p_occurred_on: null,
            p_offer_confirmed: false,
          }),
        );
        const snapshot = async () =>
          Promise.all([
            get("recruitment_case", `id=eq.${c}`),
            ...[
              "recruitment_case_event",
              "recruitment_case_event_revision",
              "recruitment_case_lifecycle",
              "recruitment_closure_revision",
            ].map((table) => get(table, `case_id=eq.${c}&order=id`)),
          ]);
        const before = await snapshot();
        const p = await create();
        const org = await create("organization");
        const link = (await attach("case-contact", c, p.id)).value;
        const employer = (
          await attach("case-organization", c, org.id, "employer")
        ).value;
        await rpc({
          operation: "change-role",
          relationId: employer.id,
          expectedRevision: employer.revision,
          role: "agency",
        });
        await detach(link);
        assert.deepEqual(
          await snapshot(),
          before,
          "Metadata changes must leave all existing recruitment history/projections intact",
        );
      },
    );
    await t.test(
      "Malformed relation endpoint types and direct own projection edits are rejected",
      async () => {
        const c = await caseCreate();
        const p = await create();
        const org = await create("organization");
        for (const payload of [
          {
            relationType: "case-contact",
            leftId: c,
            rightId: org.id,
            role: null,
          },
          {
            relationType: "case-organization",
            leftId: c,
            rightId: p.id,
            role: "agency",
          },
          {
            relationType: "organization-contact",
            leftId: p.id,
            rightId: org.id,
            role: null,
          },
          {
            relationType: "case-contact",
            leftId: p.id,
            rightId: p.id,
            role: null,
          },
          {
            relationType: "case-contact",
            leftId: c,
            rightId: p.id,
            role: "agency",
          },
          {
            relationType: "case-organization",
            leftId: c,
            rightId: org.id,
            role: "invented",
          },
        ])
          denied(await rpc({ operation: "attach", ...payload }));
        const link = (await attach("case-organization", c, org.id, "employer"))
          .value;
        denied(
          await api(`/rest/v1/catalog_profile?id=eq.${p.id}`, "PATCH", {
            name: "Direct projection bypass",
          }),
        );
        denied(
          await api(`/rest/v1/catalog_relation?id=eq.${link.id}`, "PATCH", {
            role: "agency",
          }),
        );
        denied(
          await api(`/rest/v1/catalog_relation?id=eq.${link.id}`, "PATCH", {
            active: false,
          }),
        );
        denied(
          await api(`/rest/v1/catalog_relation?id=eq.${link.id}`, "DELETE"),
        );
        assert.equal((await profile(p.id)).name, p.name);
        assert.equal((await relation(link.id)).role, "employer");
      },
    );
    await t.test(
      "Edit acknowledgment refreshes when a matching profile revision changes",
      async () => {
        const one = await create();
        const two = await create();
        const edit = {
          operation: "edit-profile",
          profileType: "contact",
          profileId: one.id,
          name: two.name,
          email: null,
          expectedRevision: one.revision,
        };
        const warning = ok<Result>(await rpc(edit));
        assert.equal(warning.kind, "duplicates");
        ok<Result>(
          await rpc({
            operation: "edit-profile",
            profileType: "contact",
            profileId: two.id,
            name: two.name,
            email: `rev-${randomUUID()}@example.invalid`,
            expectedRevision: two.revision,
          }),
        );
        const renewed = ok<Result>(
          await rpc({ ...edit, acknowledgedMatches: warning.matchToken }),
        );
        assert.equal(renewed.kind, "duplicates");
        assert.notDeepEqual(renewed.matchToken, warning.matchToken);
        assert.equal((await profile(one.id)).name, one.name);
      },
    );
    await t.test(
      "BFF rejects anonymous access and missing/foreign Origin without write",
      async () => {
        const base = `${target.appOrigin}/catalog/commands`;
        const body = JSON.stringify({
          expectedUserId: a.id,
          requestId: randomUUID(),
          operation: "create-profile",
          profileType: "contact",
          name: "Forbidden BFF",
          email: null,
        });
        for (const origin of [
          null,
          "https://example.invalid",
          target.appOrigin,
        ]) {
          const response = await fetch(base, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(origin ? { Origin: origin } : {}),
            },
            body,
            redirect: "error",
            signal: AbortSignal.timeout(15000),
          });
          assert.ok([401, 403].includes(response.status));
          assert.match(response.headers.get("cache-control") ?? "", /no-store/);
        }
        const response = await fetch(`${base}?type=contact`, {
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        assert.equal(response.status, 401);
      },
    );
  },
);
