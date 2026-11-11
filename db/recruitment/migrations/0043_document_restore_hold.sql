-- Source-side hold lives in the authoritative database, not in the backup
-- being restored. Publication/cutover remains disabled until an independently
-- authenticated replay receipt and isolation gate are available.
DO $block$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='documents_restore_source') THEN
  RAISE EXCEPTION 'Documents restore source role already exists';
 END IF;
 CREATE ROLE documents_restore_source NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
END;$block$;
--> statement-breakpoint
GRANT documents_restore_source TO authenticator;
--> statement-breakpoint
CREATE TABLE recruitment_private.document_restore_hold (
 id uuid PRIMARY KEY,
 oldest_snapshot_at timestamptz NOT NULL,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE recruitment_private.document_restore_hold ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON recruitment_private.document_restore_hold FROM PUBLIC,anon,authenticated,service_role,documents_restore_source,documents_cleanup;
--> statement-breakpoint
CREATE FUNCTION public.begin_document_restore_hold(p_id uuid,p_oldest_snapshot_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE previous recruitment_private.document_restore_hold%ROWTYPE;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'documents_restore_source' OR p_id IS NULL OR p_oldest_snapshot_at IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Restore source role required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(762110043);
 SELECT * INTO previous FROM recruitment_private.document_restore_hold WHERE id=p_id;
 IF FOUND THEN
  IF previous.oldest_snapshot_at IS DISTINCT FROM p_oldest_snapshot_at THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Restore scope changed'; END IF;
  RETURN jsonb_build_object('kind','held','id',previous.id);
 END IF;
 IF p_oldest_snapshot_at > clock_timestamp() OR p_oldest_snapshot_at < clock_timestamp()-interval '7 days' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Snapshot outside retained window'; END IF;
 INSERT INTO recruitment_private.document_restore_hold(id,oldest_snapshot_at) VALUES(p_id,p_oldest_snapshot_at);
 RETURN jsonb_build_object('kind','held','id',p_id);
END;$fn$;
--> statement-breakpoint
CREATE FUNCTION public.list_document_restore_ledger(p_id uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE result jsonb;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'documents_restore_source' OR p_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Restore source role required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM recruitment_private.document_restore_hold WHERE id=p_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Restore hold unavailable'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('versionId',q.version_id,'ownerId',q.owner_id,'documentId',q.document_id,'objectKey',q.object_key) ORDER BY q.version_id),'[]'::jsonb) INTO result
 FROM (SELECT l.version_id,l.owner_id,l.document_id,l.object_key FROM recruitment_private.document_deletion_ledger l WHERE p_after IS NULL OR l.version_id>p_after ORDER BY l.version_id LIMIT p_limit) q;
 RETURN result;
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.begin_document_restore_hold(uuid,timestamptz),public.list_document_restore_ledger(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role,documents_restore_source;
GRANT EXECUTE ON FUNCTION public.begin_document_restore_hold(uuid,timestamptz),public.list_document_restore_ledger(uuid,uuid,integer) TO documents_restore_source;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.purge_expired_document_ledgers() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE deleted_count integer:=0;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'documents_cleanup' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Cleanup role required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(762110043);
 IF NOT EXISTS(SELECT 1 FROM recruitment_private.document_restore_hold) THEN
  DELETE FROM recruitment_private.document_deletion_ledger WHERE confirmed_at IS NOT NULL AND confirmed_at < clock_timestamp()-interval '7 days' AND NOT restore_hold;
  GET DIAGNOSTICS deleted_count=ROW_COUNT;
 END IF;
 DELETE FROM recruitment_private.document_upload_fence WHERE expires_at<=clock_timestamp();
 RETURN deleted_count;
END;$fn$;
--> statement-breakpoint
-- No hold-release or publication privilege is granted here. A valid transfer,
-- full replay and an independent cutover gate must precede any future release.
