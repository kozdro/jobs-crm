import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { connectTarget } from "../../../scripts/db/f2.ts";
import {
  assertIsolation,
  assertRegistrationClosed,
  createAccounts,
  denied,
  request,
  rest,
  rows,
  seed,
  tables,
  type ApiTarget,
  type Cases,
} from "./data-api.ts";

export async function catalogChecks(
  t: Cases,
  id: string,
  target: ApiTarget,
): Promise<void> {
  await t.test(
    "FQA-13/20/RLS-12 signup remains closed with real A/B login and empty default/explicit public OpenAPI",
    async () => {
      const sql = await connectTarget(id);
      try {
        const relations =
          await sql`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'`;
        const functions =
          await sql`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`;
        assert.equal(
          relations.length,
          0,
          "Public bootstrap must contain no relations",
        );
        assert.equal(
          functions.length,
          0,
          "Public bootstrap must contain no functions",
        );
        for (const role of ["anon", "authenticated"]) {
          const [permission] =
            await sql`select has_schema_privilege(${role}, 'public', 'CREATE') allowed`;
          assert.equal(
            permission.allowed,
            false,
            "Public bootstrap must not allow user DDL",
          );
        }
      } finally {
        await sql.end();
      }
      await assertRegistrationClosed(target);
      const users = await createAccounts(target);
      for (const token of [users[0].token, users[1].token, undefined]) {
        for (const profile of [null, "public"]) {
          const openapi = await request(
            target,
            token,
            "/rest/v1/",
            "GET",
            undefined,
            { Accept: "application/openapi+json" },
            profile,
          );
          assert.equal(
            openapi.status,
            200,
            "Empty public OpenAPI must remain a health-only endpoint",
          );
          const body = openapi.body as { paths?: Record<string, unknown> };
          assert.ok(body.paths && typeof body.paths === "object");
          assert.deepEqual(
            Object.keys(body.paths).filter((path) => path !== "/"),
            [],
            "Default public schema must expose no object or RPC routes",
          );
          for (const table of [...tables, "probe_item_view"])
            denied(
              await request(
                target,
                token,
                rest(table),
                "GET",
                undefined,
                {},
                profile,
              ),
            );
          denied(
            await request(
              target,
              token,
              rest("rpc/probe_set_marker"),
              "POST",
              { p_item_id: randomUUID(), p_marker: "must-not-write" },
              {},
              profile,
            ),
          );
        }
      }
    },
  );
  await t.test(
    "FQA-13/19/20/RLS-12 actual catalog RLS policies grants invokers constraints and roles",
    async () => {
      const sql = await connectTarget(id);
      try {
        const roleConfig =
          await sql`select s.setconfig from pg_db_role_setting s join pg_roles r on r.oid=s.setrole join pg_database d on d.oid=s.setdatabase where r.rolname='authenticator' and d.datname='postgres'`;
        assert.equal(
          roleConfig.length,
          1,
          "Data API exposure must be owned by the Drizzle migration for this database",
        );
        assert.ok(
          roleConfig[0].setconfig.includes(
            "pgrst.db_schemas=public,foundation_poc",
          ),
          "Effective database-specific role setting must expose exactly public and foundation_poc",
        );
        const relations =
          await sql`select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='foundation_poc' and c.relkind='r' order by c.relname`;
        assert.deepEqual(
          relations.map((row) => row.relname),
          [...tables].sort(),
        );
        assert.ok(relations.every((row) => row.relrowsecurity));
        const policies =
          await sql`select tablename,cmd,roles,qual,with_check from pg_policies where schemaname='foundation_poc' order by tablename,cmd`;
        assert.equal(policies.length, 12);
        for (const table of tables) {
          for (const command of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
            const policy = policies.find(
              (row) => row.tablename === table && row.cmd === command,
            );
            assert.ok(policy);
            assert.deepEqual(policy.roles, ["authenticated"]);
            if (command !== "INSERT")
              assert.match(policy.qual, /auth\.uid\(\)/);
            if (command === "INSERT" || command === "UPDATE")
              assert.match(policy.with_check, /auth\.uid\(\)/);
          }
          for (const role of ["anon", "authenticated"]) {
            for (const privilege of [
              "SELECT",
              "INSERT",
              "UPDATE",
              "DELETE",
              "TRUNCATE",
              "REFERENCES",
              "TRIGGER",
            ]) {
              const [permission] =
                await sql`select has_table_privilege(${role}, ${`foundation_poc.${table}`}, ${privilege}) allowed`;
              assert.equal(
                permission.allowed,
                role === "authenticated" &&
                  ["SELECT", "INSERT", "UPDATE", "DELETE"].includes(privilege),
                `${table}/${role}/${privilege}`,
              );
            }
          }
        }
        const roles =
          await sql`select rolname,rolsuper,rolbypassrls from pg_roles where rolname in ('anon','authenticated') order by rolname`;
        assert.equal(roles.length, 2);
        assert.ok(roles.every((row) => !row.rolsuper && !row.rolbypassrls));
        const [view] =
          await sql`select c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='foundation_poc' and c.relname='probe_item_view'`;
        assert.ok(view.reloptions.includes("security_invoker=true"));
        const functions =
          await sql`select p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='foundation_poc'`;
        assert.equal(functions.length, 1);
        assert.equal(functions[0].proname, "probe_set_marker");
        assert.equal(functions[0].prosecdef, false);
        assert.ok(
          functions[0].proconfig.some((value: string) =>
            /^search_path=(""|)$/.test(value),
          ),
        );
        for (const role of ["anon", "authenticated"]) {
          const [permission] =
            await sql`select has_function_privilege(${role}, 'foundation_poc.probe_set_marker(uuid,text)', 'EXECUTE') allowed`;
          assert.equal(permission.allowed, role === "authenticated");
          const [ledger] =
            await sql`select has_schema_privilege(${role},'foundation_migrations','USAGE') allowed`;
          assert.equal(ledger.allowed, false);
        }
        const publicAcl =
          await sql`select privilege_type from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='foundation_poc' and a.grantee=0`;
        assert.equal(
          publicAcl.length,
          0,
          "PUBLIC must not inherit RPC EXECUTE",
        );
        const publicTables =
          await sql`select c.relname,a.privilege_type from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where n.nspname='foundation_poc' and c.relkind in ('r','v') and a.grantee=0`;
        assert.equal(
          publicTables.length,
          0,
          "PUBLIC must not inherit table/view privileges",
        );
        for (const role of ["anon", "authenticated"]) {
          const [usage] =
            await sql`select has_schema_privilege(${role}, 'foundation_poc', 'USAGE') allowed,has_schema_privilege(${role}, 'foundation_poc', 'CREATE') can_create`;
          assert.equal(usage.allowed, role === "authenticated");
          assert.equal(usage.can_create, false);
        }
        const unsafeDefaults =
          await sql`select a.privilege_type from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace cross join lateral aclexplode(d.defaclacl) a left join pg_roles r on r.oid=a.grantee where n.nspname in ('foundation_poc','foundation_migrations') and (a.grantee=0 or r.rolname in ('anon','authenticated','service_role'))`;
        assert.equal(
          unsafeDefaults.length,
          0,
          "PoC-specific default ACL must not grant private object access",
        );
        const fks =
          await sql`select pg_get_constraintdef(c.oid) definition,c.convalidated from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='foundation_poc' and c.contype='f' order by c.conname`;
        assert.equal(fks.length, 2);
        assert.ok(
          fks.every((row) =>
            /FOREIGN KEY \(owner_id, (item_id|label_id)\)/.test(row.definition),
          ),
        );
        assert.ok(fks.every((row) => row.convalidated === true));
        const publications =
          await sql`select * from pg_publication_tables where schemaname='foundation_poc'`;
        assert.equal(
          publications.length,
          0,
          "PoC must not be published to Realtime",
        );
      } finally {
        await sql.end();
      }
    },
  );
  await t.test(
    "FQA-20/RLS-12 non-exposed schemas GraphQL and disabled Realtime surface",
    async () => {
      const [a, b] = await createAccounts(target);
      for (const token of [a.token, b.token, undefined]) {
        for (const schema of [
          "foundation_migrations",
          "auth",
          "storage",
          "graphql_public",
        ])
          denied(
            await request(target, token, rest("probe_item"), "GET", undefined, {
              "Accept-Profile": schema,
            }),
          );
        const graphql = await request(target, token, "/graphql/v1", "POST", {
          query: "query { __schema { types { name } } }",
        });
        // Config deliberately excludes graphql_public and no GraphQL endpoint is enabled.
        assert.ok(
          graphql.status >= 400,
          "Disabled GraphQL must not expose introspection",
        );
        const realtime = await request(
          target,
          token,
          "/realtime/v1/api/tenants",
        );
        assert.ok(
          realtime.status >= 400,
          "Disabled Realtime must not expose tenant API",
        );
      }
      const config = await readFile("supabase/config.toml", "utf8");
      assert.match(config, /\[realtime\]\s*enabled\s*=\s*false/);
      assert.match(config, /schemas\s*=\s*\["public"\]/);
    },
  );
}

export async function sensitivityChecks(
  t: Cases,
  id: string,
  target: ApiTarget,
): Promise<void> {
  const users = await createAccounts(target);
  const fixtures = [await seed(target, users[0]), await seed(target, users[1])];
  await t.test(
    "FQA-13/20/RLS-10 lack of GRANT denies independently; restored GRANT still enforces RLS",
    async () => {
      await assertIsolation(target, users[0], users[1], fixtures[1]);
      const sql = await connectTarget(id);
      try {
        await sql`revoke select on foundation_poc.probe_item from authenticated`;
      } finally {
        await sql.end();
      }
      denied(await request(target, users[0].token, rest("probe_item")));
      const restore = await connectTarget(id);
      try {
        await restore`grant select on foundation_poc.probe_item to authenticated`;
      } finally {
        await restore.end();
      }
      await assertIsolation(target, users[0], users[1], fixtures[1]);
    },
  );
  await t.test(
    "FQA-13/RLS-10 missing policy yields deny-by-default for existing owner rows",
    async () => {
      assert.equal(
        rows(
          await request(
            target,
            users[0].token,
            rest("probe_item", `id=eq.${fixtures[0].probe_item.id}`),
          ),
        ).length,
        1,
      );
      const sql = await connectTarget(id);
      try {
        await sql`drop policy probe_item_select_owner on foundation_poc.probe_item`;
      } finally {
        await sql.end();
      }
      assert.equal(
        rows(await request(target, users[0].token, rest("probe_item"))).length,
        0,
      );
    },
  );
  await t.test(
    "FQA-21/RLS-10 deliberately disabled RLS makes unchanged isolation assertion FAIL both ways",
    async () => {
      const sql = await connectTarget(id);
      try {
        await sql`alter table foundation_poc.probe_item disable row level security`;
      } finally {
        await sql.end();
      }
      await assert.rejects(
        assertIsolation(target, users[0], users[1], fixtures[1]),
        { name: "AssertionError", message: /Cross-owner list leak/ },
        "Sensitivity control must detect A seeing B",
      );
      await assert.rejects(
        assertIsolation(target, users[1], users[0], fixtures[0]),
        { name: "AssertionError", message: /Cross-owner list leak/ },
        "Sensitivity control must detect B seeing A",
      );
      // Never restore/reuse this deliberately vulnerable disposable target: orchestrator removes it.
    },
  );
}
