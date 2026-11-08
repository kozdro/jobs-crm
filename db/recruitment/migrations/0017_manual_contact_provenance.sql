CREATE TABLE "recruitment_manual_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"occurred_on" date,
	"event_id" uuid NOT NULL,
	CONSTRAINT "recruitment_manual_contact_owner_request_unique" UNIQUE("owner_id","request_id"),
	CONSTRAINT "recruitment_manual_contact_owner_event_unique" UNIQUE("owner_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "recruitment_manual_contact" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruitment_manual_contact" ADD CONSTRAINT "recruitment_manual_contact_case_fk" FOREIGN KEY ("owner_id","case_id") REFERENCES "public"."recruitment_case"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_manual_contact" ADD CONSTRAINT "recruitment_manual_contact_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."recruitment_case_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
REVOKE ALL ON public.recruitment_manual_contact FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT SELECT ON public.recruitment_manual_contact TO authenticated;
--> statement-breakpoint
GRANT INSERT(request_id,case_id,direction,occurred_on,event_id) ON public.recruitment_manual_contact TO authenticated;
--> statement-breakpoint
CREATE POLICY recruitment_manual_contact_read ON public.recruitment_manual_contact FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
--> statement-breakpoint
CREATE POLICY recruitment_manual_contact_insert ON public.recruitment_manual_contact FOR INSERT TO authenticated WITH CHECK (owner_id=(SELECT auth.uid()));
--> statement-breakpoint
CREATE FUNCTION public.recruitment_manual_contact_guard() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 -- An already committed, imported, or unknown-origin event cannot gain provenance.
 IF NEW.request_id IS NULL OR NEW.case_id IS NULL OR NEW.event_id IS NULL OR NEW.direction NOT IN ('inbound','outbound') OR NOT EXISTS(
  SELECT 1 FROM public.recruitment_case_event e WHERE e.owner_id=auth.uid() AND e.id=NEW.event_id AND e.request_id=NEW.request_id AND e.case_id=NEW.case_id AND e.kind='contact' AND e.direction=NEW.direction AND e.occurred_on IS NOT DISTINCT FROM NEW.occurred_on AND e.xmin=pg_catalog.pg_current_xact_id()::text::xid
 ) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Contact provenance unavailable'; END IF;
 NEW.id:=gen_random_uuid(); RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_manual_contact_before_insert BEFORE INSERT ON public.recruitment_manual_contact FOR EACH ROW EXECUTE FUNCTION public.recruitment_manual_contact_guard();
--> statement-breakpoint
CREATE FUNCTION public.record_manual_recruitment_contact(p_request_id uuid,p_case_id uuid,p_direction text,p_occurred_on date DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 result:=public.record_recruitment_case_event(p_request_id,p_case_id,'contact',p_direction,p_occurred_on);
 IF result->>'kind'='created' THEN
   INSERT INTO public.recruitment_manual_contact(request_id,case_id,direction,occurred_on,event_id)
     VALUES(p_request_id,p_case_id,p_direction,p_occurred_on,(result->'event'->>'id')::uuid);
 END IF;
 -- Replays of pre-existing events remain replays and never gain provenance.
 RETURN result;
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_manual_contact_guard(), public.record_manual_recruitment_contact(uuid,uuid,text,date) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_manual_recruitment_contact(uuid,uuid,text,date) TO authenticated;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.create_recruitment_case_atomic(
  p_request_id uuid,
  p_intent jsonb,
  p_duplicate_acknowledgement jsonb DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_owner uuid := auth.uid();
  v_title text;
  v_description text;
  v_source_url text;
  v_action jsonb;
  v_kind text;
  v_event_kind text;
  v_direction text;
  v_occurred_on date;
  v_intent jsonb;
  v_intent_fingerprint text;
  v_matchset_fingerprint text;
  v_ack_intent_fingerprint text;
  v_ack_matchset_fingerprint text;
  v_ack_create_separate boolean;
  v_match_count integer := 0;
  v_matches jsonb := '[]'::jsonb;
  v_existing_receipt jsonb;
  v_existing_case public.recruitment_case%ROWTYPE;
  v_created_case public.recruitment_case%ROWTYPE;
  v_created_event public.recruitment_case_event%ROWTYPE;
  v_receipt jsonb;
  v_recorded_at timestamptz;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  IF p_request_id IS NULL OR pg_catalog.jsonb_typeof(p_intent) IS DISTINCT FROM 'object'
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_intent) AS k WHERE k NOT IN ('title','description','sourceUrl','action'))
    OR pg_catalog.jsonb_typeof(p_intent->'title') IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(p_intent->'action') IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid atomic capture intent';
  END IF;

  v_title := public.recruitment_trim(p_intent->>'title');
  IF v_title IS NULL OR pg_catalog.char_length(v_title) NOT BETWEEN 1 AND 160
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid atomic capture title'; END IF;

  IF p_intent ? 'description' AND pg_catalog.jsonb_typeof(p_intent->'description') NOT IN ('string','null') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid atomic capture description';
  END IF;
  v_description := NULLIF(public.recruitment_trim(p_intent->>'description'), '');
  IF v_description IS NOT NULL AND pg_catalog.char_length(v_description) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid atomic capture description';
  END IF;

  IF p_intent ? 'sourceUrl' AND pg_catalog.jsonb_typeof(p_intent->'sourceUrl') NOT IN ('string','null') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid atomic capture source URL';
  END IF;
  IF p_intent->>'sourceUrl' IS NOT NULL AND public.recruitment_trim(p_intent->>'sourceUrl') <> '' THEN
    v_source_url := public.recruitment_source_url(public.recruitment_trim(p_intent->>'sourceUrl'));
    IF v_source_url IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid atomic capture source URL'; END IF;
  END IF;

  v_action := p_intent->'action';
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(v_action) AS k WHERE k NOT IN ('kind','occurredOn','factConfirmed'))
    OR pg_catalog.jsonb_typeof(v_action->'kind') IS DISTINCT FROM 'string'
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid atomic capture action'; END IF;
  v_kind := v_action->>'kind';
  IF v_kind = 'save_only' THEN
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(v_action)) <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Save-only action contains fact fields';
    END IF;
    v_action := pg_catalog.jsonb_build_object('kind','save_only');
  ELSIF v_kind IN ('application','contact_inbound','contact_outbound') THEN
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(v_action)) <> 3
      OR pg_catalog.jsonb_typeof(v_action->'factConfirmed') IS DISTINCT FROM 'boolean'
      OR v_action->'factConfirmed' IS DISTINCT FROM 'true'::jsonb
      OR pg_catalog.jsonb_typeof(v_action->'occurredOn') NOT IN ('string','null')
    THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Action requires explicit factual confirmation and a day'; END IF;
    IF v_action->>'occurredOn' IS NOT NULL THEN
      IF v_action->>'occurredOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid action date';
      END IF;
      BEGIN
        v_occurred_on := (v_action->>'occurredOn')::date;
      EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid atomic capture values';
      END;
      IF pg_catalog.to_char(v_occurred_on,'YYYY-MM-DD') <> v_action->>'occurredOn'
        OR v_occurred_on > (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date
      THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid action date'; END IF;
    ELSE
      v_occurred_on := NULL;
    END IF;
    v_event_kind := CASE WHEN v_kind = 'application' THEN 'application' ELSE 'contact' END;
    v_direction := CASE WHEN v_kind = 'contact_inbound' THEN 'inbound' WHEN v_kind = 'contact_outbound' THEN 'outbound' ELSE NULL END;
    v_action := pg_catalog.jsonb_build_object('kind',v_kind,'occurredOn',v_occurred_on,'factConfirmed',true);
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported atomic capture action';
  END IF;

  v_intent := pg_catalog.jsonb_build_object(
    'title',v_title,
    'description',v_description,
    'sourceUrl',v_source_url,
    'action',v_action
  );
  v_intent_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object('contractVersion',1,'intent',v_intent)::text
  );

  -- Share the owner lock with legacy create and event commands.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 76211));

  SELECT r.receipt INTO v_existing_receipt
    FROM recruitment_private.recruitment_case_capture_receipt AS r
    WHERE r.owner_id = v_owner AND r.request_id = p_request_id;
  IF FOUND THEN
    IF (SELECT r.intent FROM recruitment_private.recruitment_case_capture_receipt AS r
        WHERE r.owner_id = v_owner AND r.request_id = p_request_id) IS DISTINCT FROM v_intent
    THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Save intent payload conflict'; END IF;
    RETURN pg_catalog.jsonb_build_object('kind','replayed','receipt',v_existing_receipt);
  END IF;

  -- A legacy save-only key cannot be upgraded into a fact. Legacy RPCs remain
  -- available and can still replay their own case; this v1 command conflicts.
  IF EXISTS (SELECT 1 FROM public.recruitment_case c WHERE c.owner_id = v_owner AND c.request_id = p_request_id)
    OR EXISTS (SELECT 1 FROM public.recruitment_case_event e WHERE e.owner_id = v_owner AND e.request_id = p_request_id)
  THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Request identifier already belongs to a legacy command'; END IF;

  SELECT pg_catalog.count(*)::integer,
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(c.id::text, ',' ORDER BY c.id),''))
    INTO v_match_count, v_matchset_fingerprint
    FROM public.recruitment_case AS c
    WHERE c.owner_id = v_owner AND
      (c.title = v_title OR (v_source_url IS NOT NULL
        AND pg_catalog.md5(c.source_url) = pg_catalog.md5(v_source_url)
        AND c.source_url = v_source_url));

  SELECT COALESCE(pg_catalog.jsonb_agg(candidate.projection ORDER BY candidate.created_at DESC,candidate.id DESC),'[]'::jsonb)
    INTO v_matches
    FROM (
      SELECT pg_catalog.to_jsonb(c) - 'owner_id' - 'request_id' AS projection,c.created_at,c.id
      FROM public.recruitment_case AS c
      WHERE c.owner_id = v_owner AND (c.title = v_title OR (v_source_url IS NOT NULL
        AND pg_catalog.md5(c.source_url) = pg_catalog.md5(v_source_url)
        AND c.source_url = v_source_url))
      ORDER BY c.created_at DESC,c.id DESC LIMIT 20
    ) AS candidate;

  IF p_duplicate_acknowledgement IS NOT NULL THEN
    IF pg_catalog.jsonb_typeof(p_duplicate_acknowledgement) IS DISTINCT FROM 'object'
      OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_duplicate_acknowledgement) AS k WHERE k NOT IN ('intentFingerprint','matchSetFingerprint','createSeparateCase'))
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_duplicate_acknowledgement)) <> 3
      OR pg_catalog.jsonb_typeof(p_duplicate_acknowledgement->'intentFingerprint') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(p_duplicate_acknowledgement->'matchSetFingerprint') IS DISTINCT FROM 'string'
      OR p_duplicate_acknowledgement->'createSeparateCase' IS DISTINCT FROM 'true'::jsonb
    THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid duplicate acknowledgement'; END IF;
    v_ack_intent_fingerprint := p_duplicate_acknowledgement->>'intentFingerprint';
    v_ack_matchset_fingerprint := p_duplicate_acknowledgement->>'matchSetFingerprint';
    IF v_ack_intent_fingerprint IS DISTINCT FROM v_intent_fingerprint
      OR v_ack_matchset_fingerprint !~ '^[0-9a-f]{32}$'
    THEN RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Duplicate acknowledgement intent changed'; END IF;
    IF v_ack_matchset_fingerprint IS DISTINCT FROM v_matchset_fingerprint THEN
      RETURN pg_catalog.jsonb_build_object(
        'kind','duplicates','matches',v_matches,'hasMore',v_match_count > 20,
        'intentFingerprint',v_intent_fingerprint,'matchSetFingerprint',v_matchset_fingerprint
      );
    END IF;
  ELSIF v_match_count > 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'kind','duplicates','matches',v_matches,'hasMore',v_match_count > 20,
      'intentFingerprint',v_intent_fingerprint,'matchSetFingerprint',v_matchset_fingerprint
    );
  END IF;

  INSERT INTO public.recruitment_case(request_id,title,description,source_url)
    VALUES (p_request_id,v_title,v_description,v_source_url)
    ON CONFLICT ON CONSTRAINT recruitment_case_owner_request_unique DO NOTHING
    RETURNING * INTO v_created_case;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Request identifier already belongs to a case';
  END IF;

  IF v_event_kind IS NOT NULL THEN
    INSERT INTO public.recruitment_case_event(request_id,case_id,kind,direction,occurred_on)
      VALUES (p_request_id,v_created_case.id,v_event_kind,v_direction,v_occurred_on)
      RETURNING * INTO v_created_event;
    IF v_event_kind='contact' THEN
      INSERT INTO public.recruitment_manual_contact(request_id,case_id,direction,occurred_on,event_id)
        VALUES(p_request_id,v_created_case.id,v_direction,v_occurred_on,v_created_event.id);
    END IF;
  END IF;

  SELECT * INTO v_created_case FROM public.recruitment_case
    WHERE owner_id = v_owner AND id = v_created_case.id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Case unavailable'; END IF;
  v_recorded_at := pg_catalog.clock_timestamp();
  v_receipt := pg_catalog.jsonb_build_object(
    'requestId',p_request_id,
    'contractVersion',1,
    'intent',v_intent,
    'intentFingerprint',v_intent_fingerprint,
    'case',pg_catalog.to_jsonb(v_created_case) - 'owner_id' - 'request_id',
    'event',CASE WHEN v_event_kind IS NULL THEN NULL ELSE pg_catalog.to_jsonb(v_created_event) - 'owner_id' - 'request_id' END,
    'recordedAt',v_recorded_at
  );
  INSERT INTO recruitment_private.recruitment_case_capture_receipt(
    owner_id,request_id,contract_version,intent,intent_fingerprint,case_id,event_id,receipt,recorded_at
  ) VALUES (
    v_owner,p_request_id,1,v_intent,v_intent_fingerprint,v_created_case.id,
    CASE WHEN v_event_kind IS NULL THEN NULL ELSE v_created_event.id END,v_receipt,v_recorded_at
  );
  RETURN pg_catalog.jsonb_build_object('kind','created','receipt',v_receipt);
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_current_followup(p_case_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 WITH active_rule AS (
   SELECT payload FROM public.recruitment_reminder_command
   WHERE owner_id=auth.uid() AND payload->>'operation' IN ('set-rule','disable-rule')
   ORDER BY recorded_at DESC,id DESC LIMIT 1
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
CREATE FUNCTION public.read_recruitment_reminders() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object(
   'reminders', COALESCE((SELECT jsonb_agg(x.reminder ORDER BY x.reminder->>'instant',x.reminder->>'id') FROM (SELECT public.recruitment_current_reminder(t.id) reminder FROM public.recruitment_task t WHERE t.owner_id=auth.uid()) x WHERE x.reminder IS NOT NULL),'[]'::jsonb),
   'rule',(SELECT CASE WHEN r.payload->>'operation'='set-rule' THEN jsonb_build_object('intervalDays',(r.payload->>'intervalDays')::integer,'timeZone',r.payload->>'timeZone') ELSE NULL END FROM public.recruitment_reminder_command r WHERE r.owner_id=auth.uid() AND r.payload->>'operation' IN ('set-rule','disable-rule') ORDER BY r.recorded_at DESC,r.id DESC LIMIT 1),
   'suggestions', COALESCE((SELECT jsonb_agg(x.suggestion ORDER BY x.suggestion->>'dueOn',x.suggestion->>'caseId') FROM (SELECT public.recruitment_current_followup(c.id) suggestion FROM public.recruitment_case c WHERE c.owner_id=auth.uid()) x WHERE x.suggestion IS NOT NULL),'[]'::jsonb)
 );
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_current_followup(uuid),public.read_recruitment_reminders() FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.recruitment_current_followup(uuid),public.read_recruitment_reminders() TO authenticated;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
