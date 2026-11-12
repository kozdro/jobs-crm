CREATE FUNCTION public.finalize_document_upload(p_version_id uuid,p_bytes integer,p_mime text,p_sha256 text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE obj recruitment_private.document_object%ROWTYPE;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'documents_validator' OR p_version_id IS NULL OR p_bytes IS NULL OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' OR p_mime IS NULL OR p_mime NOT IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/jpeg','image/png') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Validator required';
 END IF;
 SELECT * INTO obj FROM recruitment_private.document_object o WHERE o.version_id=p_version_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Pending object unavailable'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(obj.owner_id::text,76211));
 SELECT * INTO obj FROM recruitment_private.document_object o WHERE o.version_id=p_version_id FOR UPDATE;
 IF obj.phase IS DISTINCT FROM 'pending' OR obj.bytes IS DISTINCT FROM p_bytes OR NOT EXISTS(SELECT 1 FROM recruitment_private.document_upload_command c WHERE c.owner_id=obj.owner_id AND c.version_id=obj.version_id AND c.intent->>'sha256'=p_sha256 AND c.intent->>'mime'=p_mime) OR NOT EXISTS(SELECT 1 FROM storage.objects s WHERE s.bucket_id='documents' AND s.name=obj.object_key) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Pending object changed';
 END IF;
 UPDATE public.document_version SET state='ready',mime=p_mime,size=p_bytes WHERE id=p_version_id AND owner_id=obj.owner_id AND state='pending';
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Pending version changed'; END IF;
 UPDATE recruitment_private.document_object SET phase='ready',updated_at=clock_timestamp() WHERE version_id=p_version_id;
 RETURN jsonb_build_object('kind','ready','versionId',p_version_id);
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.finalize_document_upload(uuid,integer,text,text) FROM PUBLIC,anon,authenticated,service_role;
-- Remains revoked for the operator until direct API and failure-path tests pass.
