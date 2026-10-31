CREATE TABLE "recruitment_case_lifecycle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"outcome" text,
	"occurred_on" date,
	"offer_confirmed" boolean NOT NULL,
	"expected_case_revision" integer NOT NULL,
	"cycle" integer NOT NULL,
	"previous_status" text NOT NULL,
	"previous_stage" text,
	"resulting_status" text NOT NULL,
	"resulting_stage" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_lifecycle_owner_request_unique" UNIQUE("owner_id","request_id"),
	CONSTRAINT "recruitment_lifecycle_case_cycle_kind_unique" UNIQUE("case_id","cycle","kind"),
	CONSTRAINT "recruitment_lifecycle_kind_valid" CHECK ("recruitment_case_lifecycle"."kind" IN ('close','reopen')),
	CONSTRAINT "recruitment_lifecycle_cycle_valid" CHECK ("recruitment_case_lifecycle"."cycle" >= 0 AND "recruitment_case_lifecycle"."expected_case_revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "recruitment_case_lifecycle" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recruitment_closure_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"closure_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"occurred_on" date,
	"offer_confirmed" boolean NOT NULL,
	"expected_case_revision" integer NOT NULL,
	"expected_closure_revision" integer NOT NULL,
	"revision" integer NOT NULL,
	"before_values" jsonb NOT NULL,
	"after_values" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_closure_revision_owner_request_unique" UNIQUE("owner_id","request_id"),
	CONSTRAINT "recruitment_closure_revision_version_unique" UNIQUE("closure_id","revision"),
	CONSTRAINT "recruitment_closure_revision_version_valid" CHECK ("recruitment_closure_revision"."expected_case_revision" >= 0 AND "recruitment_closure_revision"."expected_closure_revision" >= 0 AND "recruitment_closure_revision"."revision" = "recruitment_closure_revision"."expected_closure_revision" + 1)
);
--> statement-breakpoint
ALTER TABLE "recruitment_closure_revision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruitment_case" DROP CONSTRAINT "recruitment_case_3b_status_stage";--> statement-breakpoint
ALTER TABLE "recruitment_case_lifecycle" ADD CONSTRAINT "recruitment_lifecycle_owned_case_fk" FOREIGN KEY ("owner_id","case_id") REFERENCES "public"."recruitment_case"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_closure_revision" ADD CONSTRAINT "recruitment_closure_revision_owned_case_fk" FOREIGN KEY ("owner_id","case_id") REFERENCES "public"."recruitment_case"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_closure_revision" ADD CONSTRAINT "recruitment_closure_revision_closure_fk" FOREIGN KEY ("closure_id") REFERENCES "public"."recruitment_case_lifecycle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recruitment_lifecycle_timeline_idx" ON "recruitment_case_lifecycle" USING btree ("owner_id","case_id","occurred_on" DESC NULLS LAST,"recorded_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "recruitment_case" ADD CONSTRAINT "recruitment_case_3b_status_stage" CHECK (("recruitment_case"."status" IN ('Zapisane', 'Kontakt rozpoczęty', 'Zakończone') AND "recruitment_case"."current_stage" IS NULL AND "recruitment_case"."stage_version" >= 0) OR ("recruitment_case"."status" = 'W rekrutacji' AND "recruitment_case"."current_stage" IS NOT NULL AND char_length("recruitment_case"."current_stage") BETWEEN 1 AND 160 AND "recruitment_case"."current_stage" = public.recruitment_trim("recruitment_case"."current_stage") AND "recruitment_case"."stage_version" >= 1));--> statement-breakpoint
-- DEC-057. No calendar/task tables exist in this explicitly bounded local slice.
-- A future Task/CalendarEvent integration must replace this boundary with atomic
-- BR-011 resolution. It must not reuse the present empty-domain assumption.
REVOKE ALL ON public.recruitment_case_lifecycle, public.recruitment_closure_revision FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT SELECT ON public.recruitment_case_lifecycle, public.recruitment_closure_revision TO authenticated;
--> statement-breakpoint
GRANT INSERT(request_id,case_id,kind,outcome,occurred_on,offer_confirmed,expected_case_revision) ON public.recruitment_case_lifecycle TO authenticated;
--> statement-breakpoint
GRANT INSERT(request_id,case_id,closure_id,outcome,occurred_on,offer_confirmed,expected_case_revision,expected_closure_revision) ON public.recruitment_closure_revision TO authenticated;
--> statement-breakpoint
CREATE POLICY recruitment_lifecycle_select_owner ON public.recruitment_case_lifecycle FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE POLICY recruitment_lifecycle_insert_owner ON public.recruitment_case_lifecycle FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE POLICY recruitment_closure_revision_select_owner ON public.recruitment_closure_revision FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE POLICY recruitment_closure_revision_insert_owner ON public.recruitment_closure_revision FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE VIEW public.recruitment_case_lifecycle_current WITH(security_invoker=true) AS
SELECT l.id,l.owner_id,l.request_id,l.case_id,l.kind,l.cycle,l.recorded_at,l.expected_case_revision,l.previous_status,l.previous_stage,l.resulting_status,l.resulting_stage,
 CASE WHEN r.id IS NULL THEN l.outcome ELSE r.after_values->>'outcome' END AS outcome,
 CASE WHEN r.id IS NULL THEN l.occurred_on ELSE (r.after_values->>'occurredOn')::date END AS occurred_on,
 CASE WHEN r.id IS NULL THEN l.offer_confirmed ELSE (r.after_values->>'offerConfirmed')::boolean END AS offer_confirmed,
 COALESCE(r.revision,0) AS revision,
 CASE WHEN l.kind='close' THEN jsonb_build_object('outcome',l.outcome,'occurredOn',l.occurred_on,'offerConfirmed',l.offer_confirmed) ELSE NULL END AS original
FROM public.recruitment_case_lifecycle l LEFT JOIN LATERAL
 (SELECT x.id,x.revision,x.after_values FROM public.recruitment_closure_revision x WHERE x.owner_id=l.owner_id AND x.case_id=l.case_id AND x.closure_id=l.id ORDER BY x.revision DESC LIMIT 1) r ON true;
--> statement-breakpoint
-- Keep the approved active-fact rules; closure is an explicit state barrier.
ALTER FUNCTION public.recruitment_history_projection(uuid,uuid,jsonb) RENAME TO recruitment_active_history_projection;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_history_projection(p_case_id uuid,p_event_id uuid DEFAULT NULL,p_after jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT CASE WHEN (SELECT l.kind FROM public.recruitment_case_lifecycle l WHERE l.case_id=p_case_id AND l.owner_id=auth.uid() ORDER BY l.expected_case_revision DESC LIMIT 1)='close'
 THEN p || jsonb_build_object('status','Zakończone','currentStage',NULL) ELSE p END
 FROM public.recruitment_active_history_projection(p_case_id,p_event_id,p_after) p;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.preview_recruitment_case_lifecycle(p_case_id uuid,p_operation text,p_closure_id uuid DEFAULT NULL,p_outcome text DEFAULT NULL,p_occurred_on date DEFAULT NULL,p_offer_confirmed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE c public.recruitment_case%ROWTYPE; l record; cycle_no integer; boundary integer; p jsonb; b jsonb:=NULL; a jsonb:=NULL; closure_rev integer:=0;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO c FROM public.recruitment_case WHERE id=p_case_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Case unavailable'; END IF;
 IF p_operation IS NULL OR p_operation NOT IN ('close','reopen','correct-closure') OR p_offer_confirmed IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid lifecycle intent'; END IF;
 IF p_occurred_on IS NOT NULL AND (p_occurred_on<DATE '0001-01-01' OR p_occurred_on>(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid lifecycle date'; END IF;
 SELECT COALESCE(max(cycle),0) INTO cycle_no FROM public.recruitment_case_lifecycle WHERE case_id=c.id AND owner_id=auth.uid();
 IF p_operation='correct-closure' THEN
   SELECT * INTO l FROM public.recruitment_case_lifecycle_current WHERE id=p_closure_id AND case_id=c.id AND owner_id=auth.uid() AND kind='close';
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Closure unavailable'; END IF;
   closure_rev:=l.revision; cycle_no:=l.cycle;
   b:=jsonb_build_object('outcome',l.outcome,'occurredOn',l.occurred_on,'offerConfirmed',l.offer_confirmed);
 ELSIF p_closure_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unexpected closure reference';
 END IF;
 IF p_operation='reopen' THEN
   IF c.status<>'Zakończone' OR p_outcome IS NOT NULL OR p_offer_confirmed THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Reopening requires a closed case'; END IF;
   p:=public.recruitment_active_history_projection(c.id);
   IF jsonb_array_length(p->'blockedBy')>0 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='Stage history has missing invitation'; END IF;
   cycle_no:=cycle_no+1;
 ELSE
   IF p_operation='close' AND EXISTS(SELECT 1 FROM pg_catalog.pg_class t JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname IN ('task','calendar_event','recruitment_task','recruitment_calendar_event')) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='Task/calendar integration requires BR-011 resolution'; END IF;
   IF p_operation='close' AND c.status='Zakończone' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Case already closed'; END IF;
   IF p_outcome IS NULL OR p_outcome NOT IN ('Oferta przyjęta','Oferta odrzucona przez użytkownika','Odmowa firmy','Rezygnacja użytkownika','Brak odpowiedzi','Anulowanie procesu','Nie aplikowano','Inny')
    OR p_offer_confirmed IS DISTINCT FROM (p_outcome IN ('Oferta przyjęta','Oferta odrzucona przez użytkownika')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid closure outcome or offer confirmation'; END IF;
   IF p_outcome='Nie aplikowano' THEN
     -- Initial cycle includes legacy facts whose application revision was unknown.
     SELECT COALESCE(max(expected_case_revision)+1,0) INTO boundary FROM public.recruitment_case_lifecycle WHERE case_id=c.id AND owner_id=auth.uid() AND kind='reopen' AND cycle=cycle_no;
     IF EXISTS(SELECT 1 FROM public.recruitment_case_event_current e JOIN public.recruitment_case_event o ON o.id=e.id WHERE e.case_id=c.id AND e.owner_id=auth.uid() AND e.kind='application' AND NOT e.voided
       AND (cycle_no=0 OR o.applied_case_revision>boundary)
       AND NOT EXISTS(SELECT 1 FROM public.recruitment_case_lifecycle n WHERE n.case_id=c.id AND n.owner_id=auth.uid() AND n.kind='reopen' AND n.cycle>cycle_no AND o.applied_case_revision>n.expected_case_revision)) THEN
       RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='This cycle contains a valid application';
     END IF;
   END IF;
   a:=jsonb_build_object('outcome',p_outcome,'occurredOn',p_occurred_on,'offerConfirmed',p_offer_confirmed);
   IF a=b THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Correction must change data'; END IF;
   p:=CASE WHEN p_operation='close' THEN jsonb_build_object('status','Zakończone','currentStage',NULL) ELSE jsonb_build_object('status',c.status,'currentStage',c.current_stage) END;
 END IF;
 RETURN p || jsonb_build_object('caseRevision',c.case_revision,'closureRevision',closure_rev,'cycle',cycle_no,'before',b,'after',a);
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_lifecycle_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb; c public.recruitment_case%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO c FROM public.recruitment_case WHERE id=NEW.case_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Case unavailable'; END IF;
 IF NEW.expected_case_revision IS DISTINCT FROM c.case_revision THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Case changed; preview again'; END IF;
 IF EXISTS(SELECT 1 FROM public.recruitment_closure_revision r WHERE r.owner_id=auth.uid() AND r.request_id=NEW.request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Save intent payload conflict'; END IF;
 p:=public.preview_recruitment_case_lifecycle(NEW.case_id,NEW.kind,NULL,NEW.outcome,NEW.occurred_on,NEW.offer_confirmed);
 NEW.cycle:=(p->>'cycle')::integer; NEW.previous_status:=c.status; NEW.previous_stage:=c.current_stage;
 NEW.resulting_status:=p->>'status'; NEW.resulting_stage:=p->>'currentStage';
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_lifecycle_before_insert BEFORE INSERT ON public.recruitment_case_lifecycle FOR EACH ROW EXECUTE FUNCTION public.recruitment_lifecycle_guard();
--> statement-breakpoint
CREATE FUNCTION public.recruitment_lifecycle_apply()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 UPDATE public.recruitment_case SET status=NEW.resulting_status,current_stage=NEW.resulting_stage,case_revision=case_revision+1,stage_version=stage_version+1 WHERE id=NEW.case_id AND owner_id=NEW.owner_id;
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_lifecycle_after_insert AFTER INSERT ON public.recruitment_case_lifecycle FOR EACH ROW EXECUTE FUNCTION public.recruitment_lifecycle_apply();
--> statement-breakpoint
CREATE FUNCTION public.recruitment_closure_revision_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb; c public.recruitment_case%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO c FROM public.recruitment_case WHERE id=NEW.case_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Case unavailable'; END IF;
 IF NEW.expected_case_revision IS DISTINCT FROM c.case_revision THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Case changed; preview again'; END IF;
 IF EXISTS(SELECT 1 FROM public.recruitment_case_lifecycle l WHERE l.owner_id=auth.uid() AND l.request_id=NEW.request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Save intent payload conflict'; END IF;
 p:=public.preview_recruitment_case_lifecycle(NEW.case_id,'correct-closure',NEW.closure_id,NEW.outcome,NEW.occurred_on,NEW.offer_confirmed);
 IF NEW.expected_closure_revision IS DISTINCT FROM (p->>'closureRevision')::integer THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Closure changed; preview again'; END IF;
 NEW.revision:=NEW.expected_closure_revision+1; NEW.before_values:=p->'before'; NEW.after_values:=p->'after';
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_closure_revision_before_insert BEFORE INSERT ON public.recruitment_closure_revision FOR EACH ROW EXECUTE FUNCTION public.recruitment_closure_revision_guard();
--> statement-breakpoint
CREATE FUNCTION public.recruitment_closure_revision_apply()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 UPDATE public.recruitment_case SET case_revision=case_revision+1 WHERE id=NEW.case_id AND owner_id=NEW.owner_id;
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_closure_revision_after_insert AFTER INSERT ON public.recruitment_closure_revision FOR EACH ROW EXECUTE FUNCTION public.recruitment_closure_revision_apply();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.recruitment_case_guard_lifecycle()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb; stage_delta integer;
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.status IS DISTINCT FROM 'Zapisane' OR NEW.current_stage IS NOT NULL OR NEW.stage_version IS DISTINCT FROM 0 OR NEW.case_revision IS DISTINCT FROM 0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='New case must be saved only'; END IF;
   RETURN NEW;
 END IF;
 IF pg_catalog.pg_trigger_depth()<>2 OR NEW.owner_id IS DISTINCT FROM auth.uid() OR NEW.case_revision IS DISTINCT FROM OLD.case_revision+1 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Lifecycle change requires a controlled command'; END IF;
 IF EXISTS(SELECT 1 FROM public.recruitment_closure_revision r WHERE r.owner_id=OLD.owner_id AND r.case_id=OLD.id AND r.expected_case_revision=OLD.case_revision) THEN
   IF NEW.status IS DISTINCT FROM OLD.status OR NEW.current_stage IS DISTINCT FROM OLD.current_stage OR NEW.stage_version IS DISTINCT FROM OLD.stage_version THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Closure correction cannot change state'; END IF;
   RETURN NEW;
 ELSIF EXISTS(SELECT 1 FROM public.recruitment_case_lifecycle l WHERE l.owner_id=OLD.owner_id AND l.case_id=OLD.id AND l.expected_case_revision=OLD.case_revision) THEN stage_delta:=1;
 ELSIF EXISTS(SELECT 1 FROM public.recruitment_case_event_revision r WHERE r.owner_id=OLD.owner_id AND r.case_id=OLD.id AND r.expected_case_revision=OLD.case_revision) THEN stage_delta:=1;
 ELSIF EXISTS(SELECT 1 FROM public.recruitment_case_event e WHERE e.owner_id=OLD.owner_id AND e.case_id=OLD.id AND e.applied_case_revision=NEW.case_revision) THEN
   SELECT CASE WHEN e.kind IN ('invitation','stage-change') THEN 1 ELSE 0 END INTO stage_delta FROM public.recruitment_case_event e WHERE e.owner_id=OLD.owner_id AND e.case_id=OLD.id AND e.applied_case_revision=NEW.case_revision;
 ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Lifecycle command unavailable'; END IF;
 p:=public.recruitment_history_projection(OLD.id);
 IF NEW.status IS DISTINCT FROM p->>'status' OR NEW.current_stage IS DISTINCT FROM p->>'currentStage' OR NEW.stage_version IS DISTINCT FROM OLD.stage_version+stage_delta OR jsonb_array_length(p->'blockedBy')>0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Inconsistent lifecycle projection'; END IF;
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_lifecycle_entry_json(l public.recruitment_case_lifecycle)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object('id',l.id,'request_id',l.request_id,'case_id',l.case_id,'kind',l.kind,'cycle',l.cycle,'occurred_on',l.occurred_on,'recorded_at',l.recorded_at,'outcome',l.outcome,'offer_confirmed',l.offer_confirmed,'previous_status',l.previous_status,'previous_stage',l.previous_stage,'resulting_status',l.resulting_status,'resulting_stage',l.resulting_stage,'revision',0,'expected_case_revision',l.expected_case_revision,'original',CASE WHEN l.kind='close' THEN jsonb_build_object('outcome',l.outcome,'occurredOn',l.occurred_on,'offerConfirmed',l.offer_confirmed) ELSE NULL END);
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_closure_revision_json(r public.recruitment_closure_revision)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object('id',r.id,'request_id',r.request_id,'case_id',r.case_id,'closure_id',r.closure_id,'revision',r.revision,'recorded_at',r.recorded_at,'before',r.before_values,'after',r.after_values,'expected_case_revision',r.expected_case_revision,'expected_closure_revision',r.expected_closure_revision);
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.confirm_recruitment_case_lifecycle(p_request_id uuid,p_case_id uuid,p_operation text,p_expected_case_revision integer,p_expected_closure_revision integer,p_closure_id uuid DEFAULT NULL,p_outcome text DEFAULT NULL,p_occurred_on date DEFAULT NULL,p_offer_confirmed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE l public.recruitment_case_lifecycle%ROWTYPE; r public.recruitment_closure_revision%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 IF p_request_id IS NULL OR p_case_id IS NULL OR p_operation IS NULL OR p_operation NOT IN ('close','reopen','correct-closure') OR p_expected_case_revision IS NULL OR p_expected_case_revision NOT BETWEEN 0 AND 2147483646 OR p_expected_closure_revision IS NULL OR p_expected_closure_revision NOT BETWEEN 0 AND 2147483646 OR (p_operation<>'correct-closure' AND (p_expected_closure_revision<>0 OR p_closure_id IS NOT NULL)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid lifecycle intent'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO l FROM public.recruitment_case_lifecycle WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
   IF l.case_id IS DISTINCT FROM p_case_id OR l.kind IS DISTINCT FROM p_operation OR l.expected_case_revision IS DISTINCT FROM p_expected_case_revision OR l.outcome IS DISTINCT FROM p_outcome OR l.occurred_on IS DISTINCT FROM p_occurred_on OR l.offer_confirmed IS DISTINCT FROM p_offer_confirmed THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Save intent payload conflict'; END IF;
   RETURN jsonb_build_object('kind','replayed','entry',public.recruitment_lifecycle_entry_json(l),'revision',NULL);
 END IF;
 SELECT * INTO r FROM public.recruitment_closure_revision WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
   IF p_operation<>'correct-closure' OR r.case_id IS DISTINCT FROM p_case_id OR r.closure_id IS DISTINCT FROM p_closure_id OR r.expected_case_revision IS DISTINCT FROM p_expected_case_revision OR r.expected_closure_revision IS DISTINCT FROM p_expected_closure_revision OR r.outcome IS DISTINCT FROM p_outcome OR r.occurred_on IS DISTINCT FROM p_occurred_on OR r.offer_confirmed IS DISTINCT FROM p_offer_confirmed THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Save intent payload conflict'; END IF;
   RETURN jsonb_build_object('kind','replayed','entry',NULL,'revision',public.recruitment_closure_revision_json(r));
 END IF;
 IF p_operation='correct-closure' THEN
   INSERT INTO public.recruitment_closure_revision(request_id,case_id,closure_id,outcome,occurred_on,offer_confirmed,expected_case_revision,expected_closure_revision)
   VALUES(p_request_id,p_case_id,p_closure_id,p_outcome,p_occurred_on,p_offer_confirmed,p_expected_case_revision,p_expected_closure_revision) RETURNING * INTO r;
   RETURN jsonb_build_object('kind','created','entry',NULL,'revision',public.recruitment_closure_revision_json(r));
 ELSE
   INSERT INTO public.recruitment_case_lifecycle(request_id,case_id,kind,outcome,occurred_on,offer_confirmed,expected_case_revision)
   VALUES(p_request_id,p_case_id,p_operation,p_outcome,p_occurred_on,p_offer_confirmed,p_expected_case_revision) RETURNING * INTO l;
   RETURN jsonb_build_object('kind','created','entry',public.recruitment_lifecycle_entry_json(l),'revision',NULL);
 END IF;
END;
$fn$;
--> statement-breakpoint
CREATE VIEW public.recruitment_case_timeline WITH(security_invoker=true) AS
 SELECT e.owner_id,e.case_id,e.id,e.occurred_on,e.recorded_at,'fact'::text AS type,
 jsonb_build_object('id',e.id,'case_id',e.case_id,'kind',e.kind,'direction',e.direction,'occurred_on',e.occurred_on,'recorded_at',e.recorded_at,'revision',e.revision,'voided',e.voided,'original',e.original,'stage_name',e.stage_name,'previous_stage',e.previous_stage,'expected_stage_version',e.expected_stage_version) AS payload
 FROM public.recruitment_case_event_current e
 UNION ALL
 SELECT l.owner_id,l.case_id,l.id,l.occurred_on,l.recorded_at,'lifecycle'::text,
 jsonb_build_object('id',l.id,'request_id',l.request_id,'case_id',l.case_id,'kind',l.kind,'cycle',l.cycle,'occurred_on',l.occurred_on,'recorded_at',l.recorded_at,'outcome',l.outcome,'offer_confirmed',l.offer_confirmed,'previous_status',l.previous_status,'previous_stage',l.previous_stage,'resulting_status',l.resulting_status,'resulting_stage',l.resulting_stage,'revision',l.revision,'expected_case_revision',l.expected_case_revision,'original',l.original)
 FROM public.recruitment_case_lifecycle_current l;
--> statement-breakpoint
REVOKE ALL ON public.recruitment_case_lifecycle_current,public.recruitment_case_timeline FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT SELECT ON public.recruitment_case_lifecycle_current,public.recruitment_case_timeline TO authenticated;
--> statement-breakpoint
CREATE TRIGGER recruitment_lifecycle_projection_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON public.recruitment_case_lifecycle_current FOR EACH ROW EXECUTE FUNCTION public.recruitment_history_read_only();
--> statement-breakpoint
CREATE TRIGGER recruitment_timeline_projection_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON public.recruitment_case_timeline FOR EACH ROW EXECUTE FUNCTION public.recruitment_history_read_only();

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_history_projection(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.recruitment_history_projection(uuid,uuid,jsonb) TO authenticated;

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.preview_recruitment_case_lifecycle(uuid,text,uuid,text,date,boolean) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.preview_recruitment_case_lifecycle(uuid,text,uuid,text,date,boolean) TO authenticated;

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_lifecycle_guard() FROM PUBLIC,anon,authenticated,service_role;

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_lifecycle_apply() FROM PUBLIC,anon,authenticated,service_role;

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_closure_revision_guard() FROM PUBLIC,anon,authenticated,service_role;

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_closure_revision_apply() FROM PUBLIC,anon,authenticated,service_role;

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_lifecycle_entry_json(public.recruitment_case_lifecycle) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.recruitment_lifecycle_entry_json(public.recruitment_case_lifecycle) TO authenticated;

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_closure_revision_json(public.recruitment_closure_revision) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.recruitment_closure_revision_json(public.recruitment_closure_revision) TO authenticated;

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.confirm_recruitment_case_lifecycle(uuid,uuid,text,integer,integer,uuid,text,date,boolean) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.confirm_recruitment_case_lifecycle(uuid,uuid,text,integer,integer,uuid,text,date,boolean) TO authenticated;

--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
