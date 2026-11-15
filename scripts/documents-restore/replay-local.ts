import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { readRecruitmentTarget } from "../recruitment/target.ts";
import { isHeldLedger, type HeldLedger } from "./source.ts";

/** Must run on an empty, owned QA target before any restored data is loaded. */
export async function quarantineLocalTarget(targetId: string): Promise<void> {
  if (!/^restore-qa-[a-z0-9-]+$/.test(targetId))
    throw new Error("Invalid local restore target");
  const target = await readRecruitmentTarget(targetId);
  if (
    !target.storage ||
    !["127.0.0.1", "localhost", "[::1]"].includes(
      new URL(target.apiUrl).hostname,
    )
  )
    throw new Error("Restore target is not isolated");
  const sql = postgres({
    ...target.db,
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  try {
    await sql.begin(async (tx) => {
      const marker = await tx.unsafe(
        "SELECT pg_catalog.to_regclass('recruitment_private.document_restore_quarantine_local') IS NOT NULL AS present",
      );
      if (!marker[0]?.present) {
        const occupied = await tx.unsafe(
          "SELECT EXISTS(SELECT 1 FROM public.document) OR EXISTS(SELECT 1 FROM recruitment_private.document_object) OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='documents') AS occupied",
        );
        if (occupied[0]?.occupied !== false)
          throw new Error("Quarantine must precede restored data");
        await tx.unsafe(
          "CREATE TABLE recruitment_private.document_restore_quarantine_local (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), project_id text NOT NULL)",
        );
        await tx.unsafe(
          "ALTER TABLE recruitment_private.document_restore_quarantine_local ENABLE ROW LEVEL SECURITY",
        );
        await tx.unsafe(
          "REVOKE ALL ON recruitment_private.document_restore_quarantine_local FROM PUBLIC,anon,authenticated,service_role",
        );
        await tx.unsafe(
          "INSERT INTO recruitment_private.document_restore_quarantine_local(singleton,project_id) VALUES(true,$1)",
          [target.projectId],
        );
        await tx.unsafe(
          "CREATE TABLE recruitment_private.document_restore_attempt_local (version_id uuid PRIMARY KEY, owner_id uuid NOT NULL, document_id uuid NOT NULL, object_key text NOT NULL)",
        );
        await tx.unsafe(
          "ALTER TABLE recruitment_private.document_restore_attempt_local ENABLE ROW LEVEL SECURITY",
        );
        await tx.unsafe(
          "REVOKE ALL ON recruitment_private.document_restore_attempt_local FROM PUBLIC,anon,authenticated,service_role",
        );
      } else {
        const existing = await tx.unsafe(
          "SELECT project_id FROM recruitment_private.document_restore_quarantine_local WHERE singleton=true",
        );
        if (
          existing.length !== 1 ||
          existing[0].project_id !== target.projectId
        )
          throw new Error("Quarantine identity mismatch");
        const attempts = await tx.unsafe(
          "SELECT pg_catalog.to_regclass('recruitment_private.document_restore_attempt_local') IS NOT NULL AS present",
        );
        if (attempts[0]?.present !== true)
          throw new Error("Restore attempt evidence unavailable");
      }
      await tx.unsafe(
        "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated",
      );
      await tx.unsafe(
        "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated",
      );
      await tx.unsafe(
        "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated",
      );
      await tx.unsafe(
        "REVOKE CREATE ON SCHEMA public, storage FROM PUBLIC, anon, authenticated",
      );
      // Storage grants are owned by supabase_storage_admin; do not assume a
      // REVOKE from a different grantor removed them. Restrictive RLS denies
      // all anon/authenticated operations without changing operator grants.
      await tx.unsafe(
        "DROP POLICY IF EXISTS documents_restore_quarantine_local ON storage.objects",
      );
      await tx.unsafe(
        "CREATE POLICY documents_restore_quarantine_local ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)",
      );
      // Table-level REVOKE does not remove column-specific grants.
      await tx.unsafe(`DO $block$ DECLARE item record; cols text; BEGIN
        FOR item IN SELECT n.nspname,c.relname,c.oid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') LOOP
          SELECT pg_catalog.string_agg(pg_catalog.quote_ident(a.attname),',' ORDER BY a.attnum) INTO cols FROM pg_catalog.pg_attribute a WHERE a.attrelid=item.oid AND a.attnum>0 AND NOT a.attisdropped;
          IF cols IS NOT NULL THEN EXECUTE pg_catalog.format('REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON TABLE %I.%I FROM PUBLIC, anon, authenticated',cols,cols,cols,cols,item.nspname,item.relname); END IF;
        END LOOP;
      END $block$`);
      const escaped = await tx.unsafe(
        `SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) OR EXISTS(SELECT 1 FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_class c WHERE r.rolname IN ('anon','authenticated') AND c.oid='storage.objects'::regclass AND (r.rolsuper OR r.rolbypassrls OR NOT c.relrowsecurity OR pg_catalog.pg_has_role(r.oid,c.relowner,'MEMBER') OR has_schema_privilege(r.oid,'public','CREATE') OR has_schema_privilege(r.oid,'storage','CREATE'))) AS unsafe`,
      );
      if (escaped[0]?.unsafe !== false)
        throw new Error("Target quarantine not established");
    });
  } finally {
    await sql.end();
  }
}

/**
 * Disposable local simulation only. It quarantines Data API privileges and
 * denies Storage RLS before it touches any restored object.
 * It does not implement cutover, release a source hold, or certify a backup.
 */
export async function replayLocalQuarantined(
  targetId: string,
  cleanupJwt: string,
  ledger: HeldLedger,
): Promise<{ publication: "blocked"; confirmed: number }> {
  if (
    !/^restore-qa-[a-z0-9-]+$/.test(targetId) ||
    !cleanupJwt ||
    !isHeldLedger(ledger) ||
    !ledger.sourceProjectId
  )
    throw new Error("Invalid local restore request");
  const target = await readRecruitmentTarget(targetId);
  if (
    !target.storage ||
    target.projectId === ledger.sourceProjectId ||
    !["127.0.0.1", "localhost", "[::1]"].includes(
      new URL(target.apiUrl).hostname,
    )
  )
    throw new Error("Restore target is not isolated");
  await quarantineLocalTarget(targetId);
  const sql = postgres({
    ...target.db,
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  const client = createClient(target.apiUrl, target.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${cleanupJwt}` },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
  try {
    let confirmed = 0;
    for (const item of ledger.entries) {
      // A prior attempt is trusted only if this target's local quarantine
      // recorded it before Storage was touched and all durable cleanup and
      // redaction postconditions still hold. No source hold is released here.
      const prior = await sql.unsafe(
        `SELECT EXISTS(
        SELECT 1 FROM recruitment_private.document_restore_attempt_local a
        JOIN recruitment_private.document_deletion_ledger l ON l.version_id=a.version_id AND l.owner_id=a.owner_id AND l.document_id=a.document_id AND l.object_key=a.object_key
        WHERE a.version_id=$1::uuid AND a.owner_id=$2::uuid AND a.document_id=$3::uuid AND a.object_key=$4 AND l.confirmed_at IS NOT NULL AND l.restore_hold
          AND NOT EXISTS(SELECT 1 FROM recruitment_private.document_object o WHERE o.version_id=a.version_id)
          AND NOT EXISTS(SELECT 1 FROM storage.objects s WHERE s.bucket_id='documents' AND s.name=a.object_key)
          AND NOT EXISTS(SELECT 1 FROM recruitment_private.document_upload_command u WHERE u.version_id=a.version_id)
          AND NOT EXISTS(SELECT 1 FROM public.document_version v WHERE v.id=a.version_id AND (v.owner_id IS DISTINCT FROM a.owner_id OR v.document_id IS DISTINCT FROM a.document_id OR v.state IS DISTINCT FROM 'deleted' OR v.filename IS NOT NULL OR v.label IS NOT NULL OR v.mime IS NOT NULL OR v.size IS NOT NULL))
          AND NOT EXISTS(SELECT 1 FROM public.document_command c WHERE c.owner_id=a.owner_id AND c.document_id=a.document_id AND c.payload IS NOT NULL)
          AND NOT EXISTS(SELECT 1 FROM public.document_metadata_revision m WHERE m.owner_id=a.owner_id AND m.document_id=a.document_id AND (m.version_id=a.version_id OR m.action='rename') AND (m.before_values IS NOT NULL OR m.after_values IS NOT NULL))
          AND NOT EXISTS(SELECT 1 FROM public.document d WHERE d.id=a.document_id AND d.owner_id IS DISTINCT FROM a.owner_id)
          AND NOT EXISTS(SELECT 1 FROM public.document d WHERE d.owner_id=a.owner_id AND d.id=a.document_id AND (d.name IS NOT NULL OR d.is_cv IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM public.document_version other WHERE other.owner_id=a.owner_id AND other.document_id=a.document_id AND other.state<>'deleted'))
      ) AS confirmed`,
        [item.versionId, item.ownerId, item.documentId, item.objectKey],
      );
      if (prior[0]?.confirmed === true) {
        confirmed++;
        continue;
      }
      await sql.begin(async (tx) => {
        const found = await tx.unsafe(
          `SELECT o.version_id FROM recruitment_private.document_object o JOIN public.document_version v ON v.owner_id=o.owner_id AND v.id=o.version_id WHERE o.owner_id=$1::uuid AND o.version_id=$2::uuid AND o.object_key=$3 AND v.document_id=$4::uuid AND o.phase IN ('ready','pending','deleting') AND v.state IN ('ready','pending','deleting') FOR UPDATE OF o,v`,
          [item.ownerId, item.versionId, item.objectKey, item.documentId],
        );
        if (found.length !== 1)
          throw new Error(
            "Restored object does not match authoritative ledger",
          );
        const attempt = await tx.unsafe(
          `INSERT INTO recruitment_private.document_restore_attempt_local(version_id,owner_id,document_id,object_key) VALUES($1::uuid,$2::uuid,$3::uuid,$4) ON CONFLICT(version_id) DO UPDATE SET version_id=excluded.version_id WHERE document_restore_attempt_local.owner_id=excluded.owner_id AND document_restore_attempt_local.document_id=excluded.document_id AND document_restore_attempt_local.object_key=excluded.object_key RETURNING version_id`,
          [item.versionId, item.ownerId, item.documentId, item.objectKey],
        );
        if (attempt.length !== 1)
          throw new Error("Restore attempt identity mismatch");
        const queued = await tx.unsafe(
          `INSERT INTO recruitment_private.document_deletion_ledger(version_id,owner_id,document_id,object_key,confirmed_at,restore_hold) VALUES($1::uuid,$2::uuid,$3::uuid,$4,NULL,true) ON CONFLICT(version_id) DO UPDATE SET confirmed_at=NULL,restore_hold=true WHERE document_deletion_ledger.owner_id=excluded.owner_id AND document_deletion_ledger.document_id=excluded.document_id AND document_deletion_ledger.object_key=excluded.object_key RETURNING version_id`,
          [item.versionId, item.ownerId, item.documentId, item.objectKey],
        );
        if (queued.length !== 1)
          throw new Error("Restored ledger differs from authoritative ledger");
        await tx.unsafe(
          "UPDATE recruitment_private.document_object SET phase='deleting',updated_at=clock_timestamp() WHERE owner_id=$1::uuid AND version_id=$2::uuid",
          [item.ownerId, item.versionId],
        );
        await tx.unsafe(
          "UPDATE public.document_version SET state='deleting' WHERE owner_id=$1::uuid AND id=$2::uuid",
          [item.ownerId, item.versionId],
        );
      });
      const removal = await client.storage
        .from("documents")
        .remove([item.objectKey]);
      if (removal.error || !Array.isArray(removal.data))
        throw new Error("Storage replay unconfirmed");
      const confirmation = await client.rpc("confirm_document_cleanup", {
        p_version_id: item.versionId,
      });
      if (confirmation.error || confirmation.data?.kind !== "confirmed")
        throw new Error("Restore metadata replay unconfirmed");
      confirmed++;
    }
    return { publication: "blocked", confirmed };
  } finally {
    await sql.end();
  }
}
