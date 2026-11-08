CREATE TABLE "recruitment_reminder_command" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_reminder_command_owner_request_unique" UNIQUE("owner_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "recruitment_reminder_command" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruitment_reminder_command" ADD CONSTRAINT "recruitment_reminder_command_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recruitment_reminder_command_owner_order_idx" ON "recruitment_reminder_command" USING btree ("owner_id","recorded_at","id");--> statement-breakpoint
-- All mutations are validated by the append-only intent trigger, including direct Data API inserts.
REVOKE ALL ON public.recruitment_reminder_command FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT SELECT ON public.recruitment_reminder_command TO authenticated;
--> statement-breakpoint
GRANT INSERT (request_id,payload) ON public.recruitment_reminder_command TO authenticated;
--> statement-breakpoint
CREATE POLICY recruitment_reminder_command_read ON public.recruitment_reminder_command FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
--> statement-breakpoint
CREATE POLICY recruitment_reminder_command_insert ON public.recruitment_reminder_command FOR INSERT TO authenticated WITH CHECK (owner_id=(SELECT auth.uid()));
--> statement-breakpoint
-- The task audit contains every change, so editing a due date or relation and later
-- reverting it cannot accidentally reactivate an old configuration.
CREATE FUNCTION public.recruitment_current_reminder(p_task_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
  SELECT CASE WHEN t.status='Do zrobienia'
    AND NOT EXISTS (
      SELECT 1 FROM public.recruitment_task_command a
      WHERE a.owner_id=t.owner_id AND a.task_id=t.id
        AND (a.after_values->>'revision')::integer > (c.payload->>'expectedRevision')::integer
        AND (a.before_values->>'status' IS DISTINCT FROM a.after_values->>'status'
          OR a.before_values->>'due_on' IS DISTINCT FROM a.after_values->>'due_on'
          OR a.before_values->>'case_id' IS DISTINCT FROM a.after_values->>'case_id')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.recruitment_reminder_command x
      WHERE x.owner_id=c.owner_id AND x.payload->>'operation' IN ('acknowledge','disable')
        AND (x.payload->>'configurationId')::uuid=c.request_id
    )
    THEN jsonb_build_object('id',c.request_id,'taskId',t.id,'taskTitle',t.title,
      'date',c.payload->>'date','time',c.payload->>'time','timeZone',c.payload->>'timeZone',
      'offset',(c.payload->>'offset')::integer,'instant',c.result->>'instant',
      'state',CASE WHEN (c.result->>'instant')::timestamptz<=CURRENT_TIMESTAMP THEN 'due' ELSE 'scheduled' END)
    ELSE NULL END
  FROM public.recruitment_task t
  JOIN LATERAL (
    SELECT * FROM public.recruitment_reminder_command x
    WHERE x.owner_id=t.owner_id AND x.payload->>'operation'='set-reminder' AND (x.payload->>'taskId')::uuid=t.id
    ORDER BY x.recorded_at DESC,x.id DESC LIMIT 1
  ) c ON true
  WHERE t.owner_id=auth.uid() AND t.id=p_task_id;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_reminder_command_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb:=NEW.payload; op text; t public.recruitment_task%ROWTYPE; old public.recruitment_reminder_command%ROWTYPE;
  fields text[]; local_at timestamp; instant_at timestamptz; zone text; offset_minutes integer; config jsonb;
BEGIN
  IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() OR NEW.request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Authentication required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
  IF EXISTS(SELECT 1 FROM public.recruitment_reminder_command WHERE owner_id=auth.uid() AND request_id=NEW.request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Intent already recorded'; END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'operation') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid intent'; END IF;
  op:=p->>'operation';
  fields:=CASE op WHEN 'set-reminder' THEN ARRAY['operation','taskId','expectedRevision','date','time','timeZone','offset'] WHEN 'acknowledge' THEN ARRAY['operation','taskId','configurationId'] WHEN 'disable' THEN ARRAY['operation','taskId','configurationId'] WHEN 'set-rule' THEN ARRAY['operation','intervalDays','timeZone'] WHEN 'disable-rule' THEN ARRAY['operation'] WHEN 'dismiss-suggestion' THEN ARRAY['operation','caseId','eventId','eventRevision'] ELSE NULL END;
  IF fields IS NULL OR EXISTS(SELECT 1 FROM unnest(fields) f WHERE NOT p ? f) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT(k=ANY(fields))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid intent fields'; END IF;
  IF op='set-reminder' THEN
    IF jsonb_typeof(p->'taskId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'expectedRevision') IS DISTINCT FROM 'number' OR p->>'expectedRevision' !~ '^[0-9]+$' OR (p->>'expectedRevision')::numeric>=2147483647 OR jsonb_typeof(p->'date') IS DISTINCT FROM 'string' OR p->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR jsonb_typeof(p->'time') IS DISTINCT FROM 'string' OR p->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR jsonb_typeof(p->'offset') IS DISTINCT FROM 'number' OR p->>'offset' !~ '^-?[0-9]+$' OR (p->>'offset')::numeric NOT BETWEEN -1440 AND 1440 OR jsonb_typeof(p->'timeZone') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid reminder'; END IF;
    zone:=p->>'timeZone'; offset_minutes:=(p->>'offset')::integer;
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=zone) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid time zone'; END IF;
    local_at:=((p->>'date')||' '||(p->>'time'))::timestamp;
    IF to_char(local_at,'YYYY-MM-DD HH24:MI')<>((p->>'date')||' '||(p->>'time')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid local time'; END IF;
    instant_at:=(local_at-pg_catalog.make_interval(mins=>offset_minutes)) AT TIME ZONE 'UTC';
    IF instant_at AT TIME ZONE zone IS DISTINCT FROM local_at THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid local offset'; END IF;
    SELECT * INTO t FROM public.recruitment_task WHERE owner_id=auth.uid() AND id=(p->>'taskId')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Task unavailable'; END IF;
    IF t.revision<>(p->>'expectedRevision')::integer THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Task changed'; END IF;
    IF t.status<>'Do zrobienia' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Task not open'; END IF;
    NEW.result:=jsonb_build_object('kind','created','instant',instant_at);
  ELSIF op IN ('acknowledge','disable') THEN
    IF jsonb_typeof(p->'taskId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'configurationId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid reminder'; END IF;
    SELECT public.recruitment_current_reminder((p->>'taskId')::uuid) INTO config;
    IF config IS NULL OR config->>'id' IS DISTINCT FROM ((p->>'configurationId')::uuid)::text THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Reminder changed'; END IF;
    IF op='acknowledge' AND config->>'state'<>'due' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Reminder not due'; END IF;
    NEW.result:=jsonb_build_object('kind','created');
  ELSIF op='set-rule' THEN
    IF jsonb_typeof(p->'intervalDays') IS DISTINCT FROM 'number' OR p->>'intervalDays' !~ '^[0-9]+$' OR (p->>'intervalDays')::numeric NOT BETWEEN 1 AND 2147483646 OR jsonb_typeof(p->'timeZone') IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p->>'timeZone') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid follow-up rule'; END IF;
    NEW.result:=jsonb_build_object('kind','created');
  ELSIF op='disable-rule' THEN
    NEW.result:=jsonb_build_object('kind','created');
  ELSE
    IF jsonb_typeof(p->'caseId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'eventId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'eventRevision') IS DISTINCT FROM 'number' OR p->>'eventRevision' !~ '^[0-9]+$' OR (p->>'eventRevision')::numeric>=2147483647 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid suggestion'; END IF;
    SELECT public.recruitment_current_followup((p->>'caseId')::uuid) INTO config;
    IF config IS NULL OR (config->>'eventId')::uuid IS DISTINCT FROM (p->>'eventId')::uuid OR (config->>'eventRevision')::integer IS DISTINCT FROM (p->>'eventRevision')::integer THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Suggestion changed'; END IF;
    NEW.result:=jsonb_build_object('kind','created');
  END IF;
  NEW.id:=gen_random_uuid(); NEW.recorded_at:=clock_timestamp(); RETURN NEW;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid intent values';
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_reminder_command_before_insert BEFORE INSERT ON public.recruitment_reminder_command FOR EACH ROW EXECUTE FUNCTION public.recruitment_reminder_command_guard();
--> statement-breakpoint
CREATE FUNCTION public.execute_recruitment_reminder_command(p_request_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE prior public.recruitment_reminder_command%ROWTYPE; result jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
  SELECT * INTO prior FROM public.recruitment_reminder_command WHERE owner_id=auth.uid() AND request_id=p_request_id;
  IF FOUND THEN
    IF prior.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent conflict'; END IF;
    RETURN prior.result || jsonb_build_object('kind','replayed');
  END IF;
  INSERT INTO public.recruitment_reminder_command(request_id,payload) VALUES(p_request_id,p_payload) RETURNING recruitment_reminder_command.result INTO result;
  RETURN result;
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_current_reminder(uuid),public.recruitment_reminder_command_guard(),public.execute_recruitment_reminder_command(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.recruitment_current_reminder(uuid),public.execute_recruitment_reminder_command(uuid,jsonb) TO authenticated;
