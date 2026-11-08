ALTER TABLE "recruitment_reminder_command" ADD COLUMN "order_no" integer;--> statement-breakpoint
WITH ranked AS (SELECT id,row_number() OVER (PARTITION BY owner_id ORDER BY recorded_at,id)::integer AS n FROM public.recruitment_reminder_command)
UPDATE public.recruitment_reminder_command c SET order_no=ranked.n FROM ranked WHERE c.id=ranked.id;--> statement-breakpoint
ALTER TABLE public.recruitment_reminder_command ALTER COLUMN order_no SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitment_reminder_command" ADD CONSTRAINT "recruitment_reminder_command_owner_order_unique" UNIQUE("owner_id","order_no");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.recruitment_current_reminder(p_task_id uuid) RETURNS jsonb
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
    ORDER BY x.order_no DESC LIMIT 1
  ) c ON true
  WHERE t.owner_id=auth.uid() AND t.id=p_task_id;
$fn$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.recruitment_reminder_command_guard() RETURNS trigger
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
  SELECT COALESCE(max(c.order_no),0)+1 INTO NEW.order_no FROM public.recruitment_reminder_command c WHERE c.owner_id=auth.uid();
  NEW.id:=gen_random_uuid(); NEW.recorded_at:=clock_timestamp(); RETURN NEW;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid intent values';
END;
$fn$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.recruitment_current_followup(p_case_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 WITH active_rule AS (
   SELECT payload FROM public.recruitment_reminder_command
   WHERE owner_id=auth.uid() AND payload->>'operation' IN ('set-rule','disable-rule')
   ORDER BY order_no DESC LIMIT 1
 ), latest AS (
   SELECT e.* FROM public.recruitment_case_event_current e
   WHERE e.owner_id=auth.uid() AND e.case_id=p_case_id AND e.kind='contact' AND e.direction='outbound' AND e.occurred_on IS NOT NULL AND NOT e.voided
   ORDER BY e.occurred_on DESC,e.recorded_at DESC,e.id DESC LIMIT 1
 )
 SELECT jsonb_build_object('caseId',c.id,'caseTitle',c.title,'eventId',e.id,'eventRevision',e.revision,'occurredOn',e.occurred_on,'dueOn',e.occurred_on+(r.payload->>'intervalDays')::integer)
 FROM public.recruitment_case c CROSS JOIN latest e CROSS JOIN active_rule r
 WHERE c.owner_id=auth.uid() AND c.id=p_case_id AND c.status IN ('Zapisane','Kontakt rozpoczęty','W rekrutacji')
   AND r.payload->>'operation'='set-rule'
   AND ((CURRENT_TIMESTAMP AT TIME ZONE (r.payload->>'timeZone'))::date-e.occurred_on)>=(r.payload->>'intervalDays')::integer
   AND EXISTS(SELECT 1 FROM public.recruitment_manual_contact m WHERE m.owner_id=c.owner_id AND m.case_id=c.id AND m.event_id=e.id)
   AND NOT EXISTS(SELECT 1 FROM public.recruitment_reminder_command d WHERE d.owner_id=c.owner_id AND d.payload->>'operation'='dismiss-suggestion' AND (d.payload->>'caseId')::uuid=c.id AND (d.payload->>'eventId')::uuid=e.id AND (d.payload->>'eventRevision')::integer=e.revision);
$fn$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.read_recruitment_reminders() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object(
   'reminders', COALESCE((SELECT jsonb_agg(x.reminder ORDER BY x.reminder->>'instant',x.reminder->>'id') FROM (SELECT public.recruitment_current_reminder(t.id) reminder FROM public.recruitment_task t WHERE t.owner_id=auth.uid()) x WHERE x.reminder IS NOT NULL),'[]'::jsonb),
   'rule',(SELECT CASE WHEN r.payload->>'operation'='set-rule' THEN jsonb_build_object('intervalDays',(r.payload->>'intervalDays')::integer,'timeZone',r.payload->>'timeZone') ELSE NULL END FROM public.recruitment_reminder_command r WHERE r.owner_id=auth.uid() AND r.payload->>'operation' IN ('set-rule','disable-rule') ORDER BY r.order_no DESC LIMIT 1),
   'suggestions', COALESCE((SELECT jsonb_agg(x.suggestion ORDER BY x.suggestion->>'dueOn',x.suggestion->>'caseId') FROM (SELECT public.recruitment_current_followup(c.id) suggestion FROM public.recruitment_case c WHERE c.owner_id=auth.uid()) x WHERE x.suggestion IS NOT NULL),'[]'::jsonb)
 );
$fn$;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
