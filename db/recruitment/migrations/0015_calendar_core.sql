CREATE TABLE "recruitment_calendar_command" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"operation" text NOT NULL,
	"before_values" jsonb,
	"after_values" jsonb NOT NULL,
	"closure_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_calendar_command_owner_request_unique" UNIQUE("owner_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "recruitment_calendar_command" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recruitment_calendar_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"case_id" uuid,
	"status" text NOT NULL,
	"schedule" jsonb,
	"time_zone" text NOT NULL,
	"actual" jsonb,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_calendar_owner_id_unique" UNIQUE("owner_id","id"),
	CONSTRAINT "recruitment_calendar_title_valid" CHECK (char_length("recruitment_calendar_event"."title") BETWEEN 1 AND 160 AND "recruitment_calendar_event"."title"=public.recruitment_trim("recruitment_calendar_event"."title")),
	CONSTRAINT "recruitment_calendar_description_valid" CHECK ("recruitment_calendar_event"."description" IS NULL OR char_length("recruitment_calendar_event"."description")<=2000),
	CONSTRAINT "recruitment_calendar_status_valid" CHECK ("recruitment_calendar_event"."status" IN ('planned','occurred','not_occurred','cancelled')),
	CONSTRAINT "recruitment_calendar_revision_valid" CHECK ("recruitment_calendar_event"."revision">=0)
);
--> statement-breakpoint
ALTER TABLE "recruitment_calendar_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recruitment_calendar_participant" (
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"event_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"attendance" text NOT NULL,
	CONSTRAINT "recruitment_calendar_participant_unique" UNIQUE("owner_id","event_id","contact_id"),
	CONSTRAINT "recruitment_calendar_participant_attendance_valid" CHECK ("recruitment_calendar_participant"."attendance" IN ('unknown','attended','absent'))
);
--> statement-breakpoint
ALTER TABLE "recruitment_calendar_participant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruitment_case_lifecycle" ADD COLUMN "expected_event_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitment_case_lifecycle" ADD COLUMN "event_resolutions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitment_calendar_command" ADD CONSTRAINT "recruitment_calendar_command_owned_event_fk" FOREIGN KEY ("owner_id","event_id") REFERENCES "public"."recruitment_calendar_event"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_calendar_command" ADD CONSTRAINT "recruitment_calendar_command_closure_fk" FOREIGN KEY ("closure_id") REFERENCES "public"."recruitment_case_lifecycle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_calendar_event" ADD CONSTRAINT "recruitment_calendar_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_calendar_event" ADD CONSTRAINT "recruitment_calendar_owned_case_fk" FOREIGN KEY ("owner_id","case_id") REFERENCES "public"."recruitment_case"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_calendar_participant" ADD CONSTRAINT "recruitment_calendar_participant_event_fk" FOREIGN KEY ("owner_id","event_id") REFERENCES "public"."recruitment_calendar_event"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_calendar_participant" ADD CONSTRAINT "recruitment_calendar_participant_contact_fk" FOREIGN KEY ("owner_id","contact_id") REFERENCES "public"."catalog_profile"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recruitment_calendar_command_audit_idx" ON "recruitment_calendar_command" USING btree ("owner_id","event_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "recruitment_calendar_owner_case_idx" ON "recruitment_calendar_event" USING btree ("owner_id","case_id","status","id");--> statement-breakpoint
CREATE INDEX "recruitment_calendar_participant_contact_idx" ON "recruitment_calendar_participant" USING btree ("owner_id","contact_id","event_id");--> statement-breakpoint
REVOKE ALL ON public.recruitment_calendar_event, public.recruitment_calendar_participant, public.recruitment_calendar_command FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON public.recruitment_calendar_event TO authenticated;
--> statement-breakpoint
GRANT SELECT,INSERT,DELETE ON public.recruitment_calendar_participant TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.recruitment_calendar_command TO authenticated;
--> statement-breakpoint
GRANT INSERT(request_id,payload) ON public.recruitment_calendar_command TO authenticated;
--> statement-breakpoint
CREATE POLICY calendar_event_owner ON public.recruitment_calendar_event FOR ALL TO authenticated USING ((SELECT auth.uid())=owner_id) WITH CHECK ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE POLICY calendar_participant_owner ON public.recruitment_calendar_participant FOR ALL TO authenticated USING ((SELECT auth.uid())=owner_id) WITH CHECK ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE POLICY calendar_command_read ON public.recruitment_calendar_command FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE POLICY calendar_command_insert ON public.recruitment_calendar_command FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE FUNCTION public.recruitment_calendar_projection_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 IF pg_catalog.pg_trigger_depth()<2 OR auth.uid() IS NULL OR COALESCE(NEW.owner_id,OLD.owner_id) IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Calendar command required'; END IF;
 IF TG_TABLE_NAME='recruitment_calendar_event' AND TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Immutable calendar identity'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;$fn$;
--> statement-breakpoint
CREATE TRIGGER calendar_event_guard BEFORE INSERT OR UPDATE ON public.recruitment_calendar_event FOR EACH ROW EXECUTE FUNCTION public.recruitment_calendar_projection_guard();
--> statement-breakpoint
CREATE TRIGGER calendar_participant_guard BEFORE INSERT OR UPDATE OR DELETE ON public.recruitment_calendar_participant FOR EACH ROW EXECUTE FUNCTION public.recruitment_calendar_projection_guard();
--> statement-breakpoint
CREATE FUNCTION public.recruitment_calendar_json(e public.recruitment_calendar_event) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object('id',e.id,'title',e.title,'description',e.description,'case_id',e.case_id,'case_title',(SELECT c.title FROM public.recruitment_case c WHERE c.owner_id=e.owner_id AND c.id=e.case_id),'status',e.status,'schedule',e.schedule,'timeZone',e.time_zone,'actual',e.actual,'participants',COALESCE((SELECT jsonb_agg(jsonb_build_object('contactId',p.contact_id,'attendance',p.attendance) ORDER BY p.contact_id) FROM public.recruitment_calendar_participant p WHERE p.owner_id=e.owner_id AND p.event_id=e.id),'[]'::jsonb),'revision',e.revision,'created_at',e.created_at,'updated_at',e.updated_at);
$fn$;
--> statement-breakpoint
CREATE VIEW public.recruitment_calendar_current WITH(security_invoker=true) AS SELECT e.*,c.title AS case_title FROM public.recruitment_calendar_event e LEFT JOIN public.recruitment_case c ON c.owner_id=e.owner_id AND c.id=e.case_id;
--> statement-breakpoint
REVOKE ALL ON public.recruitment_calendar_current FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT SELECT ON public.recruitment_calendar_current TO authenticated;
--> statement-breakpoint
CREATE TRIGGER recruitment_calendar_current_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON public.recruitment_calendar_current FOR EACH ROW EXECUTE FUNCTION public.recruitment_history_read_only();
--> statement-breakpoint
CREATE FUNCTION public.recruitment_calendar_instant(d text, t text, z text, o jsonb) RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE local_time timestamp; instant timestamptz; off integer;
BEGIN
 IF d IS NULL OR d !~ '^\d{4}-\d{2}-\d{2}$' OR t IS NULL OR t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR jsonb_typeof(o) IS DISTINCT FROM 'number' OR (o#>>'{}') !~ '^-?[0-9]+$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar time'; END IF;
 off:=(o#>>'{}')::integer;
 IF off NOT BETWEEN -1440 AND 1440 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar offset'; END IF;
 local_time:=(d||' '||t)::timestamp;
 IF local_time::date < DATE '0001-01-01' OR local_time::date > DATE '9999-12-31' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar date'; END IF;
 instant:=(local_time - off * interval '1 minute') AT TIME ZONE 'UTC';
 IF instant AT TIME ZONE z IS DISTINCT FROM local_time THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Nonexistent or incorrect calendar offset'; END IF;
 RETURN instant;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar time';
END;$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_calendar_validate_values(v jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE s jsonb; a jsonb; p jsonb; z text; az text; sd date; ed date; si timestamptz; ei timestamptz; ids uuid[]:='{}'; cid uuid; status text;
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(v))<>8 OR EXISTS(SELECT 1 FROM jsonb_object_keys(v) k WHERE k NOT IN ('title','description','caseId','status','schedule','timeZone','actual','participants')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar values'; END IF;
 IF jsonb_typeof(v->'title') IS DISTINCT FROM 'string' OR char_length(public.recruitment_trim(v->>'title')) NOT BETWEEN 1 AND 160 OR jsonb_typeof(v->'description') NOT IN ('string','null') OR char_length(v->>'description')>2000 OR jsonb_typeof(v->'caseId') NOT IN ('string','null') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar fields'; END IF;
 cid:=(v->>'caseId')::uuid;
 IF cid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.recruitment_case WHERE owner_id=auth.uid() AND id=cid) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Case unavailable'; END IF;
 z:=v->>'timeZone'; status:=v->>'status';
 IF jsonb_typeof(v->'timeZone') IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=z) OR status NOT IN ('planned','occurred','not_occurred','cancelled') OR status IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar zone or status'; END IF;
 s:=v->'schedule';
 IF s='null'::jsonb THEN
   IF status='planned' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Planned date required'; END IF;
 ELSE
   IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(s))<>8 OR EXISTS(SELECT 1 FROM jsonb_object_keys(s) k WHERE k NOT IN ('startDate','startTime','endDate','endTime','allDay','timeZone','startOffset','endOffset')) OR s->>'timeZone' IS DISTINCT FROM z OR jsonb_typeof(s->'allDay') IS DISTINCT FROM 'boolean' OR jsonb_typeof(s->'startDate') IS DISTINCT FROM 'string' OR s->>'startDate' !~ '^\d{4}-\d{2}-\d{2}$' OR jsonb_typeof(s->'endDate') NOT IN ('string','null') OR (s->>'endDate' IS NOT NULL AND s->>'endDate' !~ '^\d{4}-\d{2}-\d{2}$') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar schedule'; END IF;
   sd:=(s->>'startDate')::date; ed:=COALESCE((s->>'endDate')::date,sd);
   IF sd<DATE '0001-01-01' OR ed>DATE '9999-12-31' OR ed<sd THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar dates'; END IF;
   IF (s->>'allDay')::boolean OR s->'startTime'='null'::jsonb THEN
     IF s->'startTime'<>'null'::jsonb OR s->'endTime'<>'null'::jsonb OR s->'startOffset'<>'null'::jsonb OR s->'endOffset'<>'null'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unknown time cannot infer clock'; END IF;
   ELSE
     si:=public.recruitment_calendar_instant(s->>'startDate',s->>'startTime',z,s->'startOffset');
     IF s->'endTime'='null'::jsonb THEN
       IF s->'endOffset'<>'null'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unexpected end offset'; END IF;
     ELSE
       ei:=public.recruitment_calendar_instant(ed::text,s->>'endTime',z,s->'endOffset');
       IF ei<si THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='End precedes start'; END IF;
     END IF;
   END IF;
 END IF;
 a:=v->'actual';
 IF a<>'null'::jsonb THEN
   IF status<>'occurred' OR jsonb_typeof(a) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(a))<>4 OR EXISTS(SELECT 1 FROM jsonb_object_keys(a) k WHERE k NOT IN ('date','time','offset','timeZone')) OR jsonb_typeof(a->'date') IS DISTINCT FROM 'string' OR a->>'date' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid actual time'; END IF;
   az:=a->>'timeZone';
   IF jsonb_typeof(a->'timeZone') IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=az) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid actual time zone'; END IF;
   IF a->'time'='null'::jsonb THEN
     IF a->'offset'<>'null'::jsonb OR (a->>'date')::date>(CURRENT_TIMESTAMP AT TIME ZONE az)::date OR (a->>'date')::date<DATE '0001-01-01' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid actual date'; END IF;
   ELSE
     IF public.recruitment_calendar_instant(a->>'date',a->>'time',az,a->'offset')>CURRENT_TIMESTAMP THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Actual time cannot be future'; END IF;
   END IF;
 END IF;
 IF jsonb_typeof(v->'participants') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid participants'; END IF;
 FOR p IN SELECT * FROM jsonb_array_elements(v->'participants') LOOP
   IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p))<>2 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('contactId','attendance')) OR jsonb_typeof(p->'contactId') IS DISTINCT FROM 'string' OR p->>'attendance' NOT IN ('unknown','attended','absent') OR (status<>'occurred' AND p->>'attendance'<>'unknown') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid participant'; END IF;
   cid:=(p->>'contactId')::uuid;
   IF cid=ANY(ids) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate participant'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.catalog_profile WHERE owner_id=auth.uid() AND id=cid AND type='contact') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contact unavailable'; END IF;
   ids:=array_append(ids,cid);
 END LOOP;
 RETURN v || jsonb_build_object('title',public.recruitment_trim(v->>'title'),'caseId',(v->>'caseId')::uuid,'participants',COALESCE((SELECT jsonb_agg(jsonb_build_object('contactId',(x->>'contactId')::uuid,'attendance',x->>'attendance') ORDER BY (x->>'contactId')::uuid) FROM jsonb_array_elements(v->'participants') x),'[]'::jsonb));
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar values';
END;$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_calendar_command_guard() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb:=NEW.payload; v jsonb; op text; e public.recruitment_calendar_event%ROWTYPE; part jsonb; decision jsonb;
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() OR NEW.request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 IF EXISTS(SELECT 1 FROM public.recruitment_calendar_command WHERE owner_id=auth.uid() AND request_id=NEW.request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Calendar intent already recorded'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'operation' NOT IN ('create','edit','resolve','closure-resolve') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar operation'; END IF;
 op:=p->>'operation'; NEW.id:=gen_random_uuid(); NEW.recorded_at:=clock_timestamp(); NEW.before_values:=NULL; NEW.closure_id:=NULL;
 IF op='closure-resolve' THEN
   IF pg_catalog.pg_trigger_depth()<>2 OR (SELECT count(*) FROM jsonb_object_keys(p))<>5 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('operation','closureId','eventId','expectedRevision','action')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Closure command required'; END IF;
   SELECT x INTO decision FROM public.recruitment_case_lifecycle l CROSS JOIN LATERAL jsonb_array_elements(l.event_resolutions) x WHERE l.id=(p->>'closureId')::uuid AND l.owner_id=auth.uid() AND l.kind='close' AND x->>'eventId'=p->>'eventId' AND x->>'action'=p->>'action';
   IF decision IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Closure resolution unavailable'; END IF;
   NEW.closure_id:=(p->>'closureId')::uuid;
 ELSE
   IF (op='create' AND ((SELECT count(*) FROM jsonb_object_keys(p))<>2 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('operation','values')))) OR (op<>'create' AND ((SELECT count(*) FROM jsonb_object_keys(p)) NOT IN (4,5) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN ('operation','values','eventId','expectedRevision','zoneChangeMode')))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar command'; END IF;
   IF p ? 'zoneChangeMode' AND (jsonb_typeof(p->'zoneChangeMode') IS DISTINCT FROM 'string' OR p->>'zoneChangeMode' NOT IN ('keep-local','keep-instant')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid zone change mode'; END IF;
   v:=public.recruitment_calendar_validate_values(p->'values'); p:=p || jsonb_build_object('values',v);
 END IF;
 IF op<>'create' THEN
   IF jsonb_typeof(p->'eventId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'expectedRevision') IS DISTINCT FROM 'number' OR p->>'expectedRevision' !~ '^[0-9]+$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar revision'; END IF;
   SELECT * INTO e FROM public.recruitment_calendar_event WHERE owner_id=auth.uid() AND id=(p->>'eventId')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Event unavailable'; END IF;
   IF e.revision<>(p->>'expectedRevision')::integer THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Calendar event changed'; END IF;
   NEW.before_values:=public.recruitment_calendar_json(e);
 END IF;
 IF op='create' THEN
   IF v->>'status' NOT IN ('planned','occurred') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid initial status'; END IF;
   INSERT INTO public.recruitment_calendar_event(title,description,case_id,status,schedule,time_zone,actual) VALUES(v->>'title',v->>'description',(v->>'caseId')::uuid,v->>'status',NULLIF(v->'schedule','null'::jsonb),v->>'timeZone',NULLIF(v->'actual','null'::jsonb)) RETURNING * INTO e;
 ELSIF op IN ('edit','resolve') THEN
   IF e.time_zone IS DISTINCT FROM v->>'timeZone' AND e.schedule IS NOT NULL AND v->'schedule'<>'null'::jsonb THEN
     IF e.schedule->>'startTime' IS NULL OR (e.schedule->>'allDay')::boolean THEN
       IF v->'schedule'->>'startDate' IS DISTINCT FROM e.schedule->>'startDate' OR v->'schedule'->>'endDate' IS DISTINCT FROM e.schedule->>'endDate' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Zone change must preserve calendar dates'; END IF;
     ELSE
       IF p->>'zoneChangeMode' IS NULL OR p->>'zoneChangeMode' NOT IN ('keep-local','keep-instant') OR v->'schedule'->>'startTime' IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose how to change zone'; END IF;
       IF p->>'zoneChangeMode'='keep-local' AND ((v->'schedule'->>'startDate',v->'schedule'->>'startTime',v->'schedule'->>'endDate',v->'schedule'->>'endTime') IS DISTINCT FROM (e.schedule->>'startDate',e.schedule->>'startTime',e.schedule->>'endDate',e.schedule->>'endTime')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Zone change must preserve local time'; END IF;
       IF p->>'zoneChangeMode'='keep-instant' AND public.recruitment_calendar_instant(e.schedule->>'startDate',e.schedule->>'startTime',e.time_zone,e.schedule->'startOffset') IS DISTINCT FROM public.recruitment_calendar_instant(v->'schedule'->>'startDate',v->'schedule'->>'startTime',v->>'timeZone',v->'schedule'->'startOffset') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Zone change must preserve instant'; END IF;
       IF p->>'zoneChangeMode'='keep-instant' AND e.schedule->>'endTime' IS NOT NULL AND (v->'schedule'->>'endTime' IS NULL OR public.recruitment_calendar_instant(COALESCE(e.schedule->>'endDate',e.schedule->>'startDate'),e.schedule->>'endTime',e.time_zone,e.schedule->'endOffset') IS DISTINCT FROM public.recruitment_calendar_instant(COALESCE(v->'schedule'->>'endDate',v->'schedule'->>'startDate'),v->'schedule'->>'endTime',v->>'timeZone',v->'schedule'->'endOffset')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Zone change must preserve end instant'; END IF;
       IF p->>'zoneChangeMode'='keep-instant' AND e.schedule->>'endDate' IS NOT NULL AND e.schedule->>'endTime' IS NULL AND v->'schedule'->>'endDate' IS DISTINCT FROM e.schedule->>'endDate' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unknown end time must preserve date'; END IF;
     END IF;
   END IF;
   IF op='edit' AND v->>'status' IS DISTINCT FROM e.status THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Status change requires resolution'; END IF;
   IF op='resolve' AND (v->>'status'='planned' OR v->>'status'=e.status) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose a different resolution'; END IF;
   UPDATE public.recruitment_calendar_event SET title=v->>'title',description=v->>'description',case_id=(v->>'caseId')::uuid,status=v->>'status',schedule=NULLIF(v->'schedule','null'::jsonb),time_zone=v->>'timeZone',actual=NULLIF(v->'actual','null'::jsonb),revision=revision+1,updated_at=NEW.recorded_at WHERE owner_id=auth.uid() AND id=e.id RETURNING * INTO e;
 ELSIF op='closure-resolve' THEN
   IF e.status<>'planned' OR NOT EXISTS(SELECT 1 FROM public.recruitment_case_lifecycle l WHERE l.id=NEW.closure_id AND l.owner_id=auth.uid() AND l.case_id=e.case_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Open closure event required'; END IF;
   IF p->>'action'<>'keep' THEN
     UPDATE public.recruitment_calendar_event SET status=CASE WHEN p->>'action'='cancel' THEN 'cancelled' ELSE status END,case_id=CASE WHEN p->>'action'='detach' THEN NULL ELSE case_id END,revision=revision+1,updated_at=NEW.recorded_at WHERE owner_id=auth.uid() AND id=e.id RETURNING * INTO e;
   END IF;
 END IF;
 IF op IN ('create','edit','resolve') THEN
   DELETE FROM public.recruitment_calendar_participant WHERE owner_id=auth.uid() AND event_id=e.id;
   FOR part IN SELECT * FROM jsonb_array_elements(v->'participants') LOOP
     INSERT INTO public.recruitment_calendar_participant(event_id,contact_id,attendance) VALUES(e.id,(part->>'contactId')::uuid,part->>'attendance');
   END LOOP;
 END IF;
 NEW.payload:=p; NEW.operation:=CASE WHEN op='closure-resolve' THEN 'closure-'||(p->>'action') ELSE op END; NEW.event_id:=e.id; NEW.after_values:=public.recruitment_calendar_json(e); NEW.result:=jsonb_build_object('kind','created','event',NEW.after_values);
 RETURN NEW;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar identifier or revision';
END;$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_calendar_command_before_insert BEFORE INSERT ON public.recruitment_calendar_command FOR EACH ROW EXECUTE FUNCTION public.recruitment_calendar_command_guard();
--> statement-breakpoint
CREATE FUNCTION public.execute_recruitment_calendar_command(p_request_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb:=p_payload; old public.recruitment_calendar_command%ROWTYPE; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->>'operation' NOT IN ('create','edit','resolve') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid calendar command'; END IF;
 p:=p || jsonb_build_object('values',public.recruitment_calendar_validate_values(p->'values'));
 SELECT * INTO old FROM public.recruitment_calendar_command WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
   IF old.payload IS DISTINCT FROM p THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Calendar intent payload conflict'; END IF;
   RETURN old.result || jsonb_build_object('kind','replayed');
 END IF;
 INSERT INTO public.recruitment_calendar_command(request_id,payload) VALUES(p_request_id,p) RETURNING recruitment_calendar_command.result INTO result;
 RETURN result;
END;$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_calendar_has_passed(s jsonb, z text, at_time timestamptz) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE last_day date; instant timestamptz;
BEGIN
 IF s IS NULL THEN RETURN false; END IF;
 last_day:=COALESCE((s->>'endDate')::date,(s->>'startDate')::date);
 IF (s->>'allDay')::boolean OR s->>'startTime' IS NULL OR (s->>'endDate' IS NOT NULL AND s->>'endTime' IS NULL) THEN RETURN (at_time AT TIME ZONE z)::date>last_day; END IF;
 IF s->>'endTime' IS NOT NULL THEN instant:=public.recruitment_calendar_instant(last_day::text,s->>'endTime',z,s->'endOffset');
 ELSE instant:=public.recruitment_calendar_instant(s->>'startDate',s->>'startTime',z,s->'startOffset'); END IF;
 RETURN at_time>instant;
END;$fn$;
--> statement-breakpoint
CREATE FUNCTION public.list_recruitment_calendar_events(p_case_id uuid DEFAULT NULL,p_contact_id uuid DEFAULT NULL,p_filter text DEFAULT 'all',p_offset integer DEFAULT 0,p_limit integer DEFAULT 26) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 IF p_offset IS NULL OR p_offset<0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 101 OR p_filter IS NULL OR p_filter NOT IN ('all','upcoming','attention') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid page'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(public.recruitment_calendar_json(q.entity) ORDER BY COALESCE((q.entity).schedule->>'startDate','9999-12-31'),(q.entity).id) FROM (SELECT e AS entity FROM public.recruitment_calendar_event e WHERE e.owner_id=auth.uid() AND (p_case_id IS NULL OR e.case_id=p_case_id) AND (p_contact_id IS NULL OR EXISTS(SELECT 1 FROM public.recruitment_calendar_participant p WHERE p.owner_id=e.owner_id AND p.event_id=e.id AND p.contact_id=p_contact_id AND p.attendance='attended' AND e.status='occurred')) AND (p_filter='all' OR (e.status='planned' AND public.recruitment_calendar_has_passed(e.schedule,e.time_zone,CURRENT_TIMESTAMP)=(p_filter='attention'))) ORDER BY COALESCE(e.schedule->>'startDate','9999-12-31'),e.id OFFSET p_offset LIMIT p_limit) q),'[]'::jsonb);
END;$fn$;
--> statement-breakpoint
CREATE FUNCTION public.get_recruitment_calendar_event(p_event_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT public.recruitment_calendar_json(e) FROM public.recruitment_calendar_event e WHERE e.owner_id=auth.uid() AND e.id=p_event_id;
$fn$;
--> statement-breakpoint
GRANT INSERT(expected_event_snapshot,event_resolutions) ON public.recruitment_case_lifecycle TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_open_calendar_events(p_case_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT COALESCE(jsonb_agg(public.recruitment_calendar_json(e) ORDER BY e.id),'[]'::jsonb) FROM public.recruitment_calendar_event e WHERE e.owner_id=auth.uid() AND e.case_id=p_case_id AND e.status='planned';
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_calendar_snapshot(p_case_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT COALESCE(jsonb_agg(e.id::text||':'||e.revision::text ORDER BY e.id),'[]'::jsonb) FROM public.recruitment_calendar_event e WHERE e.owner_id=auth.uid() AND e.case_id=p_case_id AND e.status='planned';
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_validate_calendar_resolutions(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE x jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Event resolutions required'; END IF;
 FOR x IN SELECT * FROM jsonb_array_elements(p) LOOP
   IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(x))<>2 OR EXISTS(SELECT 1 FROM jsonb_object_keys(x) k WHERE k NOT IN ('eventId','action')) OR jsonb_typeof(x->'eventId') IS DISTINCT FROM 'string' OR x->>'action' IS NULL OR x->>'action' NOT IN ('cancel','keep','detach') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid event resolution'; END IF;
   PERFORM (x->>'eventId')::uuid;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_array_elements(p))<>(SELECT count(DISTINCT (x->>'eventId')::uuid) FROM jsonb_array_elements(p) x) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate event resolution'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('eventId',(x->>'eventId')::uuid,'action',x->>'action') ORDER BY (x->>'eventId')::uuid) FROM jsonb_array_elements(p) x),'[]'::jsonb);
EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid event identifier';
END;$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_lifecycle_calendar_guard() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE ids jsonb; actual_ids jsonb;
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 NEW.event_resolutions:=public.recruitment_validate_calendar_resolutions(NEW.event_resolutions);
 IF jsonb_typeof(NEW.expected_event_snapshot) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Event snapshot required'; END IF;
 IF NEW.kind<>'close' THEN
   IF NEW.event_resolutions<>'[]'::jsonb OR NEW.expected_event_snapshot<>'[]'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Only closure resolves events'; END IF;
   RETURN NEW;
 END IF;
 IF NEW.expected_event_snapshot IS DISTINCT FROM public.recruitment_calendar_snapshot(NEW.case_id) THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Events changed; preview again'; END IF;
 SELECT COALESCE(jsonb_agg(x->>'eventId' ORDER BY (x->>'eventId')::uuid),'[]'::jsonb) INTO ids FROM jsonb_array_elements(NEW.event_resolutions) x;
 SELECT COALESCE(jsonb_agg(e.id::text ORDER BY e.id),'[]'::jsonb) INTO actual_ids FROM public.recruitment_calendar_event e WHERE e.owner_id=auth.uid() AND e.case_id=NEW.case_id AND e.status='planned';
 IF ids IS DISTINCT FROM actual_ids THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='Resolve every open event'; END IF;
 RETURN NEW;
END;$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_lifecycle_calendar_before_insert BEFORE INSERT ON public.recruitment_case_lifecycle FOR EACH ROW EXECUTE FUNCTION public.recruitment_lifecycle_calendar_guard();
--> statement-breakpoint
CREATE FUNCTION public.recruitment_lifecycle_calendar_apply() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE x jsonb; e public.recruitment_calendar_event%ROWTYPE;
BEGIN
 IF NEW.kind<>'close' THEN RETURN NEW; END IF;
 FOR x IN SELECT * FROM jsonb_array_elements(NEW.event_resolutions) LOOP
   SELECT * INTO STRICT e FROM public.recruitment_calendar_event WHERE owner_id=NEW.owner_id AND id=(x->>'eventId')::uuid;
   INSERT INTO public.recruitment_calendar_command(request_id,payload) VALUES(gen_random_uuid(),jsonb_build_object('operation','closure-resolve','closureId',NEW.id,'eventId',e.id,'expectedRevision',e.revision,'action',x->>'action'));
 END LOOP;
 RETURN NEW;
END;$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_lifecycle_calendar_after_insert AFTER INSERT ON public.recruitment_case_lifecycle FOR EACH ROW EXECUTE FUNCTION public.recruitment_lifecycle_calendar_apply();
--> statement-breakpoint
CREATE FUNCTION public.confirm_recruitment_case_lifecycle_calendar(p_request_id uuid,p_case_id uuid,p_operation text,p_expected_case_revision integer,p_expected_closure_revision integer,p_closure_id uuid DEFAULT NULL,p_outcome text DEFAULT NULL,p_occurred_on date DEFAULT NULL,p_offer_confirmed boolean DEFAULT false,p_expected_task_snapshot jsonb DEFAULT '[]'::jsonb,p_task_resolutions jsonb DEFAULT '[]'::jsonb,p_expected_event_snapshot jsonb DEFAULT '[]'::jsonb,p_event_resolutions jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE l public.recruitment_case_lifecycle%ROWTYPE; tr jsonb; er jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 IF jsonb_typeof(p_expected_task_snapshot) IS DISTINCT FROM 'array' OR jsonb_typeof(p_expected_event_snapshot) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Snapshots required'; END IF;
 tr:=public.recruitment_validate_task_resolutions(p_task_resolutions); er:=public.recruitment_validate_calendar_resolutions(p_event_resolutions);
 IF p_operation<>'close' THEN
   IF tr<>'[]'::jsonb OR er<>'[]'::jsonb OR p_expected_task_snapshot<>'[]'::jsonb OR p_expected_event_snapshot<>'[]'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Only closure resolves open items'; END IF;
   RETURN public.confirm_recruitment_case_lifecycle(p_request_id,p_case_id,p_operation,p_expected_case_revision,p_expected_closure_revision,p_closure_id,p_outcome,p_occurred_on,p_offer_confirmed);
 END IF;
 IF p_case_id IS NULL OR p_expected_case_revision IS NULL OR p_expected_case_revision NOT BETWEEN 0 AND 2147483646 OR p_expected_closure_revision IS DISTINCT FROM 0 OR p_closure_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid closure intent'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO l FROM public.recruitment_case_lifecycle WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
   IF l.case_id IS DISTINCT FROM p_case_id OR l.kind IS DISTINCT FROM p_operation OR l.expected_case_revision IS DISTINCT FROM p_expected_case_revision OR l.outcome IS DISTINCT FROM p_outcome OR l.occurred_on IS DISTINCT FROM p_occurred_on OR l.offer_confirmed IS DISTINCT FROM p_offer_confirmed OR l.expected_task_snapshot IS DISTINCT FROM p_expected_task_snapshot OR l.task_resolutions IS DISTINCT FROM tr OR l.expected_event_snapshot IS DISTINCT FROM p_expected_event_snapshot OR l.event_resolutions IS DISTINCT FROM er THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Closure intent payload conflict'; END IF;
   RETURN jsonb_build_object('kind','replayed','entry',public.recruitment_lifecycle_entry_json(l),'revision',NULL);
 END IF;
 IF EXISTS(SELECT 1 FROM public.recruitment_closure_revision WHERE owner_id=auth.uid() AND request_id=p_request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Closure intent payload conflict'; END IF;
 INSERT INTO public.recruitment_case_lifecycle(request_id,case_id,kind,outcome,occurred_on,offer_confirmed,expected_case_revision,expected_task_snapshot,task_resolutions,expected_event_snapshot,event_resolutions)
 VALUES(p_request_id,p_case_id,p_operation,p_outcome,p_occurred_on,p_offer_confirmed,p_expected_case_revision,p_expected_task_snapshot,tr,p_expected_event_snapshot,er) RETURNING * INTO l;
 RETURN jsonb_build_object('kind','created','entry',public.recruitment_lifecycle_entry_json(l),'revision',NULL);
END;$fn$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.preview_recruitment_case_lifecycle(p_case_id uuid,p_operation text,p_closure_id uuid DEFAULT NULL,p_outcome text DEFAULT NULL,p_occurred_on date DEFAULT NULL,p_offer_confirmed boolean DEFAULT false)
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
   IF p_operation='close' AND EXISTS(SELECT 1 FROM pg_catalog.pg_class t JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname IN ('task','calendar_event')) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='Task/calendar integration requires BR-011 resolution'; END IF;
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
 RETURN p || jsonb_build_object('caseRevision',c.case_revision,'closureRevision',closure_rev,'cycle',cycle_no,'before',b,'after',a,'openTasks',CASE WHEN p_operation='close' THEN public.recruitment_open_tasks(c.id) ELSE '[]'::jsonb END,'taskSnapshot',CASE WHEN p_operation='close' THEN public.recruitment_task_snapshot(c.id) ELSE '[]'::jsonb END,'openEvents',CASE WHEN p_operation='close' THEN public.recruitment_open_calendar_events(c.id) ELSE '[]'::jsonb END,'eventSnapshot',CASE WHEN p_operation='close' THEN public.recruitment_calendar_snapshot(c.id) ELSE '[]'::jsonb END);
END;
$fn$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.confirm_recruitment_case_lifecycle_tasks(p_request_id uuid,p_case_id uuid,p_operation text,p_expected_case_revision integer,p_expected_closure_revision integer,p_closure_id uuid DEFAULT NULL,p_outcome text DEFAULT NULL,p_occurred_on date DEFAULT NULL,p_offer_confirmed boolean DEFAULT false,p_expected_task_snapshot jsonb DEFAULT '[]'::jsonb,p_task_resolutions jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE l public.recruitment_case_lifecycle%ROWTYPE; resolutions jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 IF jsonb_typeof(p_expected_task_snapshot) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Task snapshot required'; END IF;
 resolutions:=public.recruitment_validate_task_resolutions(p_task_resolutions);
 IF p_operation<>'close' THEN
  IF resolutions<>'[]'::jsonb OR p_expected_task_snapshot<>'[]'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Only closure resolves tasks'; END IF;
  RETURN public.confirm_recruitment_case_lifecycle(p_request_id,p_case_id,p_operation,p_expected_case_revision,p_expected_closure_revision,p_closure_id,p_outcome,p_occurred_on,p_offer_confirmed);
 END IF;
 IF p_case_id IS NULL OR p_expected_case_revision IS NULL OR p_expected_case_revision NOT BETWEEN 0 AND 2147483646 OR p_expected_closure_revision IS DISTINCT FROM 0 OR p_closure_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid closure intent'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO l FROM public.recruitment_case_lifecycle WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
  IF l.case_id IS DISTINCT FROM p_case_id OR l.kind IS DISTINCT FROM p_operation OR l.expected_case_revision IS DISTINCT FROM p_expected_case_revision OR l.outcome IS DISTINCT FROM p_outcome OR l.occurred_on IS DISTINCT FROM p_occurred_on OR l.offer_confirmed IS DISTINCT FROM p_offer_confirmed OR l.expected_task_snapshot IS DISTINCT FROM p_expected_task_snapshot OR l.task_resolutions IS DISTINCT FROM resolutions OR l.expected_event_snapshot IS DISTINCT FROM '[]'::jsonb OR l.event_resolutions IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Closure intent payload conflict'; END IF;
  RETURN jsonb_build_object('kind','replayed','entry',public.recruitment_lifecycle_entry_json(l),'revision',NULL);
 END IF;
 IF EXISTS(SELECT 1 FROM public.recruitment_closure_revision WHERE owner_id=auth.uid() AND request_id=p_request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Closure intent payload conflict'; END IF;
 INSERT INTO public.recruitment_case_lifecycle(request_id,case_id,kind,outcome,occurred_on,offer_confirmed,expected_case_revision,expected_task_snapshot,task_resolutions)
 VALUES(p_request_id,p_case_id,p_operation,p_outcome,p_occurred_on,p_offer_confirmed,p_expected_case_revision,p_expected_task_snapshot,resolutions) RETURNING * INTO l;
 RETURN jsonb_build_object('kind','created','entry',public.recruitment_lifecycle_entry_json(l),'revision',NULL);
END;
$fn$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.confirm_recruitment_case_lifecycle(p_request_id uuid,p_case_id uuid,p_operation text,p_expected_case_revision integer,p_expected_closure_revision integer,p_closure_id uuid DEFAULT NULL,p_outcome text DEFAULT NULL,p_occurred_on date DEFAULT NULL,p_offer_confirmed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE l public.recruitment_case_lifecycle%ROWTYPE; r public.recruitment_closure_revision%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 IF p_request_id IS NULL OR p_case_id IS NULL OR p_operation IS NULL OR p_operation NOT IN ('close','reopen','correct-closure') OR p_expected_case_revision IS NULL OR p_expected_case_revision NOT BETWEEN 0 AND 2147483646 OR p_expected_closure_revision IS NULL OR p_expected_closure_revision NOT BETWEEN 0 AND 2147483646 OR (p_operation<>'correct-closure' AND (p_expected_closure_revision<>0 OR p_closure_id IS NOT NULL)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid lifecycle intent'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO l FROM public.recruitment_case_lifecycle WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
   IF l.case_id IS DISTINCT FROM p_case_id OR l.kind IS DISTINCT FROM p_operation OR l.expected_case_revision IS DISTINCT FROM p_expected_case_revision OR l.outcome IS DISTINCT FROM p_outcome OR l.occurred_on IS DISTINCT FROM p_occurred_on OR l.offer_confirmed IS DISTINCT FROM p_offer_confirmed OR l.expected_task_snapshot IS DISTINCT FROM '[]'::jsonb OR l.task_resolutions IS DISTINCT FROM '[]'::jsonb OR l.expected_event_snapshot IS DISTINCT FROM '[]'::jsonb OR l.event_resolutions IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Save intent payload conflict'; END IF;
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
CREATE OR REPLACE FUNCTION public.recruitment_lifecycle_entry_json(l public.recruitment_case_lifecycle)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object('id',l.id,'request_id',l.request_id,'case_id',l.case_id,'kind',l.kind,'cycle',l.cycle,'occurred_on',l.occurred_on,'recorded_at',l.recorded_at,'outcome',l.outcome,'offer_confirmed',l.offer_confirmed,'previous_status',l.previous_status,'previous_stage',l.previous_stage,'resulting_status',l.resulting_status,'resulting_stage',l.resulting_stage,'revision',0,'expected_case_revision',l.expected_case_revision,'expected_task_snapshot',l.expected_task_snapshot,'task_resolutions',l.task_resolutions,'expected_event_snapshot',l.expected_event_snapshot,'event_resolutions',l.event_resolutions,'original',CASE WHEN l.kind='close' THEN jsonb_build_object('outcome',l.outcome,'occurredOn',l.occurred_on,'offerConfirmed',l.offer_confirmed) ELSE NULL END);
$fn$;

--> statement-breakpoint
CREATE OR REPLACE VIEW public.recruitment_case_lifecycle_current WITH(security_invoker=true) AS
SELECT l.id,l.owner_id,l.request_id,l.case_id,l.kind,l.cycle,l.recorded_at,l.expected_case_revision,l.previous_status,l.previous_stage,l.resulting_status,l.resulting_stage,
 CASE WHEN r.id IS NULL THEN l.outcome ELSE r.after_values->>'outcome' END AS outcome,
 CASE WHEN r.id IS NULL THEN l.occurred_on ELSE (r.after_values->>'occurredOn')::date END AS occurred_on,
 CASE WHEN r.id IS NULL THEN l.offer_confirmed ELSE (r.after_values->>'offerConfirmed')::boolean END AS offer_confirmed,
 COALESCE(r.revision,0) AS revision,
 CASE WHEN l.kind='close' THEN jsonb_build_object('outcome',l.outcome,'occurredOn',l.occurred_on,'offerConfirmed',l.offer_confirmed) ELSE NULL END AS original,l.expected_task_snapshot,l.task_resolutions,l.expected_event_snapshot,l.event_resolutions
FROM public.recruitment_case_lifecycle l LEFT JOIN LATERAL
 (SELECT x.id,x.revision,x.after_values FROM public.recruitment_closure_revision x WHERE x.owner_id=l.owner_id AND x.case_id=l.case_id AND x.closure_id=l.id ORDER BY x.revision DESC LIMIT 1) r ON true;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_calendar_projection_guard(),public.recruitment_calendar_json(public.recruitment_calendar_event),public.recruitment_calendar_instant(text,text,text,jsonb),public.recruitment_calendar_validate_values(jsonb),public.recruitment_calendar_command_guard(),public.execute_recruitment_calendar_command(uuid,jsonb),public.recruitment_calendar_has_passed(jsonb,text,timestamptz),public.list_recruitment_calendar_events(uuid,uuid,text,integer,integer),public.get_recruitment_calendar_event(uuid),public.recruitment_open_calendar_events(uuid),public.recruitment_calendar_snapshot(uuid),public.recruitment_validate_calendar_resolutions(jsonb),public.recruitment_lifecycle_calendar_guard(),public.recruitment_lifecycle_calendar_apply(),public.confirm_recruitment_case_lifecycle_calendar(uuid,uuid,text,integer,integer,uuid,text,date,boolean,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.recruitment_calendar_json(public.recruitment_calendar_event),public.recruitment_calendar_instant(text,text,text,jsonb),public.recruitment_calendar_validate_values(jsonb),public.execute_recruitment_calendar_command(uuid,jsonb),public.recruitment_calendar_has_passed(jsonb,text,timestamptz),public.list_recruitment_calendar_events(uuid,uuid,text,integer,integer),public.get_recruitment_calendar_event(uuid),public.recruitment_open_calendar_events(uuid),public.recruitment_calendar_snapshot(uuid),public.recruitment_validate_calendar_resolutions(jsonb),public.confirm_recruitment_case_lifecycle_calendar(uuid,uuid,text,integer,integer,uuid,text,date,boolean,jsonb,jsonb,jsonb,jsonb) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst,'reload schema';

--> statement-breakpoint
CREATE OR REPLACE VIEW public.recruitment_case_timeline WITH(security_invoker=true) AS
 SELECT e.owner_id,e.case_id,e.id,e.occurred_on,e.recorded_at,'fact'::text AS type,
 jsonb_build_object('id',e.id,'case_id',e.case_id,'kind',e.kind,'direction',e.direction,'occurred_on',e.occurred_on,'recorded_at',e.recorded_at,'revision',e.revision,'voided',e.voided,'original',e.original,'stage_name',e.stage_name,'previous_stage',e.previous_stage,'expected_stage_version',e.expected_stage_version) AS payload
 FROM public.recruitment_case_event_current e
 UNION ALL
 SELECT l.owner_id,l.case_id,l.id,l.occurred_on,l.recorded_at,'lifecycle'::text,
 jsonb_build_object('id',l.id,'request_id',l.request_id,'case_id',l.case_id,'kind',l.kind,'cycle',l.cycle,'occurred_on',l.occurred_on,'recorded_at',l.recorded_at,'outcome',l.outcome,'offer_confirmed',l.offer_confirmed,'previous_status',l.previous_status,'previous_stage',l.previous_stage,'resulting_status',l.resulting_status,'resulting_stage',l.resulting_stage,'revision',l.revision,'expected_case_revision',l.expected_case_revision,'expected_task_snapshot',l.expected_task_snapshot,'task_resolutions',l.task_resolutions,'original',l.original)
 FROM public.recruitment_case_lifecycle_current l
 UNION ALL
 SELECT e.owner_id,e.case_id,e.id,(e.actual->>'date')::date,first_occurrence.recorded_at,'calendar'::text,public.recruitment_calendar_json(e)
 FROM public.recruitment_calendar_event e JOIN LATERAL
 (SELECT c.recorded_at FROM public.recruitment_calendar_command c WHERE c.owner_id=e.owner_id AND c.event_id=e.id AND c.after_values->>'status'='occurred' AND (c.before_values IS NULL OR c.before_values->>'status' IS DISTINCT FROM 'occurred') ORDER BY c.recorded_at DESC,c.id DESC LIMIT 1) first_occurrence ON true
 WHERE e.case_id IS NOT NULL AND e.status='occurred';
