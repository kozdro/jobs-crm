-- The validator resolves only pending work; path and metadata never come from IPC.
CREATE FUNCTION public.document_validator_target(p_version_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE result jsonb;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'documents_validator' OR p_version_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Validator required'; END IF;
 SELECT jsonb_build_object('versionId',o.version_id,'objectKey',o.object_key,'filename',c.intent->>'filename','mime',c.intent->>'mime','bytes',o.bytes,'sha256',c.intent->>'sha256') INTO result
 FROM recruitment_private.document_object o JOIN recruitment_private.document_upload_command c ON c.owner_id=o.owner_id AND c.version_id=o.version_id
 JOIN public.document_version v ON v.owner_id=o.owner_id AND v.id=o.version_id
 WHERE o.version_id=p_version_id AND o.phase='pending' AND v.state='pending' AND c.intent IS NOT NULL;
 RETURN result;
END;$fn$;
--> statement-breakpoint
CREATE FUNCTION public.reject_document_upload(p_version_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE item recruitment_private.document_object%ROWTYPE; doc_id uuid;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'documents_validator' OR p_version_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Validator required'; END IF;
 SELECT * INTO item FROM recruitment_private.document_object o WHERE o.version_id=p_version_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Pending object unavailable'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(item.owner_id::text,76211));
 SELECT * INTO item FROM recruitment_private.document_object o WHERE o.version_id=p_version_id FOR UPDATE;
 IF item.phase IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Pending object changed'; END IF;
 SELECT v.document_id INTO doc_id FROM public.document_version v WHERE v.owner_id=item.owner_id AND v.id=p_version_id AND v.state='pending' FOR UPDATE;
 IF doc_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Pending version changed'; END IF;
 UPDATE recruitment_private.document_object SET phase='deleting',updated_at=clock_timestamp() WHERE version_id=p_version_id;
 UPDATE public.document_version SET state='deleting',revision=revision+1 WHERE owner_id=item.owner_id AND id=p_version_id;
 INSERT INTO recruitment_private.document_deletion_ledger(version_id,owner_id,document_id,object_key) VALUES(item.version_id,item.owner_id,doc_id,item.object_key);
 RETURN jsonb_build_object('kind','queued','versionId',p_version_id);
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.document_validator_target(uuid),public.reject_document_upload(uuid) FROM PUBLIC,anon,authenticated,service_role,documents_validator;
GRANT EXECUTE ON FUNCTION public.document_validator_target(uuid),public.reject_document_upload(uuid) TO documents_validator;
