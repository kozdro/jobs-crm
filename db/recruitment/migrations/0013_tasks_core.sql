CREATE TABLE "recruitment_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_on" date,
	"status" text DEFAULT 'Do zrobienia' NOT NULL,
	"case_id" uuid,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_task_owner_id_unique" UNIQUE("owner_id","id"),
	CONSTRAINT "recruitment_task_title_valid" CHECK (char_length("recruitment_task"."title") BETWEEN 1 AND 160 AND "recruitment_task"."title"=public.recruitment_trim("recruitment_task"."title")),
	CONSTRAINT "recruitment_task_description_valid" CHECK ("recruitment_task"."description" IS NULL OR char_length("recruitment_task"."description")<=2000),
	CONSTRAINT "recruitment_task_status_valid" CHECK ("recruitment_task"."status" IN ('Do zrobienia','Wykonane','Anulowane')),
	CONSTRAINT "recruitment_task_revision_valid" CHECK ("recruitment_task"."revision">=0),
	CONSTRAINT "recruitment_task_day_valid" CHECK ("recruitment_task"."due_on" IS NULL OR ("recruitment_task"."due_on">=DATE '0001-01-01' AND "recruitment_task"."due_on"<=DATE '9999-12-31'))
);
--> statement-breakpoint
ALTER TABLE "recruitment_task" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recruitment_task_command" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"operation" text NOT NULL,
	"before_values" jsonb,
	"after_values" jsonb NOT NULL,
	"closure_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_task_command_owner_request_unique" UNIQUE("owner_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "recruitment_task_command" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruitment_case_lifecycle" ADD COLUMN "expected_task_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitment_case_lifecycle" ADD COLUMN "task_resolutions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitment_task" ADD CONSTRAINT "recruitment_task_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_task" ADD CONSTRAINT "recruitment_task_owned_case_fk" FOREIGN KEY ("owner_id","case_id") REFERENCES "public"."recruitment_case"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_task_command" ADD CONSTRAINT "recruitment_task_command_owned_task_fk" FOREIGN KEY ("owner_id","task_id") REFERENCES "public"."recruitment_task"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_task_command" ADD CONSTRAINT "recruitment_task_command_closure_fk" FOREIGN KEY ("closure_id") REFERENCES "public"."recruitment_case_lifecycle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recruitment_task_owner_order_idx" ON "recruitment_task" USING btree ("owner_id","created_at","id");--> statement-breakpoint
CREATE INDEX "recruitment_task_owner_case_idx" ON "recruitment_task" USING btree ("owner_id","case_id","status","id");--> statement-breakpoint
CREATE INDEX "recruitment_task_command_audit_idx" ON "recruitment_task_command" USING btree ("owner_id","task_id","recorded_at","id");--> statement-breakpoint
-- DEC-060: commands are append-only, projections cannot be written directly.
REVOKE ALL ON public.recruitment_task,public.recruitment_task_command FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON public.recruitment_task TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.recruitment_task_command TO authenticated;
--> statement-breakpoint
GRANT INSERT(request_id,payload) ON public.recruitment_task_command TO authenticated;
--> statement-breakpoint
GRANT INSERT(expected_task_snapshot,task_resolutions) ON public.recruitment_case_lifecycle TO authenticated;
--> statement-breakpoint
CREATE POLICY recruitment_task_owner ON public.recruitment_task FOR ALL TO authenticated USING ((SELECT auth.uid())=owner_id) WITH CHECK ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE POLICY recruitment_task_command_read ON public.recruitment_task_command FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE POLICY recruitment_task_command_insert ON public.recruitment_task_command FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE FUNCTION public.recruitment_task_json(t public.recruitment_task) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'due_on',t.due_on,'status',t.status,'case_id',t.case_id,'case_title',(SELECT title FROM public.recruitment_case WHERE id=t.case_id AND owner_id=auth.uid()),'revision',t.revision,'created_at',t.created_at,'updated_at',t.updated_at);
$fn$;
--> statement-breakpoint
CREATE VIEW public.recruitment_task_current WITH(security_invoker=true) AS
 SELECT t.*,c.title AS case_title FROM public.recruitment_task t LEFT JOIN public.recruitment_case c ON c.id=t.case_id AND c.owner_id=t.owner_id;
--> statement-breakpoint
REVOKE ALL ON public.recruitment_task_current FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT SELECT ON public.recruitment_task_current TO authenticated;
--> statement-breakpoint
CREATE TRIGGER recruitment_task_current_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON public.recruitment_task_current FOR EACH ROW EXECUTE FUNCTION public.recruitment_history_read_only();
--> statement-breakpoint
CREATE FUNCTION public.recruitment_task_projection_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 IF pg_catalog.pg_trigger_depth()<2 OR auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task command required'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Immutable task identity'; END IF;
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_task_guard BEFORE INSERT OR UPDATE ON public.recruitment_task FOR EACH ROW EXECUTE FUNCTION public.recruitment_task_projection_guard();
--> statement-breakpoint
CREATE FUNCTION public.recruitment_task_validate_payload(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE op text:=p->>'operation'; allowed text[]; title text; description text; d text; cid uuid;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR op IS NULL OR op NOT IN ('create','edit','set-status') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task operation'; END IF;
 allowed:=CASE WHEN op='set-status' THEN ARRAY['operation','taskId','expectedRevision','status'] WHEN op='edit' THEN ARRAY['operation','taskId','expectedRevision','title','description','dueOn','caseId'] ELSE ARRAY['operation','title','description','dueOn','caseId'] END;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT(k=ANY(allowed))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task field'; END IF;
 IF op<>'create' THEN
  IF p->>'taskId' IS NULL OR jsonb_typeof(p->'taskId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task identifier'; END IF;
  PERFORM (p->>'taskId')::uuid;
  IF jsonb_typeof(p->'expectedRevision') IS DISTINCT FROM 'number' OR (p->>'expectedRevision') !~ '^[0-9]+$' OR (p->>'expectedRevision')::numeric>2147483646 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task revision'; END IF;
 END IF;
 IF op='set-status' THEN
  IF p->>'status' IS NULL OR p->>'status' NOT IN ('Do zrobienia','Wykonane','Anulowane') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task status'; END IF;
  RETURN p || jsonb_build_object('taskId',((p->>'taskId')::uuid)::text);
 END IF;
 IF jsonb_typeof(p->'title') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task title'; END IF;
 title:=public.recruitment_trim(p->>'title');
 IF char_length(title) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task title'; END IF;
 IF p ? 'description' AND jsonb_typeof(p->'description') NOT IN ('string','null') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task description'; END IF;
 description:=p->>'description';
 IF char_length(description)>2000 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task description'; END IF;
 IF p ? 'dueOn' AND jsonb_typeof(p->'dueOn') NOT IN ('string','null') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task date'; END IF;
 d:=p->>'dueOn';
 IF d IS NOT NULL AND (d !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR d::date<DATE '0001-01-01' OR d::date>DATE '9999-12-31' OR to_char(d::date,'YYYY-MM-DD')<>d) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task date'; END IF;
 IF p ? 'caseId' AND jsonb_typeof(p->'caseId') NOT IN ('string','null') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid case identifier'; END IF;
 cid:=(p->>'caseId')::uuid;
 RETURN p || jsonb_build_object('title',title,'description',description,'dueOn',d,'caseId',cid) || CASE WHEN op='edit' THEN jsonb_build_object('taskId',((p->>'taskId')::uuid)::text) ELSE '{}'::jsonb END;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task values';
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_task_command_guard() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb; op text; t public.recruitment_task%ROWTYPE; cid uuid; decision jsonb;
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() OR NEW.request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 -- Same lock as lifecycle, including direct Data API INSERT commands.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 -- Prevent BEFORE INSERT effects surviving ON CONFLICT DO NOTHING.
 IF EXISTS(SELECT 1 FROM public.recruitment_task_command WHERE owner_id=auth.uid() AND request_id=NEW.request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Task intent already recorded'; END IF;
 NEW.id:=gen_random_uuid(); NEW.recorded_at:=clock_timestamp(); NEW.before_values:=NULL; NEW.closure_id:=NULL;
 IF NEW.payload->>'operation'='closure-resolve' THEN
  IF pg_catalog.pg_trigger_depth()<>2 OR jsonb_typeof(NEW.payload) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.payload) k WHERE k NOT IN ('operation','closureId','taskId','expectedRevision','action')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Closure command required'; END IF;
  p:=NEW.payload;
  SELECT x INTO decision FROM public.recruitment_case_lifecycle l CROSS JOIN LATERAL jsonb_array_elements(l.task_resolutions) x WHERE l.id=(p->>'closureId')::uuid AND l.owner_id=auth.uid() AND l.kind='close' AND x->>'taskId'=p->>'taskId' AND x->>'action'=p->>'action';
  IF decision IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Closure resolution unavailable'; END IF;
  NEW.closure_id:=(p->>'closureId')::uuid;
 ELSE p:=public.recruitment_task_validate_payload(NEW.payload);
 END IF;
 NEW.payload:=p; op:=p->>'operation'; NEW.operation:=CASE WHEN op='closure-resolve' THEN 'closure-' || (p->>'action') ELSE op END;
 IF op<>'create' THEN
  SELECT * INTO t FROM public.recruitment_task WHERE id=(p->>'taskId')::uuid AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task unavailable'; END IF;
  IF t.revision<>(p->>'expectedRevision')::integer THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Task changed'; END IF;
  NEW.before_values:=public.recruitment_task_json(t);
 END IF;
 IF op IN ('create','edit') THEN
  cid:=(p->>'caseId')::uuid;
  IF cid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.recruitment_case WHERE id=cid AND owner_id=auth.uid()) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Case unavailable'; END IF;
  IF op='create' THEN
   INSERT INTO public.recruitment_task(title,description,due_on,case_id) VALUES(p->>'title',p->>'description',(p->>'dueOn')::date,cid) RETURNING * INTO t;
  ELSE
   IF t.title=p->>'title' AND t.description IS NOT DISTINCT FROM p->>'description' AND t.due_on IS NOT DISTINCT FROM (p->>'dueOn')::date AND t.case_id IS NOT DISTINCT FROM cid THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Edit must change task'; END IF;
   UPDATE public.recruitment_task SET title=p->>'title',description=p->>'description',due_on=(p->>'dueOn')::date,case_id=cid,revision=revision+1,updated_at=NEW.recorded_at WHERE id=t.id AND owner_id=auth.uid() RETURNING * INTO t;
  END IF;
 ELSIF op='set-status' THEN
  IF t.status=p->>'status' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Status must change'; END IF;
  UPDATE public.recruitment_task SET status=p->>'status',revision=revision+1,updated_at=NEW.recorded_at WHERE id=t.id AND owner_id=auth.uid() RETURNING * INTO t;
 ELSE
  IF t.status<>'Do zrobienia' OR NOT EXISTS(SELECT 1 FROM public.recruitment_case_lifecycle l WHERE l.id=NEW.closure_id AND l.owner_id=auth.uid() AND l.case_id=t.case_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Open closure task required'; END IF;
  IF p->>'action'<>'keep' THEN
   UPDATE public.recruitment_task SET status=CASE WHEN p->>'action'='cancel' THEN 'Anulowane' ELSE status END,case_id=CASE WHEN p->>'action'='detach' THEN NULL ELSE case_id END,revision=revision+1,updated_at=NEW.recorded_at WHERE id=t.id AND owner_id=auth.uid() RETURNING * INTO t;
  END IF;
 END IF;
 NEW.task_id:=t.id; NEW.after_values:=public.recruitment_task_json(t); NEW.result:=jsonb_build_object('kind','created','task',NEW.after_values);
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_task_command_before_insert BEFORE INSERT ON public.recruitment_task_command FOR EACH ROW EXECUTE FUNCTION public.recruitment_task_command_guard();
--> statement-breakpoint
CREATE FUNCTION public.execute_recruitment_task_command(p_request_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb; old public.recruitment_task_command%ROWTYPE; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 p:=public.recruitment_task_validate_payload(p_payload);
 SELECT * INTO old FROM public.recruitment_task_command WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
  IF old.payload IS DISTINCT FROM p THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Task intent payload conflict'; END IF;
  RETURN old.result || jsonb_build_object('kind','replayed');
 END IF;
 INSERT INTO public.recruitment_task_command(request_id,payload) VALUES(p_request_id,p) RETURNING recruitment_task_command.result INTO result;
 RETURN result;
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_open_tasks(p_case_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT COALESCE(jsonb_agg(public.recruitment_task_json(t) ORDER BY t.id),'[]'::jsonb) FROM public.recruitment_task t WHERE owner_id=auth.uid() AND case_id=p_case_id AND status='Do zrobienia';
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_task_snapshot(p_case_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT COALESCE(jsonb_agg(t.id::text || ':' || t.revision::text ORDER BY t.id),'[]'::jsonb) FROM public.recruitment_task t WHERE owner_id=auth.uid() AND case_id=p_case_id AND status='Do zrobienia';
$fn$;
--> statement-breakpoint
-- Only the implemented recruitment_task integration is admitted; unknown Task/Calendar schemas remain fail-closed.
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
   IF p_operation='close' AND EXISTS(SELECT 1 FROM pg_catalog.pg_class t JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname IN ('task','calendar_event','recruitment_calendar_event')) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='Task/calendar integration requires BR-011 resolution'; END IF;
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
 RETURN p || jsonb_build_object('caseRevision',c.case_revision,'closureRevision',closure_rev,'cycle',cycle_no,'before',b,'after',a,'openTasks',CASE WHEN p_operation='close' THEN public.recruitment_open_tasks(c.id) ELSE '[]'::jsonb END,'taskSnapshot',CASE WHEN p_operation='close' THEN public.recruitment_task_snapshot(c.id) ELSE '[]'::jsonb END);
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_validate_task_resolutions(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE resolution_value jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Task resolutions required'; END IF;
 FOR resolution_value IN SELECT * FROM jsonb_array_elements(p) LOOP
  IF jsonb_typeof(resolution_value) IS DISTINCT FROM 'object' OR resolution_value->>'taskId' IS NULL OR jsonb_typeof(resolution_value->'taskId') IS DISTINCT FROM 'string' OR resolution_value->>'action' IS NULL OR resolution_value->>'action' NOT IN ('cancel','keep','detach') OR EXISTS(SELECT 1 FROM jsonb_object_keys(resolution_value) k WHERE k NOT IN ('taskId','action')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task resolution'; END IF;
  PERFORM (resolution_value->>'taskId')::uuid;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_array_elements(p))<>(SELECT count(DISTINCT (item.value->>'taskId')::uuid) FROM jsonb_array_elements(p) AS item(value)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Duplicate task resolution'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('taskId',((item.value->>'taskId')::uuid)::text,'action',item.value->>'action') ORDER BY (item.value->>'taskId')::uuid) FROM jsonb_array_elements(p) AS item(value)),'[]'::jsonb);
EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid task identifier';
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_lifecycle_task_guard() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE snapshot jsonb; ids jsonb; actual_ids jsonb;
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 NEW.task_resolutions:=public.recruitment_validate_task_resolutions(NEW.task_resolutions);
 IF jsonb_typeof(NEW.expected_task_snapshot) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Task snapshot required'; END IF;
 IF NEW.kind<>'close' THEN
  IF NEW.task_resolutions<>'[]'::jsonb OR NEW.expected_task_snapshot<>'[]'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Only closure resolves tasks'; END IF;
  RETURN NEW;
 END IF;
 snapshot:=public.recruitment_task_snapshot(NEW.case_id);
 IF NEW.expected_task_snapshot IS DISTINCT FROM snapshot THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Tasks changed; preview again'; END IF;
 SELECT COALESCE(jsonb_agg(x->>'taskId' ORDER BY (x->>'taskId')::uuid),'[]'::jsonb) INTO ids FROM jsonb_array_elements(NEW.task_resolutions) x;
 SELECT COALESCE(jsonb_agg(t.id::text ORDER BY t.id),'[]'::jsonb) INTO actual_ids FROM public.recruitment_task t WHERE owner_id=auth.uid() AND case_id=NEW.case_id AND status='Do zrobienia';
 IF ids IS DISTINCT FROM actual_ids THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='Resolve every open task'; END IF;
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_lifecycle_tasks_before_insert BEFORE INSERT ON public.recruitment_case_lifecycle FOR EACH ROW EXECUTE FUNCTION public.recruitment_lifecycle_task_guard();
--> statement-breakpoint
CREATE FUNCTION public.recruitment_lifecycle_task_apply() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE x jsonb; t public.recruitment_task%ROWTYPE;
BEGIN
 IF NEW.kind<>'close' THEN RETURN NEW; END IF;
 FOR x IN SELECT * FROM jsonb_array_elements(NEW.task_resolutions) LOOP
  SELECT * INTO STRICT t FROM public.recruitment_task WHERE owner_id=NEW.owner_id AND id=(x->>'taskId')::uuid;
  INSERT INTO public.recruitment_task_command(request_id,payload) VALUES(gen_random_uuid(),jsonb_build_object('operation','closure-resolve','closureId',NEW.id,'taskId',t.id,'expectedRevision',t.revision,'action',x->>'action'));
 END LOOP;
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_lifecycle_tasks_after_insert AFTER INSERT ON public.recruitment_case_lifecycle FOR EACH ROW EXECUTE FUNCTION public.recruitment_lifecycle_task_apply();
--> statement-breakpoint
CREATE FUNCTION public.confirm_recruitment_case_lifecycle_tasks(p_request_id uuid,p_case_id uuid,p_operation text,p_expected_case_revision integer,p_expected_closure_revision integer,p_closure_id uuid DEFAULT NULL,p_outcome text DEFAULT NULL,p_occurred_on date DEFAULT NULL,p_offer_confirmed boolean DEFAULT false,p_expected_task_snapshot jsonb DEFAULT '[]'::jsonb,p_task_resolutions jsonb DEFAULT '[]'::jsonb)
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
  IF l.case_id IS DISTINCT FROM p_case_id OR l.kind IS DISTINCT FROM p_operation OR l.expected_case_revision IS DISTINCT FROM p_expected_case_revision OR l.outcome IS DISTINCT FROM p_outcome OR l.occurred_on IS DISTINCT FROM p_occurred_on OR l.offer_confirmed IS DISTINCT FROM p_offer_confirmed OR l.expected_task_snapshot IS DISTINCT FROM p_expected_task_snapshot OR l.task_resolutions IS DISTINCT FROM resolutions THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Closure intent payload conflict'; END IF;
  RETURN jsonb_build_object('kind','replayed','entry',public.recruitment_lifecycle_entry_json(l),'revision',NULL);
 END IF;
 IF EXISTS(SELECT 1 FROM public.recruitment_closure_revision WHERE owner_id=auth.uid() AND request_id=p_request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Closure intent payload conflict'; END IF;
 INSERT INTO public.recruitment_case_lifecycle(request_id,case_id,kind,outcome,occurred_on,offer_confirmed,expected_case_revision,expected_task_snapshot,task_resolutions)
 VALUES(p_request_id,p_case_id,p_operation,p_outcome,p_occurred_on,p_offer_confirmed,p_expected_case_revision,p_expected_task_snapshot,resolutions) RETURNING * INTO l;
 RETURN jsonb_build_object('kind','created','entry',public.recruitment_lifecycle_entry_json(l),'revision',NULL);
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_task_json(public.recruitment_task),public.recruitment_task_projection_guard(),public.recruitment_task_validate_payload(jsonb),public.recruitment_task_command_guard(),public.execute_recruitment_task_command(uuid,jsonb),public.recruitment_open_tasks(uuid),public.recruitment_task_snapshot(uuid),public.recruitment_validate_task_resolutions(jsonb),public.recruitment_lifecycle_task_guard(),public.recruitment_lifecycle_task_apply(),public.confirm_recruitment_case_lifecycle_tasks(uuid,uuid,text,integer,integer,uuid,text,date,boolean,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.recruitment_task_json(public.recruitment_task),public.recruitment_task_validate_payload(jsonb),public.execute_recruitment_task_command(uuid,jsonb),public.recruitment_open_tasks(uuid),public.recruitment_task_snapshot(uuid),public.recruitment_validate_task_resolutions(jsonb),public.confirm_recruitment_case_lifecycle_tasks(uuid,uuid,text,integer,integer,uuid,text,date,boolean,jsonb,jsonb) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.recruitment_lifecycle_entry_json(l public.recruitment_case_lifecycle)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object('id',l.id,'request_id',l.request_id,'case_id',l.case_id,'kind',l.kind,'cycle',l.cycle,'occurred_on',l.occurred_on,'recorded_at',l.recorded_at,'outcome',l.outcome,'offer_confirmed',l.offer_confirmed,'previous_status',l.previous_status,'previous_stage',l.previous_stage,'resulting_status',l.resulting_status,'resulting_stage',l.resulting_stage,'revision',0,'expected_case_revision',l.expected_case_revision,'expected_task_snapshot',l.expected_task_snapshot,'task_resolutions',l.task_resolutions,'original',CASE WHEN l.kind='close' THEN jsonb_build_object('outcome',l.outcome,'occurredOn',l.occurred_on,'offerConfirmed',l.offer_confirmed) ELSE NULL END);
$fn$;
--> statement-breakpoint
CREATE OR REPLACE VIEW public.recruitment_case_lifecycle_current WITH(security_invoker=true) AS
SELECT l.id,l.owner_id,l.request_id,l.case_id,l.kind,l.cycle,l.recorded_at,l.expected_case_revision,l.previous_status,l.previous_stage,l.resulting_status,l.resulting_stage,
 CASE WHEN r.id IS NULL THEN l.outcome ELSE r.after_values->>'outcome' END AS outcome,
 CASE WHEN r.id IS NULL THEN l.occurred_on ELSE (r.after_values->>'occurredOn')::date END AS occurred_on,
 CASE WHEN r.id IS NULL THEN l.offer_confirmed ELSE (r.after_values->>'offerConfirmed')::boolean END AS offer_confirmed,
 COALESCE(r.revision,0) AS revision,
 CASE WHEN l.kind='close' THEN jsonb_build_object('outcome',l.outcome,'occurredOn',l.occurred_on,'offerConfirmed',l.offer_confirmed) ELSE NULL END AS original,l.expected_task_snapshot,l.task_resolutions
FROM public.recruitment_case_lifecycle l LEFT JOIN LATERAL
 (SELECT x.id,x.revision,x.after_values FROM public.recruitment_closure_revision x WHERE x.owner_id=l.owner_id AND x.case_id=l.case_id AND x.closure_id=l.id ORDER BY x.revision DESC LIMIT 1) r ON true;
--> statement-breakpoint
CREATE OR REPLACE VIEW public.recruitment_case_timeline WITH(security_invoker=true) AS
 SELECT e.owner_id,e.case_id,e.id,e.occurred_on,e.recorded_at,'fact'::text AS type,
 jsonb_build_object('id',e.id,'case_id',e.case_id,'kind',e.kind,'direction',e.direction,'occurred_on',e.occurred_on,'recorded_at',e.recorded_at,'revision',e.revision,'voided',e.voided,'original',e.original,'stage_name',e.stage_name,'previous_stage',e.previous_stage,'expected_stage_version',e.expected_stage_version) AS payload
 FROM public.recruitment_case_event_current e
 UNION ALL
 SELECT l.owner_id,l.case_id,l.id,l.occurred_on,l.recorded_at,'lifecycle'::text,
 jsonb_build_object('id',l.id,'request_id',l.request_id,'case_id',l.case_id,'kind',l.kind,'cycle',l.cycle,'occurred_on',l.occurred_on,'recorded_at',l.recorded_at,'outcome',l.outcome,'offer_confirmed',l.offer_confirmed,'previous_status',l.previous_status,'previous_stage',l.previous_stage,'resulting_status',l.resulting_status,'resulting_stage',l.resulting_stage,'revision',l.revision,'expected_case_revision',l.expected_case_revision,'expected_task_snapshot',l.expected_task_snapshot,'task_resolutions',l.task_resolutions,'original',l.original)
 FROM public.recruitment_case_lifecycle_current l;

--> statement-breakpoint
-- Legacy callers represent absent Task fields as empty arrays. They must not replay a different task-aware closure intent.
CREATE OR REPLACE FUNCTION public.confirm_recruitment_case_lifecycle(p_request_id uuid,p_case_id uuid,p_operation text,p_expected_case_revision integer,p_expected_closure_revision integer,p_closure_id uuid DEFAULT NULL,p_outcome text DEFAULT NULL,p_occurred_on date DEFAULT NULL,p_offer_confirmed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE l public.recruitment_case_lifecycle%ROWTYPE; r public.recruitment_closure_revision%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 IF p_request_id IS NULL OR p_case_id IS NULL OR p_operation IS NULL OR p_operation NOT IN ('close','reopen','correct-closure') OR p_expected_case_revision IS NULL OR p_expected_case_revision NOT BETWEEN 0 AND 2147483646 OR p_expected_closure_revision IS NULL OR p_expected_closure_revision NOT BETWEEN 0 AND 2147483646 OR (p_operation<>'correct-closure' AND (p_expected_closure_revision<>0 OR p_closure_id IS NOT NULL)) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid lifecycle intent'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO l FROM public.recruitment_case_lifecycle WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
   IF l.case_id IS DISTINCT FROM p_case_id OR l.kind IS DISTINCT FROM p_operation OR l.expected_case_revision IS DISTINCT FROM p_expected_case_revision OR l.outcome IS DISTINCT FROM p_outcome OR l.occurred_on IS DISTINCT FROM p_occurred_on OR l.offer_confirmed IS DISTINCT FROM p_offer_confirmed OR l.expected_task_snapshot IS DISTINCT FROM '[]'::jsonb OR l.task_resolutions IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Save intent payload conflict'; END IF;
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
