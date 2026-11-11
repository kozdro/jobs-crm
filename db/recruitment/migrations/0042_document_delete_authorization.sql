DO $block$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='documents_delete_authorizer') THEN RAISE EXCEPTION 'Documents delete authorizer already exists'; END IF;
 CREATE ROLE documents_delete_authorizer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
END;$block$;
--> statement-breakpoint
GRANT documents_delete_authorizer TO authenticator;
--> statement-breakpoint
CREATE FUNCTION public.authorize_document_delete(p_owner uuid,p_preview uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE preview recruitment_private.document_delete_preview%ROWTYPE; current_snapshot jsonb; doc_id uuid; target_version uuid; item recruitment_private.document_object%ROWTYPE;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'documents_delete_authorizer' OR p_owner IS NULL OR p_preview IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Delete authorizer required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,76211));
 SELECT * INTO preview FROM recruitment_private.document_delete_preview p WHERE p.token=p_preview AND p.owner_id=p_owner FOR UPDATE;
 IF NOT FOUND OR preview.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Preview unavailable'; END IF;
 doc_id:=(preview.snapshot->>'documentId')::uuid;
 current_snapshot:=recruitment_private.document_delete_snapshot(p_owner,preview.version_ids,doc_id);
 IF current_snapshot IS DISTINCT FROM preview.snapshot THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Preview changed'; END IF;
 FOREACH target_version IN ARRAY preview.version_ids LOOP
  SELECT * INTO item FROM recruitment_private.document_object o WHERE o.owner_id=p_owner AND o.version_id=target_version FOR UPDATE;
  IF NOT FOUND OR item.phase NOT IN ('ready','pending') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Scope changed'; END IF;
  UPDATE recruitment_private.document_object SET phase='deleting',updated_at=clock_timestamp() WHERE owner_id=p_owner AND document_object.version_id=target_version;
  UPDATE public.document_version SET state='deleting',revision=revision+1 WHERE owner_id=p_owner AND id=target_version AND state IN ('ready','pending');
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Version changed'; END IF;
  INSERT INTO recruitment_private.document_deletion_ledger(version_id,owner_id,document_id,object_key)
    SELECT target_version,p_owner,v.document_id,item.object_key FROM public.document_version v WHERE v.owner_id=p_owner AND v.id=target_version;
 END LOOP;
 DELETE FROM recruitment_private.document_delete_preview WHERE token=p_preview AND owner_id=p_owner;
 RETURN jsonb_build_object('kind','queued','versionIds',preview.version_ids);
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.authorize_document_delete(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,documents_delete_authorizer;
-- Deliberately ungranted until the current-Auth BFF, durable receipt and races are verified.
