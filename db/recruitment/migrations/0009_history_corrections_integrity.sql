CREATE TABLE "recruitment_case_event_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"occurred_on" date,
	"direction" text,
	"stage_name" text,
	"expected_case_revision" integer NOT NULL,
	"expected_event_revision" integer NOT NULL,
	"revision" integer NOT NULL,
	"before_values" jsonb NOT NULL,
	"after_values" jsonb NOT NULL,
	"resulting_status" text NOT NULL,
	"resulting_stage" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_revision_owner_request_unique" UNIQUE("owner_id","request_id"),
	CONSTRAINT "recruitment_revision_event_version_unique" UNIQUE("event_id","revision"),
	CONSTRAINT "recruitment_revision_operation_valid" CHECK ("recruitment_case_event_revision"."operation" IN ('correct','void')),
	CONSTRAINT "recruitment_revision_versions_valid" CHECK ("recruitment_case_event_revision"."expected_case_revision" >= 0 AND "recruitment_case_event_revision"."expected_event_revision" >= 0 AND "recruitment_case_event_revision"."revision" = "recruitment_case_event_revision"."expected_event_revision" + 1)
);
--> statement-breakpoint
ALTER TABLE "recruitment_case_event_revision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruitment_case" DROP CONSTRAINT "recruitment_case_3b_status_stage";--> statement-breakpoint
ALTER TABLE "recruitment_case" ADD COLUMN "case_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recruitment_case_event" ADD COLUMN "applied_case_revision" integer;--> statement-breakpoint
ALTER TABLE "recruitment_case_event_revision" ADD CONSTRAINT "recruitment_revision_owned_case_fk" FOREIGN KEY ("owner_id","case_id") REFERENCES "public"."recruitment_case"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_case_event_revision" ADD CONSTRAINT "recruitment_revision_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."recruitment_case_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_case" ADD CONSTRAINT "recruitment_case_3b_status_stage" CHECK (("recruitment_case"."status" IN ('Zapisane', 'Kontakt rozpoczęty') AND "recruitment_case"."current_stage" IS NULL AND "recruitment_case"."stage_version" >= 0) OR ("recruitment_case"."status" = 'W rekrutacji' AND "recruitment_case"."current_stage" IS NOT NULL AND char_length("recruitment_case"."current_stage") BETWEEN 1 AND 160 AND "recruitment_case"."current_stage" = public.recruitment_trim("recruitment_case"."current_stage") AND "recruitment_case"."stage_version" >= 1));
--> statement-breakpoint
-- DEC-056: original facts are never edited; correction input columns alone are writable.
REVOKE ALL ON TABLE public.recruitment_case_event_revision FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT SELECT ON TABLE public.recruitment_case_event_revision TO authenticated;
--> statement-breakpoint
GRANT INSERT(request_id,case_id,event_id,operation,occurred_on,direction,stage_name,expected_case_revision,expected_event_revision) ON public.recruitment_case_event_revision TO authenticated;
--> statement-breakpoint
CREATE POLICY recruitment_revision_select_owner ON public.recruitment_case_event_revision FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
CREATE POLICY recruitment_revision_insert_owner ON public.recruitment_case_event_revision FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
GRANT UPDATE(case_revision) ON public.recruitment_case TO authenticated;
--> statement-breakpoint
-- SECURITY INVOKER: both the originals and every revision retain owner RLS.
CREATE VIEW public.recruitment_case_event_current WITH (security_invoker=true) AS
SELECT e.id,e.owner_id,e.request_id,e.case_id,e.kind,e.recorded_at,e.previous_stage,e.expected_stage_version,
  CASE WHEN r.id IS NULL THEN e.occurred_on ELSE (r.after_values->>'occurredOn')::date END AS occurred_on,
  CASE WHEN r.id IS NULL THEN e.direction ELSE r.after_values->>'direction' END AS direction,
  CASE WHEN r.id IS NULL THEN e.stage_name ELSE r.after_values->>'stageName' END AS stage_name,
  COALESCE(r.revision,0) AS revision, COALESCE((r.after_values->>'voided')::boolean,false) AS voided,
  jsonb_build_object('occurred_on',e.occurred_on,'direction',e.direction,'stage_name',e.stage_name) AS original
FROM public.recruitment_case_event e
LEFT JOIN LATERAL (SELECT x.id,x.revision,x.after_values FROM public.recruitment_case_event_revision x WHERE x.owner_id=e.owner_id AND x.case_id=e.case_id AND x.event_id=e.id ORDER BY x.revision DESC LIMIT 1) r ON true;
--> statement-breakpoint
REVOKE ALL ON public.recruitment_case_event_current FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT SELECT ON public.recruitment_case_event_current TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_history_projection(p_case_id uuid,p_event_id uuid DEFAULT NULL,p_after jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
WITH effective AS (
 SELECT e.id,e.kind,e.expected_stage_version,
   CASE WHEN e.id=p_event_id THEN (p_after->>'voided')::boolean ELSE e.voided END AS voided,
   CASE WHEN e.id=p_event_id THEN p_after->>'stageName' ELSE e.stage_name END AS stage_name
 FROM public.recruitment_case_event_current e WHERE e.case_id=p_case_id AND e.owner_id=auth.uid()
), valid AS (SELECT * FROM effective WHERE NOT voided),
orphans AS (SELECT e.id FROM valid e WHERE e.kind='stage-change' AND NOT EXISTS(SELECT 1 FROM valid i WHERE i.kind='invitation' AND i.expected_stage_version<e.expected_stage_version)),
latest AS (SELECT stage_name FROM valid WHERE kind IN ('invitation','stage-change') ORDER BY expected_stage_version DESC LIMIT 1)
SELECT jsonb_build_object('status',CASE WHEN EXISTS(SELECT 1 FROM valid WHERE kind='invitation') THEN 'W rekrutacji' WHEN EXISTS(SELECT 1 FROM valid WHERE kind IN ('application','contact')) THEN 'Kontakt rozpoczęty' ELSE 'Zapisane' END,
 'currentStage',(SELECT stage_name FROM latest), 'blockedBy',COALESCE((SELECT jsonb_agg(id ORDER BY id) FROM orphans),'[]'::jsonb));
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.preview_recruitment_case_correction(p_case_id uuid,p_event_id uuid,p_operation text,p_occurred_on date DEFAULT NULL,p_direction text DEFAULT NULL,p_stage_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE c public.recruitment_case%ROWTYPE; e record; b jsonb; a jsonb; projection jsonb; stage text:=public.recruitment_trim(p_stage_name);
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO c FROM public.recruitment_case WHERE id=p_case_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Entry unavailable'; END IF;
 SELECT * INTO e FROM public.recruitment_case_event_current WHERE id=p_event_id AND case_id=p_case_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Entry unavailable'; END IF;
 IF e.voided THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Entry already voided'; END IF;
 b:=jsonb_build_object('occurredOn',e.occurred_on,'direction',e.direction,'stageName',e.stage_name,'voided',false);
 IF p_operation='void' THEN
   IF p_occurred_on IS NOT NULL OR p_direction IS NOT NULL OR p_stage_name IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid void input'; END IF;
   a:=b || jsonb_build_object('voided',true);
 ELSIF p_operation='correct' THEN
   IF p_occurred_on IS NOT NULL AND (p_occurred_on<DATE '0001-01-01' OR p_occurred_on>(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid event date'; END IF;
   IF (e.kind='contact' AND (p_direction IS NULL OR p_direction NOT IN ('inbound','outbound'))) OR (e.kind<>'contact' AND p_direction IS NOT NULL)
      OR (e.kind IN ('invitation','stage-change') AND (stage IS NULL OR char_length(stage) NOT BETWEEN 1 AND 160)) OR (e.kind NOT IN ('invitation','stage-change') AND p_stage_name IS NOT NULL) THEN
     RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid correction input';
   END IF;
   a:=jsonb_build_object('occurredOn',p_occurred_on,'direction',p_direction,'stageName',stage,'voided',false);
   IF a=b THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Correction must change data'; END IF;
 ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid correction operation'; END IF;
 projection:=public.recruitment_history_projection(p_case_id,p_event_id,a);
 RETURN projection || jsonb_build_object('caseRevision',c.case_revision,'eventRevision',e.revision,'before',b,'after',a);
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.recruitment_revision_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb; current_case_revision integer; current_event_revision integer;
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT case_revision INTO current_case_revision FROM public.recruitment_case WHERE id=NEW.case_id AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Entry unavailable'; END IF;
 SELECT revision INTO current_event_revision FROM public.recruitment_case_event_current WHERE id=NEW.event_id AND case_id=NEW.case_id AND owner_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Entry unavailable'; END IF;
 IF NEW.expected_case_revision IS DISTINCT FROM current_case_revision OR NEW.expected_event_revision IS DISTINCT FROM current_event_revision THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='History changed; preview and confirm again'; END IF;
 p:=public.preview_recruitment_case_correction(NEW.case_id,NEW.event_id,NEW.operation,NEW.occurred_on,NEW.direction,NEW.stage_name);
 IF NEW.expected_case_revision IS DISTINCT FROM (p->>'caseRevision')::integer OR NEW.expected_event_revision IS DISTINCT FROM (p->>'eventRevision')::integer THEN
   RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='History changed; preview and confirm again';
 END IF;
 IF jsonb_array_length(p->'blockedBy')>0 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='Correction would orphan stage history'; END IF;
 NEW.revision:=NEW.expected_event_revision+1;
 NEW.before_values:=p->'before'; NEW.after_values:=p->'after';
 NEW.resulting_status:=p->>'status'; NEW.resulting_stage:=p->>'currentStage';
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_revision_before_insert BEFORE INSERT ON public.recruitment_case_event_revision FOR EACH ROW EXECUTE FUNCTION public.recruitment_revision_guard();
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
 IF EXISTS(SELECT 1 FROM public.recruitment_case_event_revision r WHERE r.owner_id=OLD.owner_id AND r.case_id=OLD.id AND r.expected_case_revision=OLD.case_revision) THEN stage_delta:=1;
 ELSIF EXISTS(SELECT 1 FROM public.recruitment_case_event e WHERE e.owner_id=OLD.owner_id AND e.case_id=OLD.id AND e.applied_case_revision=NEW.case_revision) THEN
   SELECT CASE WHEN e.kind IN ('invitation','stage-change') THEN 1 ELSE 0 END INTO stage_delta FROM public.recruitment_case_event e WHERE e.owner_id=OLD.owner_id AND e.case_id=OLD.id AND e.applied_case_revision=NEW.case_revision;
 ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Lifecycle command unavailable'; END IF;
 p:=public.recruitment_history_projection(OLD.id);
 IF NEW.status IS DISTINCT FROM p->>'status' OR NEW.current_stage IS DISTINCT FROM p->>'currentStage' OR NEW.stage_version IS DISTINCT FROM OLD.stage_version+stage_delta OR jsonb_array_length(p->'blockedBy')>0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Inconsistent lifecycle projection'; END IF;
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
DROP TRIGGER recruitment_case_guard_status ON public.recruitment_case;
--> statement-breakpoint
CREATE TRIGGER recruitment_case_guard_status BEFORE UPDATE OF status,current_stage,stage_version,case_revision ON public.recruitment_case FOR EACH ROW EXECUTE FUNCTION public.recruitment_case_guard_lifecycle();
--> statement-breakpoint
CREATE FUNCTION public.recruitment_revision_apply()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 UPDATE public.recruitment_case SET status=NEW.resulting_status,current_stage=NEW.resulting_stage,case_revision=case_revision+1,stage_version=stage_version+1 WHERE id=NEW.case_id AND owner_id=NEW.owner_id;
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER recruitment_revision_after_insert AFTER INSERT ON public.recruitment_case_event_revision FOR EACH ROW EXECUTE FUNCTION public.recruitment_revision_apply();
--> statement-breakpoint
CREATE FUNCTION public.recruitment_history_revision_json(r public.recruitment_case_event_revision)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object('id',r.id,'event_id',r.event_id,'case_id',r.case_id,'operation',r.operation,'revision',r.revision,'recorded_at',r.recorded_at,'before',r.before_values,'after',r.after_values,'status',r.resulting_status,'current_stage',r.resulting_stage,'expected_case_revision',r.expected_case_revision,'expected_event_revision',r.expected_event_revision);
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.correct_recruitment_case_event(p_request_id uuid,p_case_id uuid,p_event_id uuid,p_operation text,p_expected_case_revision integer,p_expected_event_revision integer,p_occurred_on date DEFAULT NULL,p_direction text DEFAULT NULL,p_stage_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE r public.recruitment_case_event_revision%ROWTYPE; stage text:=public.recruitment_trim(p_stage_name);
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 IF p_request_id IS NULL OR p_case_id IS NULL OR p_event_id IS NULL OR p_operation IS NULL OR p_operation NOT IN ('correct','void') OR p_expected_case_revision IS NULL OR p_expected_event_revision IS NULL OR p_expected_case_revision<0 OR p_expected_event_revision<0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid correction intent'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO r FROM public.recruitment_case_event_revision WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
   IF r.case_id IS DISTINCT FROM p_case_id OR r.event_id IS DISTINCT FROM p_event_id OR r.operation IS DISTINCT FROM p_operation OR r.expected_case_revision IS DISTINCT FROM p_expected_case_revision OR r.expected_event_revision IS DISTINCT FROM p_expected_event_revision OR r.occurred_on IS DISTINCT FROM p_occurred_on OR r.direction IS DISTINCT FROM p_direction OR r.stage_name IS DISTINCT FROM stage THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Save intent payload conflict'; END IF;
   RETURN jsonb_build_object('kind','replayed','revision',public.recruitment_history_revision_json(r));
 END IF;
 INSERT INTO public.recruitment_case_event_revision(request_id,case_id,event_id,operation,expected_case_revision,expected_event_revision,occurred_on,direction,stage_name)
 VALUES(p_request_id,p_case_id,p_event_id,p_operation,p_expected_case_revision,p_expected_event_revision,p_occurred_on,p_direction,stage) RETURNING * INTO r;
 RETURN jsonb_build_object('kind','created','revision',public.recruitment_history_revision_json(r));
END;
$fn$;

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
  NEW.applied_case_revision := v_case.case_revision + 1;
  RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.recruitment_case_event_apply()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb;
BEGIN
 p:=public.recruitment_history_projection(NEW.case_id);
 UPDATE public.recruitment_case SET status=p->>'status',current_stage=p->>'currentStage',case_revision=case_revision+1,
  stage_version=stage_version+CASE WHEN NEW.kind IN ('invitation','stage-change') THEN 1 ELSE 0 END
 WHERE id=NEW.case_id AND owner_id=NEW.owner_id;
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_history_projection(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.recruitment_history_projection(uuid,uuid,jsonb) TO authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.preview_recruitment_case_correction(uuid,uuid,text,date,text,text) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.preview_recruitment_case_correction(uuid,uuid,text,date,text,text) TO authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_revision_guard() FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_revision_apply() FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_history_revision_json(public.recruitment_case_event_revision) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.recruitment_history_revision_json(public.recruitment_case_event_revision) TO authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.correct_recruitment_case_event(uuid,uuid,uuid,text,integer,integer,date,text,text) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.correct_recruitment_case_event(uuid,uuid,uuid,text,integer,integer,date,text,text) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
--> statement-breakpoint
-- A deterministic denial for every DML shape, including non-updatable-view rewrites.
CREATE FUNCTION public.recruitment_history_read_only()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='History projection is read only';
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_history_read_only() FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
CREATE TRIGGER recruitment_history_projection_read_only INSTEAD OF INSERT OR UPDATE OR DELETE ON public.recruitment_case_event_current FOR EACH ROW EXECUTE FUNCTION public.recruitment_history_read_only();
