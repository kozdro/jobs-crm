CREATE TABLE "recruitment_case_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"direction" text,
	"occurred_on" date,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_case_event_owner_request_unique" UNIQUE("owner_id","request_id"),
	CONSTRAINT "recruitment_case_event_kind_direction_valid" CHECK (("recruitment_case_event"."kind" = 'application' AND "recruitment_case_event"."direction" IS NULL) OR ("recruitment_case_event"."kind" = 'contact' AND "recruitment_case_event"."direction" IS NOT NULL AND "recruitment_case_event"."direction" IN ('inbound', 'outbound'))),
	CONSTRAINT "recruitment_case_event_date_valid" CHECK ("recruitment_case_event"."occurred_on" IS NULL OR ("recruitment_case_event"."occurred_on" >= DATE '0001-01-01' AND "recruitment_case_event"."occurred_on" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date))
);
--> statement-breakpoint
ALTER TABLE "recruitment_case_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruitment_case" DROP CONSTRAINT "recruitment_case_saved_only";--> statement-breakpoint
ALTER TABLE "recruitment_case" ADD CONSTRAINT "recruitment_case_owner_id_unique" UNIQUE("owner_id","id");--> statement-breakpoint
ALTER TABLE "recruitment_case_event" ADD CONSTRAINT "recruitment_case_event_owned_case_fk" FOREIGN KEY ("owner_id","case_id") REFERENCES "public"."recruitment_case"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recruitment_case_event_timeline_idx" ON "recruitment_case_event" USING btree ("owner_id","case_id","occurred_on" DESC NULLS LAST,"recorded_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "recruitment_case" ADD CONSTRAINT "recruitment_case_3a_status" CHECK ("recruitment_case"."status" IN ('Zapisane', 'Kontakt rozpoczęty'));
--> statement-breakpoint
-- Existing rows are deliberately not backfilled into business facts.
REVOKE ALL ON TABLE public.recruitment_case_event FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT SELECT ON TABLE public.recruitment_case_event TO authenticated;
--> statement-breakpoint
GRANT INSERT (request_id,case_id,kind,direction,occurred_on) ON public.recruitment_case_event TO authenticated;
--> statement-breakpoint
CREATE POLICY recruitment_case_event_select_owner ON public.recruitment_case_event
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
CREATE POLICY recruitment_case_event_insert_owner ON public.recruitment_case_event
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id AND EXISTS (
    SELECT 1 FROM public.recruitment_case c WHERE c.id = recruitment_case_event.case_id AND c.owner_id = recruitment_case_event.owner_id
  ));
--> statement-breakpoint
-- This one writable column is still guarded by an invariant trigger. Clients
-- cannot bypass the fact/status transaction by calling UPDATE directly.
GRANT UPDATE (status) ON public.recruitment_case TO authenticated;
--> statement-breakpoint
CREATE POLICY recruitment_case_update_owner ON public.recruitment_case
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
CREATE FUNCTION public.recruitment_case_guard_lifecycle()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'Zapisane' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'New case must be saved only';
    END IF;
    RETURN NEW;
  END IF;
  -- Only the AFTER INSERT fact trigger may enter this guard nested (depth 2).
  -- A historical event alone never authorizes a direct user UPDATE (depth 1).
  IF pg_catalog.pg_trigger_depth() <> 2
    OR OLD.status IS DISTINCT FROM 'Zapisane' OR NEW.status IS DISTINCT FROM 'Kontakt rozpoczęty'
    OR NEW.owner_id IS DISTINCT FROM auth.uid()
    OR NOT EXISTS (SELECT 1 FROM public.recruitment_case_event e WHERE e.case_id = OLD.id AND e.owner_id = OLD.owner_id)
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Lifecycle change requires a real fact'; END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_case_guard_lifecycle() FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE TRIGGER recruitment_case_guard_insert BEFORE INSERT ON public.recruitment_case
FOR EACH ROW EXECUTE FUNCTION public.recruitment_case_guard_lifecycle();
--> statement-breakpoint
CREATE TRIGGER recruitment_case_guard_status BEFORE UPDATE OF status ON public.recruitment_case
FOR EACH ROW EXECUTE FUNCTION public.recruitment_case_guard_lifecycle();
--> statement-breakpoint
CREATE FUNCTION public.recruitment_case_event_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v_status text;
BEGIN
  IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  -- Shared order with create RPC: owner serialization before the case row lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.owner_id::text, 76211));
  SELECT c.status INTO v_status FROM public.recruitment_case c
    WHERE c.id = NEW.case_id AND c.owner_id = NEW.owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Case unavailable'; END IF;
  IF v_status NOT IN ('Zapisane','Kontakt rozpoczęty') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported lifecycle state';
  END IF;
  -- Also on the direct Data API path: no client-controlled date/time or owner.
  IF (NEW.kind = 'application' AND NEW.direction IS NULL)
      OR (NEW.kind = 'contact' AND NEW.direction IN ('inbound','outbound')) THEN
    NULL;
  ELSE RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid event input'; END IF;
  IF NEW.occurred_on IS NOT NULL AND (NEW.occurred_on < DATE '0001-01-01'
      OR NEW.occurred_on > (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid event date';
  END IF;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_case_event_guard() FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE TRIGGER recruitment_case_event_before_insert BEFORE INSERT ON public.recruitment_case_event
FOR EACH ROW EXECUTE FUNCTION public.recruitment_case_event_guard();
--> statement-breakpoint
CREATE FUNCTION public.recruitment_case_event_apply()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  UPDATE public.recruitment_case SET status = 'Kontakt rozpoczęty'
    WHERE id = NEW.case_id AND owner_id = NEW.owner_id AND status = 'Zapisane';
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_case_event_apply() FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE TRIGGER recruitment_case_event_after_insert AFTER INSERT ON public.recruitment_case_event
FOR EACH ROW EXECUTE FUNCTION public.recruitment_case_event_apply();
--> statement-breakpoint
CREATE FUNCTION public.record_recruitment_case_event(
  p_request_id uuid,
  p_case_id uuid,
  p_kind text,
  p_direction text DEFAULT NULL,
  p_occurred_on date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_owner uuid := auth.uid();
  v_existing public.recruitment_case_event%ROWTYPE;
  v_created public.recruitment_case_event%ROWTYPE;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required'; END IF;
  IF p_request_id IS NULL OR p_case_id IS NULL OR p_kind IS NULL OR NOT (
    (p_kind = 'application' AND p_direction IS NULL) OR
    (p_kind = 'contact' AND p_direction IS NOT NULL AND p_direction IN ('inbound','outbound'))
  ) OR (p_occurred_on IS NOT NULL AND (p_occurred_on < DATE '0001-01-01'
    OR p_occurred_on > (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid event input';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 76211));
  SELECT * INTO v_existing FROM public.recruitment_case_event
    WHERE owner_id = v_owner AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.case_id IS DISTINCT FROM p_case_id OR v_existing.kind IS DISTINCT FROM p_kind
      OR v_existing.direction IS DISTINCT FROM p_direction OR v_existing.occurred_on IS DISTINCT FROM p_occurred_on THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Save intent payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object('kind','replayed','event',pg_catalog.to_jsonb(v_existing) - 'owner_id' - 'request_id');
  END IF;
  -- The trigger owns every path's atomic status effect, including direct INSERT.
  INSERT INTO public.recruitment_case_event(request_id,case_id,kind,direction,occurred_on)
    VALUES (p_request_id,p_case_id,p_kind,p_direction,p_occurred_on)
    RETURNING * INTO v_created;
  RETURN pg_catalog.jsonb_build_object('kind','created','event',pg_catalog.to_jsonb(v_created) - 'owner_id' - 'request_id');
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_recruitment_case_event(uuid,uuid,text,text,date) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_recruitment_case_event(uuid,uuid,text,text,date) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
