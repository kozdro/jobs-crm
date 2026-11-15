/** One-off disposable catalog diagnostic: all revokes roll back. */
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import {
  startRecruitmentTarget,
  migrateRecruitmentTarget,
  stopRecruitmentTarget,
} from "../../../scripts/recruitment/target.ts";

test(
  "diagnose remaining local quarantine privileges",
  { timeout: 300_000, skip: process.env.DOCUMENTS_RESTORE_OWN_TARGET !== "1" },
  async () => {
    const id = `restore-qa-${randomUUID().slice(0, 8)}`;
    let started = false;
    try {
      const target = await startRecruitmentTarget(id);
      started = true;
      await migrateRecruitmentTarget(id);
      const sql = postgres({
        ...target.db,
        max: 1,
        ssl: false,
        onnotice: () => {},
      });
      const rollback = new Error("rollback diagnostic");
      try {
        try {
          await sql.begin(async (tx) => {
            await tx.unsafe(
              "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated",
            );
            await tx.unsafe(
              "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC,anon,authenticated",
            );
            await tx.unsafe(
              "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated",
            );
            await tx.unsafe(
              "REVOKE ALL ON storage.objects FROM PUBLIC,anon,authenticated",
            );
            const rows = await tx.unsafe(
              `SELECT 'table' AS kind,n.nspname AS schema,c.relname AS name,r.rolname AS role FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_catalog.pg_roles r WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND r.rolname IN ('anon','authenticated') AND has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE') UNION ALL SELECT 'storage','storage','objects',r.rolname FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated') AND has_table_privilege(r.oid,'storage.objects','SELECT,INSERT,UPDATE,DELETE') UNION ALL SELECT 'function',n.nspname,p.proname,r.rolname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_catalog.pg_roles r WHERE n.nspname='public' AND r.rolname IN ('anon','authenticated') AND has_function_privilege(r.oid,p.oid,'EXECUTE') ORDER BY 1,2,3,4`,
            );
            // Names of database objects and fixed role labels only; never values or credentials.
            process.stdout.write(`${JSON.stringify(rows)}\n`);
            const storage = await tx.unsafe(
              `SELECT pg_catalog.pg_get_userbyid(c.relowner) AS owner,c.relacl::text AS acl FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relname='objects'`,
            );
            const membership = await tx.unsafe(
              `SELECT member.rolname AS member, parent.rolname AS inherited FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles member ON member.oid=m.member JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid WHERE member.rolname IN ('anon','authenticated') ORDER BY 1,2`,
            );
            const privileges = await tx.unsafe(
              `SELECT r.rolname AS role,has_table_privilege(r.oid,'storage.objects','SELECT') AS sel,has_table_privilege(r.oid,'storage.objects','INSERT') AS ins,has_table_privilege(r.oid,'storage.objects','UPDATE') AS upd,has_table_privilege(r.oid,'storage.objects','DELETE') AS del FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated')`,
            );
            process.stdout.write(
              `${JSON.stringify({ storage, membership, privileges })}\n`,
            );
            throw rollback;
          });
        } catch (error) {
          if (error !== rollback) throw error;
        }
      } finally {
        await sql.end();
      }
    } finally {
      if (started) await stopRecruitmentTarget(id);
    }
  },
);
