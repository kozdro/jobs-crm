-- Owner-only recovery may resume pending validation without exposing the object path.
CREATE OR REPLACE FUNCTION public.reconcile_document_upload(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE owner uuid:=auth.uid(); expires timestamptz; cmd recruitment_private.document_upload_command%ROWTYPE; deletion recruitment_private.document_delete_command%ROWTYPE; sent public.document_sent_command%ROWTYPE; change_command public.document_command%ROWTYPE; phase text;
BEGIN
 IF owner IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 expires:=recruitment_private.document_request_expiry(p_request_id);
 IF expires>clock_timestamp()+interval '7 days' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid request id'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,76211));
 SELECT * INTO change_command FROM public.document_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN RETURN jsonb_build_object('kind','found','result',change_command.result); END IF;
 SELECT * INTO sent FROM public.document_sent_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN RETURN jsonb_build_object('kind','found','result',sent.result); END IF;
 SELECT * INTO deletion FROM recruitment_private.document_delete_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN RETURN jsonb_build_object('kind','found','result',jsonb_build_object('kind','saved','versionIds',deletion.version_ids)); END IF;
 SELECT * INTO cmd FROM recruitment_private.document_upload_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN
  SELECT o.phase INTO phase FROM recruitment_private.document_object o WHERE o.owner_id=owner AND o.version_id=cmd.version_id;
  IF phase='ready' THEN RETURN jsonb_build_object('kind','found','result',jsonb_build_object('kind','saved','documentId',cmd.document_id,'versionId',cmd.version_id)); END IF;
  IF phase='pending' THEN RETURN jsonb_build_object('kind','pending','versionId',cmd.version_id); END IF;
  RETURN jsonb_build_object('kind','pending');
 END IF;
 IF expires>clock_timestamp() THEN INSERT INTO recruitment_private.document_upload_fence(owner_id,request_id,expires_at) VALUES(owner,p_request_id,expires) ON CONFLICT(owner_id,request_id) DO NOTHING; END IF;
 RETURN jsonb_build_object('kind','cancelled');
END;$fn$;
