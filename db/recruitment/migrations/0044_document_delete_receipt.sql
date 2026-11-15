CREATE TABLE "recruitment_private"."document_delete_command" (
	"owner_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"preview_token" uuid NOT NULL,
	"version_ids" uuid[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_delete_command_owner_request_unique" UNIQUE("owner_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "recruitment_private"."document_delete_command" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "document_delete_command_expiry_idx" ON "recruitment_private"."document_delete_command" USING btree ("expires_at");--> statement-breakpoint
REVOKE ALL ON recruitment_private.document_delete_command FROM PUBLIC,anon,authenticated,service_role,documents_delete_authorizer;
--> statement-breakpoint
CREATE FUNCTION public.authorize_document_delete(p_owner uuid,p_request_id uuid,p_preview uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE prior recruitment_private.document_delete_command%ROWTYPE; result jsonb; ids uuid[]; expires timestamptz;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'documents_delete_authorizer' OR p_owner IS NULL OR p_request_id IS NULL OR p_preview IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Delete authorizer required'; END IF;
 expires:=recruitment_private.document_request_expiry(p_request_id);
 IF expires<=clock_timestamp() OR expires>clock_timestamp()+interval '7 days' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent expired'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text,76211));
 SELECT * INTO prior FROM recruitment_private.document_delete_command c WHERE c.owner_id=p_owner AND c.request_id=p_request_id;
 IF FOUND THEN
  IF prior.preview_token IS DISTINCT FROM p_preview THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent conflict'; END IF;
  RETURN jsonb_build_object('kind','replayed','versionIds',prior.version_ids);
 END IF;
 IF EXISTS(SELECT 1 FROM recruitment_private.document_upload_fence f WHERE f.owner_id=p_owner AND f.request_id=p_request_id) OR EXISTS(SELECT 1 FROM recruitment_private.document_upload_command u WHERE u.owner_id=p_owner AND u.request_id=p_request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent unavailable'; END IF;
 result:=public.authorize_document_delete(p_owner,p_preview);
 SELECT array_agg(value::uuid ORDER BY ordinality) INTO ids FROM jsonb_array_elements_text(result->'versionIds') WITH ORDINALITY AS x(value,ordinality);
 IF ids IS NULL OR cardinality(ids)=0 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Deletion scope unavailable'; END IF;
 INSERT INTO recruitment_private.document_delete_command(owner_id,request_id,preview_token,version_ids,expires_at) VALUES(p_owner,p_request_id,p_preview,ids,expires);
 RETURN jsonb_build_object('kind','queued','versionIds',ids);
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.authorize_document_delete(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,documents_delete_authorizer;
-- Execution remains revoked until fresh-Auth, replay, recovery and security tests pass.
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reconcile_document_upload(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE owner uuid:=auth.uid(); expires timestamptz; cmd recruitment_private.document_upload_command%ROWTYPE; deletion recruitment_private.document_delete_command%ROWTYPE; phase text;
BEGIN
 IF owner IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 expires:=recruitment_private.document_request_expiry(p_request_id);
 IF expires>clock_timestamp()+interval '7 days' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid request id'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,76211));
 SELECT * INTO deletion FROM recruitment_private.document_delete_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN RETURN jsonb_build_object('kind','found','result',jsonb_build_object('kind','saved','versionIds',deletion.version_ids)); END IF;
 SELECT * INTO cmd FROM recruitment_private.document_upload_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN
  SELECT o.phase INTO phase FROM recruitment_private.document_object o WHERE o.owner_id=owner AND o.version_id=cmd.version_id;
  IF phase='ready' THEN RETURN jsonb_build_object('kind','found','result',jsonb_build_object('kind','saved','documentId',cmd.document_id,'versionId',cmd.version_id)); END IF;
  RETURN jsonb_build_object('kind','pending');
 END IF;
 IF expires>clock_timestamp() THEN INSERT INTO recruitment_private.document_upload_fence(owner_id,request_id,expires_at) VALUES(owner,p_request_id,expires) ON CONFLICT(owner_id,request_id) DO NOTHING; END IF;
 RETURN jsonb_build_object('kind','cancelled');
END;$fn$;
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
 DELETE FROM recruitment_private.document_delete_command WHERE expires_at<=clock_timestamp();
 DELETE FROM recruitment_private.document_delete_preview WHERE expires_at<=clock_timestamp();
 RETURN deleted_count;
END;$fn$;
