ALTER TABLE "document_application_command" ADD COLUMN "cancelled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE FUNCTION public.reconcile_document_application(p_request_id uuid,p_case_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE prior public.document_application_command%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR p_case_id IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Record unavailable';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO prior FROM public.document_application_command c WHERE c.owner_id=auth.uid() AND c.request_id=p_request_id;
 IF FOUND THEN
  IF prior.case_id IS DISTINCT FROM p_case_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Record unavailable'; END IF;
  IF prior.cancelled THEN RETURN pg_catalog.jsonb_build_object('kind','cancelled'); END IF;
  RETURN pg_catalog.jsonb_build_object('kind','found','event',prior.result->'event','sentVersionIds',prior.version_ids);
 END IF;
 IF EXISTS(SELECT 1 FROM public.recruitment_case_event e WHERE e.owner_id=auth.uid() AND e.request_id=p_request_id) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent already recorded';
 END IF;
 INSERT INTO public.document_application_command(request_id,case_id,occurred_on,version_ids,cancelled)
 VALUES(p_request_id,p_case_id,NULL,ARRAY[]::uuid[],true);
 RETURN pg_catalog.jsonb_build_object('kind','cancelled');
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reconcile_document_application(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
