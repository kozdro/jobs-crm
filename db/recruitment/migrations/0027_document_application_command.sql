CREATE TABLE "document_application_command" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"occurred_on" date,
	"version_ids" uuid[] NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_application_command_request_unique" UNIQUE("owner_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "document_application_command" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_application_command" ADD CONSTRAINT "document_application_command_case_fk" FOREIGN KEY ("owner_id","case_id") REFERENCES "public"."recruitment_case"("owner_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Keep the incomplete command inaccessible until its transaction, receipt,
-- owner checks and concurrency behavior are implemented and verified.
REVOKE ALL ON public.document_application_command FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
-- This command remains inaccessible until its supporting Storage lifecycle and
-- operator boundaries are implemented and independently verified.
CREATE FUNCTION public.document_application_command_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE event_result jsonb; event_id uuid; version_id uuid; matched integer;
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() OR NEW.request_id IS NULL OR NEW.case_id IS NULL OR NEW.version_ids IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 IF EXISTS(SELECT 1 FROM public.document_application_command c WHERE c.owner_id=auth.uid() AND c.request_id=NEW.request_id)
    OR EXISTS(SELECT 1 FROM public.recruitment_case_event e WHERE e.owner_id=auth.uid() AND e.request_id=NEW.request_id) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent already recorded';
 END IF;
 IF pg_catalog.array_position(NEW.version_ids,NULL) IS NOT NULL OR
    (SELECT count(DISTINCT x) FROM pg_catalog.unnest(NEW.version_ids) AS x) <> pg_catalog.cardinality(NEW.version_ids) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid version selection';
 END IF;
 PERFORM 1 FROM public.recruitment_case c WHERE c.owner_id=auth.uid() AND c.id=NEW.case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Case unavailable'; END IF;
 IF NEW.cancelled THEN
  IF NEW.occurred_on IS NOT NULL OR pg_catalog.cardinality(NEW.version_ids) <> 0 THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid fence';
  END IF;
  NEW.result:=pg_catalog.jsonb_build_object('kind','cancelled');
  RETURN NEW;
 END IF;
 SELECT count(*) INTO matched FROM public.document_version v JOIN public.document d ON d.owner_id=v.owner_id AND d.id=v.document_id
 WHERE v.owner_id=auth.uid() AND v.id=ANY(NEW.version_ids) AND v.state='ready' AND d.is_cv AND (d.case_id IS NULL OR d.case_id=NEW.case_id);
 IF matched <> pg_catalog.cardinality(NEW.version_ids) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Version unavailable';
 END IF;
 event_result:=public.record_recruitment_case_event(NEW.request_id,NEW.case_id,'application',NULL,NEW.occurred_on);
 IF event_result->>'kind' <> 'created' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent already recorded'; END IF;
 event_id:=(event_result->'event'->>'id')::uuid;
 FOREACH version_id IN ARRAY NEW.version_ids LOOP
  INSERT INTO public.document_sent_reference(case_id,event_id,version_id) VALUES(NEW.case_id,event_id,version_id);
 END LOOP;
 NEW.result:=event_result || pg_catalog.jsonb_build_object('sentVersionIds',NEW.version_ids);
 RETURN NEW;
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.document_application_command_guard() FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE TRIGGER document_application_command_guard BEFORE INSERT ON public.document_application_command
FOR EACH ROW EXECUTE FUNCTION public.document_application_command_guard();
--> statement-breakpoint
CREATE FUNCTION public.record_application_with_documents(
 p_request_id uuid, p_case_id uuid, p_occurred_on date, p_version_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE prior public.document_application_command%ROWTYPE; command_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR p_case_id IS NULL OR p_version_ids IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO prior FROM public.document_application_command c WHERE c.owner_id=auth.uid() AND c.request_id=p_request_id;
 IF FOUND THEN
  IF prior.cancelled THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent cancelled'; END IF;
  IF prior.case_id IS DISTINCT FROM p_case_id OR prior.occurred_on IS DISTINCT FROM p_occurred_on OR prior.version_ids IS DISTINCT FROM p_version_ids THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent payload conflict';
  END IF;
  RETURN prior.result || pg_catalog.jsonb_build_object('kind','replayed');
 END IF;
 INSERT INTO public.document_application_command(request_id,case_id,occurred_on,version_ids)
 VALUES(p_request_id,p_case_id,p_occurred_on,p_version_ids) RETURNING result INTO command_result;
 RETURN command_result;
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_application_with_documents(uuid,uuid,date,uuid[]) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE FUNCTION public.document_sent_reference_insert_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() OR pg_catalog.pg_trigger_depth() <> 2 THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Application command required';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.recruitment_case_event e WHERE e.owner_id=auth.uid() AND e.case_id=NEW.case_id AND e.id=NEW.event_id AND e.kind='application') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Application unavailable';
 END IF;
 RETURN NEW;
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.document_sent_reference_insert_guard() FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE TRIGGER document_sent_reference_insert_guard BEFORE INSERT ON public.document_sent_reference
FOR EACH ROW EXECUTE FUNCTION public.document_sent_reference_insert_guard();
