-- Cleanup is an independent role: it sees only deletion-queued opaque paths.
CREATE FUNCTION public.enqueue_abandoned_documents(p_limit integer DEFAULT 50)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE item record; processed integer:=0;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'documents_cleanup' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Cleanup role required'; END IF;
 FOR item IN SELECT o.* FROM recruitment_private.document_object o WHERE o.phase='pending' AND o.created_at < clock_timestamp()-interval '24 hours' ORDER BY o.created_at LIMIT p_limit LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(item.owner_id::text,76211));
  UPDATE recruitment_private.document_object SET phase='deleting',updated_at=clock_timestamp() WHERE version_id=item.version_id AND phase='pending';
  IF FOUND THEN
   UPDATE public.document_version SET state='deleting' WHERE owner_id=item.owner_id AND id=item.version_id AND state='pending';
   INSERT INTO recruitment_private.document_deletion_ledger(version_id,owner_id,document_id,object_key)
    SELECT item.version_id,item.owner_id,v.document_id,item.object_key FROM public.document_version v WHERE v.owner_id=item.owner_id AND v.id=item.version_id
    ON CONFLICT(version_id) DO NOTHING;
   processed:=processed+1;
  END IF;
 END LOOP;
 RETURN processed;
END;$fn$;
--> statement-breakpoint
CREATE FUNCTION public.list_document_cleanup(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE result jsonb;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'documents_cleanup' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Cleanup role required'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('versionId',q.version_id,'objectKey',q.object_key)),'[]'::jsonb) INTO result
 FROM (SELECT o.version_id,o.object_key FROM recruitment_private.document_object o JOIN recruitment_private.document_deletion_ledger l ON l.version_id=o.version_id AND l.owner_id=o.owner_id WHERE o.phase='deleting' AND l.confirmed_at IS NULL ORDER BY l.requested_at LIMIT p_limit) q;
 RETURN result;
END;$fn$;
--> statement-breakpoint
CREATE FUNCTION public.confirm_document_cleanup(p_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE item recruitment_private.document_object%ROWTYPE; doc_id uuid; has_history boolean;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'documents_cleanup' OR p_version_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Cleanup role required'; END IF;
 SELECT * INTO item FROM recruitment_private.document_object o WHERE o.version_id=p_version_id;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM recruitment_private.document_deletion_ledger l WHERE l.version_id=p_version_id AND l.confirmed_at IS NOT NULL) THEN RETURN jsonb_build_object('kind','confirmed'); END IF;
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Queue item unavailable';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(item.owner_id::text,76211));
 SELECT * INTO item FROM recruitment_private.document_object o WHERE o.version_id=p_version_id FOR UPDATE;
 IF item.phase IS DISTINCT FROM 'deleting' OR NOT EXISTS(SELECT 1 FROM recruitment_private.document_deletion_ledger l WHERE l.version_id=p_version_id AND l.owner_id=item.owner_id AND l.object_key=item.object_key AND l.confirmed_at IS NULL) OR EXISTS(SELECT 1 FROM storage.objects s WHERE s.bucket_id='documents' AND s.name=item.object_key) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Deletion unconfirmed'; END IF;
 SELECT document_id INTO doc_id FROM public.document_version v WHERE v.id=p_version_id AND v.owner_id=item.owner_id FOR UPDATE;
 IF doc_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Version unavailable'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.document_sent_reference r WHERE r.owner_id=item.owner_id AND r.version_id=p_version_id) OR EXISTS(SELECT 1 FROM public.document_sent_revision r WHERE r.owner_id=item.owner_id AND r.version_id=p_version_id) INTO has_history;
 DELETE FROM public.case_document WHERE owner_id=item.owner_id AND version_id=p_version_id;
 DELETE FROM recruitment_private.document_upload_command WHERE owner_id=item.owner_id AND version_id=p_version_id;
 DELETE FROM recruitment_private.document_object WHERE owner_id=item.owner_id AND version_id=p_version_id;
 IF has_history THEN
  UPDATE public.document_version SET state='deleted',label=NULL,filename=NULL,mime=NULL,size=NULL WHERE owner_id=item.owner_id AND id=p_version_id;
 ELSE
  DELETE FROM public.document_version WHERE owner_id=item.owner_id AND id=p_version_id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.document_version v WHERE v.owner_id=item.owner_id AND v.document_id=doc_id AND v.state<>'deleted') THEN
  IF EXISTS(SELECT 1 FROM public.document_version v WHERE v.owner_id=item.owner_id AND v.document_id=doc_id) THEN
   UPDATE public.document SET name=NULL,is_cv=NULL,case_id=NULL WHERE owner_id=item.owner_id AND id=doc_id;
  ELSE
   DELETE FROM public.document WHERE owner_id=item.owner_id AND id=doc_id;
  END IF;
 END IF;
 UPDATE recruitment_private.document_deletion_ledger SET confirmed_at=clock_timestamp() WHERE version_id=p_version_id AND confirmed_at IS NULL;
 RETURN jsonb_build_object('kind','confirmed');
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.enqueue_abandoned_documents(integer),public.list_document_cleanup(integer),public.confirm_document_cleanup(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_abandoned_documents(integer),public.list_document_cleanup(integer),public.confirm_document_cleanup(uuid) TO documents_cleanup;
--> statement-breakpoint
CREATE FUNCTION public.purge_expired_document_ledgers() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE deleted_count integer;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'documents_cleanup' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Cleanup role required'; END IF;
 DELETE FROM recruitment_private.document_deletion_ledger WHERE confirmed_at IS NOT NULL AND confirmed_at < clock_timestamp()-interval '7 days' AND NOT restore_hold;
 GET DIAGNOSTICS deleted_count=ROW_COUNT;
 DELETE FROM recruitment_private.document_upload_fence WHERE expires_at<=clock_timestamp();
 RETURN deleted_count;
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.purge_expired_document_ledgers() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_document_ledgers() TO documents_cleanup;
