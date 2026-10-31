ALTER TABLE "recruitment_case" DROP CONSTRAINT "recruitment_case_3a_status";--> statement-breakpoint
ALTER TABLE "recruitment_case_event" DROP CONSTRAINT "recruitment_case_event_kind_direction_valid";--> statement-breakpoint
ALTER TABLE "recruitment_case" ADD COLUMN "current_stage" text;--> statement-breakpoint
ALTER TABLE "recruitment_case" ADD COLUMN "stage_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitment_case_event" ADD COLUMN "stage_name" text;--> statement-breakpoint
ALTER TABLE "recruitment_case_event" ADD COLUMN "previous_stage" text;--> statement-breakpoint
ALTER TABLE "recruitment_case_event" ADD COLUMN "expected_stage_version" integer;--> statement-breakpoint
ALTER TABLE "recruitment_case" ADD CONSTRAINT "recruitment_case_3b_status_stage" CHECK (("recruitment_case"."status" IN ('Zapisane', 'Kontakt rozpoczęty') AND "recruitment_case"."current_stage" IS NULL AND "recruitment_case"."stage_version" = 0) OR ("recruitment_case"."status" = 'W rekrutacji' AND "recruitment_case"."current_stage" IS NOT NULL AND char_length("recruitment_case"."current_stage") BETWEEN 1 AND 160 AND "recruitment_case"."current_stage" = public.recruitment_trim("recruitment_case"."current_stage") AND "recruitment_case"."stage_version" >= 1));--> statement-breakpoint
ALTER TABLE "recruitment_case_event" ADD CONSTRAINT "recruitment_case_event_3b_payload_valid" CHECK ((("recruitment_case_event"."kind" = 'application' AND "recruitment_case_event"."direction" IS NULL) OR ("recruitment_case_event"."kind" = 'contact' AND "recruitment_case_event"."direction" IS NOT NULL AND "recruitment_case_event"."direction" IN ('inbound', 'outbound'))) AND "recruitment_case_event"."stage_name" IS NULL AND "recruitment_case_event"."previous_stage" IS NULL AND "recruitment_case_event"."expected_stage_version" IS NULL OR ("recruitment_case_event"."kind" IN ('invitation', 'stage-change') AND "recruitment_case_event"."direction" IS NULL AND "recruitment_case_event"."stage_name" IS NOT NULL AND char_length("recruitment_case_event"."stage_name") BETWEEN 1 AND 160 AND "recruitment_case_event"."stage_name" = public.recruitment_trim("recruitment_case_event"."stage_name") AND "recruitment_case_event"."expected_stage_version" IS NOT NULL AND "recruitment_case_event"."expected_stage_version" BETWEEN 0 AND 2147483646 AND ("recruitment_case_event"."previous_stage" IS NULL OR (char_length("recruitment_case_event"."previous_stage") BETWEEN 1 AND 160 AND "recruitment_case_event"."previous_stage" = public.recruitment_trim("recruitment_case_event"."previous_stage")))));--> statement-breakpoint
-- DEC-055: existing rows remain unqualified, with no fabricated stage or history.
GRANT INSERT (stage_name, expected_stage_version) ON public.recruitment_case_event TO authenticated;
--> statement-breakpoint
-- INVOKER AFTER INSERT effects need these column grants; the invariant guard
-- rejects all depth-one direct writes, including writes through the Data API.
GRANT UPDATE (current_stage, stage_version) ON public.recruitment_case TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.recruitment_case_guard_lifecycle()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'Zapisane' OR NEW.current_stage IS NOT NULL OR NEW.stage_version IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'New case must be saved only';
    END IF;
    RETURN NEW;
  END IF;
  IF pg_catalog.pg_trigger_depth() <> 2 OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Lifecycle change requires a real fact';
  END IF;
  IF OLD.status = 'Zapisane' AND NEW.status = 'Kontakt rozpoczęty'
    AND NEW.current_stage IS NULL AND NEW.stage_version = 0
    AND EXISTS (SELECT 1 FROM public.recruitment_case_event e
      WHERE e.case_id = OLD.id AND e.owner_id = OLD.owner_id AND e.kind IN ('application','contact')) THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('Zapisane','Kontakt rozpoczęty','W rekrutacji') AND NEW.status = 'W rekrutacji'
    AND NEW.stage_version = OLD.stage_version + 1
    AND EXISTS (SELECT 1 FROM public.recruitment_case_event e
      WHERE e.case_id = OLD.id AND e.owner_id = OLD.owner_id
        AND (e.kind = 'invitation' OR (e.kind = 'stage-change' AND OLD.status = 'W rekrutacji'))
        AND e.expected_stage_version = OLD.stage_version
        AND e.previous_stage IS NOT DISTINCT FROM OLD.current_stage
        AND e.stage_name = NEW.current_stage) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Lifecycle change requires a real fact';
END;
$fn$;
--> statement-breakpoint
DROP TRIGGER recruitment_case_guard_status ON public.recruitment_case;
--> statement-breakpoint
CREATE TRIGGER recruitment_case_guard_status BEFORE UPDATE OF status,current_stage,stage_version ON public.recruitment_case
FOR EACH ROW EXECUTE FUNCTION public.recruitment_case_guard_lifecycle();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.recruitment_case_event_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v_case public.recruitment_case%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.owner_id::text, 76211));
  SELECT * INTO v_case FROM public.recruitment_case c
    WHERE c.id = NEW.case_id AND c.owner_id = NEW.owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Case unavailable'; END IF;
  IF v_case.status NOT IN ('Zapisane','Kontakt rozpoczęty','W rekrutacji') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported lifecycle state';
  END IF;
  IF (NEW.kind = 'application' AND NEW.direction IS NULL)
      OR (NEW.kind = 'contact' AND NEW.direction IN ('inbound','outbound')) THEN
    IF NEW.stage_name IS NOT NULL OR NEW.previous_stage IS NOT NULL OR NEW.expected_stage_version IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid event input';
    END IF;
  ELSIF NEW.kind IN ('invitation','stage-change') AND NEW.direction IS NULL THEN
    IF NEW.stage_name IS NULL OR pg_catalog.char_length(NEW.stage_name) NOT BETWEEN 1 AND 160
      OR NEW.stage_name IS DISTINCT FROM public.recruitment_trim(NEW.stage_name)
      OR NEW.expected_stage_version IS NULL OR NEW.expected_stage_version NOT BETWEEN 0 AND 2147483646
      OR NEW.previous_stage IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid stage input';
    END IF;
    IF NEW.kind = 'stage-change' AND v_case.status <> 'W rekrutacji' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Stage change requires active recruitment';
    END IF;
    IF NEW.expected_stage_version <> v_case.stage_version THEN
      RAISE EXCEPTION USING ERRCODE = 'PT412', MESSAGE = 'Stage changed; refresh before confirming again';
    END IF;
    -- A snapshot, not a client-controlled historical value or mutable reference.
    NEW.previous_stage := v_case.current_stage;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid event input';
  END IF;
  IF NEW.occurred_on IS NOT NULL AND (NEW.occurred_on < DATE '0001-01-01'
      OR NEW.occurred_on > (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid event date';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.recruitment_case_event_apply()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF NEW.kind IN ('invitation','stage-change') THEN
    UPDATE public.recruitment_case SET status = 'W rekrutacji', current_stage = NEW.stage_name,
      stage_version = stage_version + 1
      WHERE id = NEW.case_id AND owner_id = NEW.owner_id;
  ELSE
    UPDATE public.recruitment_case SET status = 'Kontakt rozpoczęty'
      WHERE id = NEW.case_id AND owner_id = NEW.owner_id AND status = 'Zapisane';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.record_recruitment_case_stage_event(
  p_request_id uuid,
  p_case_id uuid,
  p_kind text,
  p_stage_name text,
  p_expected_stage_version integer,
  p_occurred_on date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_owner uuid := auth.uid();
  v_stage text := public.recruitment_trim(p_stage_name);
  v_existing public.recruitment_case_event%ROWTYPE;
  v_created public.recruitment_case_event%ROWTYPE;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required'; END IF;
  IF p_request_id IS NULL OR p_case_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('invitation','stage-change')
    OR v_stage IS NULL OR pg_catalog.char_length(v_stage) NOT BETWEEN 1 AND 160
    OR p_expected_stage_version IS NULL OR p_expected_stage_version NOT BETWEEN 0 AND 2147483646
    OR (p_occurred_on IS NOT NULL AND (p_occurred_on < DATE '0001-01-01'
      OR p_occurred_on > (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid stage event input';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 76211));
  -- Resolve an existing intention before checking the case's newer revision.
  SELECT * INTO v_existing FROM public.recruitment_case_event
    WHERE owner_id = v_owner AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.case_id IS DISTINCT FROM p_case_id OR v_existing.kind IS DISTINCT FROM p_kind
      OR v_existing.stage_name IS DISTINCT FROM v_stage OR v_existing.expected_stage_version IS DISTINCT FROM p_expected_stage_version
      OR v_existing.occurred_on IS DISTINCT FROM p_occurred_on THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Save intent payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object('kind','replayed','event',pg_catalog.to_jsonb(v_existing) - 'owner_id' - 'request_id');
  END IF;
  INSERT INTO public.recruitment_case_event(request_id,case_id,kind,stage_name,expected_stage_version,occurred_on)
    VALUES (p_request_id,p_case_id,p_kind,v_stage,p_expected_stage_version,p_occurred_on)
    RETURNING * INTO v_created;
  RETURN pg_catalog.jsonb_build_object('kind','created','event',pg_catalog.to_jsonb(v_created) - 'owner_id' - 'request_id');
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_recruitment_case_stage_event(uuid,uuid,text,text,integer,date) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_recruitment_case_stage_event(uuid,uuid,text,text,integer,date) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
