CREATE TABLE "document_sent_command" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_sent_command_owner_request_unique" UNIQUE("owner_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "document_sent_command" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_sent_command" ADD CONSTRAINT "document_sent_command_event_fk" FOREIGN KEY ("owner_id","case_id","event_id") REFERENCES "public"."recruitment_case_event"("owner_id","case_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
REVOKE ALL ON public.document_sent_command FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.document_sent_command TO authenticated;
GRANT INSERT(request_id,case_id,event_id,payload) ON public.document_sent_command TO authenticated;
GRANT INSERT(reference_id,revision,version_id,withdrawn) ON public.document_sent_revision TO authenticated;
CREATE POLICY document_sent_command_owner_read ON public.document_sent_command FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
CREATE POLICY document_sent_command_owner_insert ON public.document_sent_command FOR INSERT TO authenticated WITH CHECK(owner_id=(SELECT auth.uid()));
CREATE POLICY document_sent_revision_owner_insert ON public.document_sent_revision FOR INSERT TO authenticated WITH CHECK(owner_id=(SELECT auth.uid()));
--> statement-breakpoint
CREATE FUNCTION recruitment_private.document_sent_intent_allowed(p_request_id uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE owner uuid:=auth.uid(); expires timestamptz;
BEGIN
 IF owner IS NULL OR p_request_id IS NULL THEN RETURN false; END IF;
 expires:=recruitment_private.document_request_expiry(p_request_id);
 RETURN expires>clock_timestamp() AND expires<=clock_timestamp()+interval '7 days' AND NOT EXISTS(SELECT 1 FROM recruitment_private.document_upload_fence f WHERE f.owner_id=owner AND f.request_id=p_request_id) AND NOT EXISTS(SELECT 1 FROM recruitment_private.document_upload_command u WHERE u.owner_id=owner AND u.request_id=p_request_id) AND NOT EXISTS(SELECT 1 FROM recruitment_private.document_delete_command d WHERE d.owner_id=owner AND d.request_id=p_request_id);
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION recruitment_private.document_sent_intent_allowed(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION recruitment_private.document_sent_intent_allowed(uuid) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.document_sent_revision_insert_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() OR pg_catalog.pg_trigger_depth()<>2 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Sent command required'; END IF;
 RETURN NEW;
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.document_sent_revision_insert_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER document_sent_revision_insert_guard BEFORE INSERT ON public.document_sent_revision FOR EACH ROW EXECUTE FUNCTION public.document_sent_revision_insert_guard();
--> statement-breakpoint
CREATE FUNCTION public.document_sent_command_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb:=NEW.payload; operation text; expected_event integer; v_reference_id uuid; expected_revision integer; target uuid; ids uuid[]; ref public.document_sent_reference%ROWTYPE; last_revision public.document_sent_revision%ROWTYPE; effective_version uuid; matched integer; added uuid[]:=ARRAY[]::uuid[]; new_id uuid; current_event record;
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() OR NEW.request_id IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 IF EXISTS(SELECT 1 FROM public.document_sent_command c WHERE c.owner_id=auth.uid() AND c.request_id=NEW.request_id) OR NOT recruitment_private.document_sent_intent_allowed(NEW.request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent unavailable'; END IF;
 operation:=p->>'action';
 IF operation IS NULL OR operation NOT IN ('sent-add','sent-correct','sent-withdraw') OR (p->>'caseId')::uuid IS DISTINCT FROM NEW.case_id OR (p->>'eventId')::uuid IS DISTINCT FROM NEW.event_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid command'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT(k=ANY(CASE WHEN operation='sent-add' THEN ARRAY['action','caseId','eventId','eventRevision','versionIds'] WHEN operation='sent-correct' THEN ARRAY['action','caseId','eventId','eventRevision','referenceId','revision','versionId'] ELSE ARRAY['action','caseId','eventId','eventRevision','referenceId','revision'] END))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid command field'; END IF;
 expected_event:=(p->>'eventRevision')::integer;
 PERFORM 1 FROM public.recruitment_case c WHERE c.owner_id=auth.uid() AND c.id=NEW.case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Case unavailable'; END IF;
 SELECT e.* INTO current_event FROM public.recruitment_case_event_current e WHERE e.owner_id=auth.uid() AND e.case_id=NEW.case_id AND e.id=NEW.event_id;
 IF NOT FOUND OR current_event.kind<>'application' OR current_event.voided OR expected_event IS NULL OR current_event.revision<>expected_event THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Application changed'; END IF;
 IF operation='sent-add' THEN
  IF jsonb_typeof(p->'versionIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid versions'; END IF;
  SELECT array_agg(value::uuid ORDER BY ordinality) INTO ids FROM jsonb_array_elements_text(p->'versionIds') WITH ORDINALITY AS x(value,ordinality);
  IF ids IS NULL OR array_position(ids,NULL) IS NOT NULL OR (SELECT count(DISTINCT x) FROM unnest(ids) x)<>cardinality(ids) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid versions'; END IF;
 ELSE
  v_reference_id:=(p->>'referenceId')::uuid; expected_revision:=(p->>'revision')::integer;
  SELECT * INTO ref FROM public.document_sent_reference r WHERE r.owner_id=auth.uid() AND r.case_id=NEW.case_id AND r.event_id=NEW.event_id AND r.id=v_reference_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Reference unavailable'; END IF;
  SELECT * INTO last_revision FROM public.document_sent_revision rr WHERE rr.owner_id=auth.uid() AND rr.reference_id=v_reference_id ORDER BY rr.revision DESC LIMIT 1;
  IF expected_revision IS NULL OR expected_revision<>COALESCE(last_revision.revision,0) OR COALESCE(last_revision.withdrawn,false) THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Reference changed'; END IF;
  effective_version:=COALESCE(last_revision.version_id,ref.version_id);
  IF operation='sent-correct' THEN target:=(p->>'versionId')::uuid; IF target IS NULL OR target=effective_version THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid version'; END IF; ids:=ARRAY[target]; ELSE ids:=ARRAY[]::uuid[]; END IF;
 END IF;
 SELECT count(*) INTO matched FROM public.document_version v JOIN public.document d ON d.owner_id=v.owner_id AND d.id=v.document_id WHERE v.owner_id=auth.uid() AND v.id=ANY(ids) AND v.state='ready' AND d.is_cv AND (d.case_id IS NULL OR d.case_id=NEW.case_id);
 IF matched<>cardinality(ids) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Version unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.document_sent_reference r LEFT JOIN LATERAL (SELECT rr.version_id,rr.withdrawn FROM public.document_sent_revision rr WHERE rr.owner_id=r.owner_id AND rr.reference_id=r.id ORDER BY rr.revision DESC LIMIT 1) latest ON true WHERE r.owner_id=auth.uid() AND r.event_id=NEW.event_id AND (v_reference_id IS NULL OR r.id<>v_reference_id) AND NOT COALESCE(latest.withdrawn,false) AND COALESCE(latest.version_id,r.version_id)=ANY(ids)) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Version already recorded'; END IF;
 IF operation='sent-add' THEN
  FOREACH target IN ARRAY ids LOOP INSERT INTO public.document_sent_reference(case_id,event_id,version_id) VALUES(NEW.case_id,NEW.event_id,target) RETURNING id INTO new_id; added:=array_append(added,new_id); END LOOP;
  NEW.result:=jsonb_build_object('kind','saved','referenceIds',added);
 ELSE
  INSERT INTO public.document_sent_revision(reference_id,revision,version_id,withdrawn) VALUES(v_reference_id,expected_revision+1,CASE WHEN operation='sent-withdraw' THEN NULL ELSE target END,operation='sent-withdraw');
  NEW.result:=jsonb_build_object('kind','saved','referenceId',v_reference_id,'revision',expected_revision+1);
 END IF;
 RETURN NEW;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid command';
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.document_sent_command_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER document_sent_command_guard BEFORE INSERT ON public.document_sent_command FOR EACH ROW EXECUTE FUNCTION public.document_sent_command_guard();
--> statement-breakpoint
CREATE FUNCTION public.execute_document_sent_command(p_request_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE prior public.document_sent_command%ROWTYPE; output jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO prior FROM public.document_sent_command c WHERE c.owner_id=auth.uid() AND c.request_id=p_request_id;
 IF FOUND THEN IF prior.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent payload conflict'; END IF; RETURN prior.result||jsonb_build_object('kind','replayed'); END IF;
 INSERT INTO public.document_sent_command(request_id,case_id,event_id,payload) VALUES(p_request_id,(p_payload->>'caseId')::uuid,(p_payload->>'eventId')::uuid,p_payload) RETURNING result INTO output;
 RETURN output;
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.execute_document_sent_command(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.execute_document_sent_command(uuid,jsonb) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reconcile_document_upload(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE owner uuid:=auth.uid(); expires timestamptz; cmd recruitment_private.document_upload_command%ROWTYPE; deletion recruitment_private.document_delete_command%ROWTYPE; sent public.document_sent_command%ROWTYPE; phase text;
BEGIN
 IF owner IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 expires:=recruitment_private.document_request_expiry(p_request_id);
 IF expires>clock_timestamp()+interval '7 days' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid request id'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,76211));
 SELECT * INTO sent FROM public.document_sent_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN RETURN jsonb_build_object('kind','found','result',sent.result); END IF;
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
CREATE OR REPLACE FUNCTION recruitment_private.document_upload_fence_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE expires timestamptz:=recruitment_private.document_request_expiry(NEW.request_id);
BEGIN
 IF expires<=clock_timestamp() OR expires>clock_timestamp()+interval '7 days' OR EXISTS(SELECT 1 FROM recruitment_private.document_upload_fence f WHERE f.owner_id=NEW.owner_id AND f.request_id=NEW.request_id) OR EXISTS(SELECT 1 FROM recruitment_private.document_delete_command d WHERE d.owner_id=NEW.owner_id AND d.request_id=NEW.request_id) OR EXISTS(SELECT 1 FROM public.document_sent_command s WHERE s.owner_id=NEW.owner_id AND s.request_id=NEW.request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent unavailable'; END IF;
 RETURN NEW;
END;$fn$;
--> statement-breakpoint
CREATE FUNCTION recruitment_private.document_delete_collision_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM public.document_sent_command s WHERE s.owner_id=NEW.owner_id AND s.request_id=NEW.request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent unavailable'; END IF;
 RETURN NEW;
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION recruitment_private.document_delete_collision_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER document_delete_collision_guard BEFORE INSERT ON recruitment_private.document_delete_command FOR EACH ROW EXECUTE FUNCTION recruitment_private.document_delete_collision_guard();
