CREATE SCHEMA IF NOT EXISTS recruitment_private;
--> statement-breakpoint
COMMENT ON SCHEMA recruitment_private IS 'Internal non-Data-API receipts for atomic RecruitmentCase commands.';
--> statement-breakpoint
REVOKE ALL ON SCHEMA recruitment_private FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT USAGE ON SCHEMA recruitment_private TO authenticated;
--> statement-breakpoint
CREATE TABLE "recruitment_private"."recruitment_case_capture_receipt" (
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"contract_version" integer NOT NULL,
	"intent" jsonb NOT NULL,
	"intent_fingerprint" text NOT NULL,
	"case_id" uuid NOT NULL,
	"event_id" uuid,
	"receipt" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_case_capture_receipt_owner_request_unique" UNIQUE("owner_id","request_id"),
	CONSTRAINT "recruitment_case_capture_receipt_contract_valid" CHECK ("recruitment_private"."recruitment_case_capture_receipt"."contract_version" = 1 AND "recruitment_private"."recruitment_case_capture_receipt"."intent_fingerprint" ~ '^[0-9a-f]{32}$')
);
--> statement-breakpoint
ALTER TABLE "recruitment_private"."recruitment_case_capture_receipt" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruitment_private"."recruitment_case_capture_receipt" ADD CONSTRAINT "recruitment_case_capture_receipt_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_private"."recruitment_case_capture_receipt" ADD CONSTRAINT "recruitment_case_capture_receipt_owned_case_fk" FOREIGN KEY ("owner_id","case_id") REFERENCES "public"."recruitment_case"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_private"."recruitment_case_capture_receipt" ADD CONSTRAINT "recruitment_case_capture_receipt_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."recruitment_case_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recruitment_case_capture_receipt_owner_case_idx" ON "recruitment_private"."recruitment_case_capture_receipt" USING btree ("owner_id","case_id");
--> statement-breakpoint
REVOKE ALL ON TABLE recruitment_private.recruitment_case_capture_receipt FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE recruitment_private.recruitment_case_capture_receipt TO authenticated;
--> statement-breakpoint
CREATE POLICY recruitment_case_capture_receipt_owner_read
  ON recruitment_private.recruitment_case_capture_receipt
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
CREATE POLICY recruitment_case_capture_receipt_owner_insert
  ON recruitment_private.recruitment_case_capture_receipt
  FOR INSERT TO authenticated WITH CHECK (
    (SELECT auth.uid()) = owner_id
    AND receipt->>'requestId' = request_id::text
    AND receipt->>'contractVersion' = contract_version::text
    AND receipt->'intent' = intent
    AND receipt->>'intentFingerprint' = intent_fingerprint
    AND receipt->'case'->>'id' = case_id::text
    AND EXISTS (
      SELECT 1 FROM public.recruitment_case c
      WHERE c.owner_id = recruitment_private.recruitment_case_capture_receipt.owner_id
        AND c.id = recruitment_private.recruitment_case_capture_receipt.case_id
    )
    AND (
      (event_id IS NULL AND receipt->'event' = 'null'::jsonb)
      OR (event_id IS NOT NULL AND receipt->'event'->>'id' = event_id::text
        AND EXISTS (
          SELECT 1 FROM public.recruitment_case_event e
          WHERE e.owner_id = recruitment_private.recruitment_case_capture_receipt.owner_id
            AND e.case_id = recruitment_private.recruitment_case_capture_receipt.case_id
            AND e.id = recruitment_private.recruitment_case_capture_receipt.event_id
        ))
    )
  );
--> statement-breakpoint
CREATE FUNCTION public.create_recruitment_case_atomic(
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
      v_occurred_on := (v_action->>'occurredOn')::date;
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
EXCEPTION
  WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid atomic capture values';
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_recruitment_case_atomic(uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_recruitment_case_atomic(uuid,jsonb,jsonb) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.get_recruitment_case_capture_receipt(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v_receipt jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid request identifier'; END IF;
  SELECT r.receipt INTO v_receipt FROM recruitment_private.recruitment_case_capture_receipt AS r
    WHERE r.owner_id = auth.uid() AND r.request_id = p_request_id;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('kind','not-found'); END IF;
  RETURN pg_catalog.jsonb_build_object('kind','receipt','receipt',v_receipt);
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_recruitment_case_capture_receipt(uuid) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_recruitment_case_capture_receipt(uuid) TO authenticated;
--> statement-breakpoint
-- Legacy RPCs may replay an atomic save-only receipt as the original case,
-- but cannot reinterpret an atomic fact intent as save-only.
CREATE OR REPLACE FUNCTION public.create_recruitment_case(
  p_request_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_source_url text DEFAULT NULL,
  p_allow_duplicate boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_owner uuid := auth.uid();
  v_title text := public.recruitment_trim(p_title);
  v_description text := NULLIF(public.recruitment_trim(p_description), '');
  v_source_url text;
  v_existing public.recruitment_case%ROWTYPE;
  v_created public.recruitment_case%ROWTYPE;
  v_matches jsonb;
  v_match_count integer;
  v_atomic_action text;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required'; END IF;
  IF p_request_id IS NULL OR v_title IS NULL OR pg_catalog.char_length(v_title) NOT BETWEEN 1 AND 160
    OR (v_description IS NOT NULL AND pg_catalog.char_length(v_description) > 2000)
    OR p_allow_duplicate IS NULL
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid case input'; END IF;
  IF p_source_url IS NOT NULL AND public.recruitment_trim(p_source_url) <> '' THEN
    v_source_url := public.recruitment_source_url(public.recruitment_trim(p_source_url));
    IF v_source_url IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid source URL'; END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 76211));
  SELECT r.intent->'action'->>'kind' INTO v_atomic_action
    FROM recruitment_private.recruitment_case_capture_receipt AS r
    WHERE r.owner_id = v_owner AND r.request_id = p_request_id;
  IF FOUND AND v_atomic_action IS DISTINCT FROM 'save_only' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Request identifier belongs to a factual atomic capture';
  END IF;

  SELECT * INTO v_existing FROM public.recruitment_case
    WHERE owner_id = v_owner AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.title IS DISTINCT FROM v_title OR v_existing.description IS DISTINCT FROM v_description
      OR v_existing.source_url IS DISTINCT FROM v_source_url THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Save intent payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object('kind', 'replayed', 'case', pg_catalog.to_jsonb(v_existing) - 'owner_id' - 'request_id');
  END IF;

  IF NOT p_allow_duplicate THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(candidate.projection ORDER BY candidate.created_at DESC, candidate.id DESC)
      FILTER (WHERE candidate.position <= 20), '[]'::jsonb), pg_catalog.count(*)::integer
      INTO v_matches, v_match_count
      FROM (
        SELECT pg_catalog.to_jsonb(c) - 'owner_id' - 'request_id' AS projection, c.created_at, c.id,
          pg_catalog.row_number() OVER (ORDER BY c.created_at DESC, c.id DESC) AS position
        FROM public.recruitment_case AS c WHERE c.owner_id = v_owner AND
          (c.title = v_title OR (v_source_url IS NOT NULL AND pg_catalog.md5(c.source_url) = pg_catalog.md5(v_source_url) AND c.source_url = v_source_url))
        ORDER BY c.created_at DESC, c.id DESC LIMIT 21
      ) AS candidate;
    IF v_match_count > 0 THEN
      SELECT * INTO v_existing FROM public.recruitment_case
        WHERE owner_id = v_owner AND request_id = p_request_id;
      IF FOUND THEN
        IF v_existing.title IS DISTINCT FROM v_title OR v_existing.description IS DISTINCT FROM v_description
          OR v_existing.source_url IS DISTINCT FROM v_source_url THEN
          RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Save intent payload conflict';
        END IF;
        RETURN pg_catalog.jsonb_build_object('kind', 'replayed', 'case', pg_catalog.to_jsonb(v_existing) - 'owner_id' - 'request_id');
      END IF;
      RETURN pg_catalog.jsonb_build_object('kind', 'duplicates', 'matches', v_matches, 'hasMore', v_match_count > 20);
    END IF;
  END IF;

  INSERT INTO public.recruitment_case (request_id, title, description, source_url)
    VALUES (p_request_id, v_title, v_description, v_source_url)
    ON CONFLICT ON CONSTRAINT recruitment_case_owner_request_unique DO NOTHING
    RETURNING * INTO v_created;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('kind', 'created', 'case', pg_catalog.to_jsonb(v_created) - 'owner_id' - 'request_id');
  END IF;
  SELECT * INTO v_existing FROM public.recruitment_case
    WHERE owner_id = v_owner AND request_id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Retry the same save intent'; END IF;
  IF v_existing.title IS DISTINCT FROM v_title OR v_existing.description IS DISTINCT FROM v_description
    OR v_existing.source_url IS DISTINCT FROM v_source_url THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Save intent payload conflict';
  END IF;
  RETURN pg_catalog.jsonb_build_object('kind', 'replayed', 'case', pg_catalog.to_jsonb(v_existing) - 'owner_id' - 'request_id');
END;
$fn$;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
