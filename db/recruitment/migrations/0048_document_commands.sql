CREATE TABLE "document_command" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid,
	"payload" jsonb,
	"result" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_command_owner_request_unique" UNIQUE("owner_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "document_command" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_metadata_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid,
	"action" text NOT NULL,
	"before_values" jsonb,
	"after_values" jsonb,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_metadata_revision_action_check" CHECK ("document_metadata_revision"."action" IN ('rename','label'))
);
--> statement-breakpoint
ALTER TABLE "document_metadata_revision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "document_command_owner_document_idx" ON "document_command" USING btree ("owner_id","document_id");--> statement-breakpoint
CREATE INDEX "document_metadata_revision_owner_document_idx" ON "document_metadata_revision" USING btree ("owner_id","document_id","recorded_at");--> statement-breakpoint
REVOKE ALL ON public.document_command,public.document_metadata_revision FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.document_metadata_revision TO authenticated;
CREATE POLICY document_metadata_revision_owner_read ON public.document_metadata_revision FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
--> statement-breakpoint
CREATE FUNCTION public.document_version_redact_history() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF TG_OP='DELETE' OR (OLD.state<>'deleted' AND NEW.state='deleted') THEN
  UPDATE public.document_command SET payload=NULL WHERE owner_id=OLD.owner_id AND document_id=OLD.document_id;
  DELETE FROM public.document_metadata_revision WHERE owner_id=OLD.owner_id AND version_id=OLD.id;
  IF NOT EXISTS(SELECT 1 FROM public.document_version v WHERE v.owner_id=OLD.owner_id AND v.document_id=OLD.document_id AND v.id<>OLD.id AND v.state<>'deleted') THEN
   DELETE FROM public.document_metadata_revision WHERE owner_id=OLD.owner_id AND document_id=OLD.document_id;
  ELSE
   UPDATE public.document_metadata_revision SET before_values=NULL,after_values=NULL WHERE owner_id=OLD.owner_id AND document_id=OLD.document_id AND action='rename';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.document_version_redact_history() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER document_version_redact_history BEFORE UPDATE OF state OR DELETE ON public.document_version FOR EACH ROW EXECUTE FUNCTION public.document_version_redact_history();
--> statement-breakpoint
CREATE FUNCTION public.execute_document_command(p_request_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
#variable_conflict use_variable
DECLARE owner uuid:=auth.uid(); expires timestamptz; prior public.document_command%ROWTYPE; op text; doc public.document%ROWTYPE; ver public.document_version%ROWTYPE; link public.case_document%ROWTYPE; target public.document_version%ROWTYPE; case_id uuid; version_id uuid; document_id uuid; link_id uuid; rev integer; title text; cv boolean; new_label text; previous jsonb; current jsonb; output jsonb;
BEGIN
 IF owner IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 expires:=recruitment_private.document_request_expiry(p_request_id);
 IF expires<=clock_timestamp() OR expires>clock_timestamp()+interval '7 days' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent expired'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,76211));
 SELECT * INTO prior FROM public.document_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN IF prior.payload IS NULL OR prior.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent conflict'; END IF; RETURN prior.result||jsonb_build_object('kind','replayed'); END IF;
 IF EXISTS(SELECT 1 FROM recruitment_private.document_upload_fence f WHERE f.owner_id=owner AND f.request_id=p_request_id) OR EXISTS(SELECT 1 FROM recruitment_private.document_upload_command u WHERE u.owner_id=owner AND u.request_id=p_request_id) OR EXISTS(SELECT 1 FROM recruitment_private.document_delete_command d WHERE d.owner_id=owner AND d.request_id=p_request_id) OR EXISTS(SELECT 1 FROM public.document_sent_command s WHERE s.owner_id=owner AND s.request_id=p_request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent unavailable'; END IF;
 op:=p_payload->>'action';
 IF op IS NULL OR op NOT IN ('rename','label','attach','detach','change-version') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid command'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE NOT(k=ANY(CASE WHEN op='rename' THEN ARRAY['action','documentId','revision','name','isCv'] WHEN op='label' THEN ARRAY['action','versionId','revision','label'] WHEN op='attach' THEN ARRAY['action','caseId','versionId'] WHEN op='detach' THEN ARRAY['action','caseId','linkId','revision'] ELSE ARRAY['action','caseId','linkId','revision','versionId'] END))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid command field'; END IF;
 IF op='rename' THEN
  document_id:=(p_payload->>'documentId')::uuid; rev:=(p_payload->>'revision')::integer; title:=public.recruitment_trim(p_payload->>'name');
  IF document_id IS NULL OR rev IS NULL OR title IS NULL OR char_length(title) NOT BETWEEN 1 AND 160 OR jsonb_typeof(p_payload->'isCv') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document'; END IF;
  cv:=(p_payload->>'isCv')::boolean;
  SELECT * INTO doc FROM public.document d WHERE d.owner_id=owner AND d.id=document_id FOR UPDATE;
  IF NOT FOUND OR doc.name IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document unavailable'; END IF;
  IF doc.revision<>rev THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Document changed'; END IF;
  previous:=jsonb_build_object('name',doc.name,'isCv',doc.is_cv); current:=jsonb_build_object('name',title,'isCv',cv);
  UPDATE public.document SET name=title,is_cv=cv,revision=revision+1 WHERE owner_id=owner AND id=document_id;
  INSERT INTO public.document_metadata_revision(owner_id,document_id,action,before_values,after_values) VALUES(owner,document_id,'rename',previous,current);
  output:=jsonb_build_object('kind','saved','documentId',document_id);
 ELSIF op='label' THEN
  version_id:=(p_payload->>'versionId')::uuid; rev:=(p_payload->>'revision')::integer;
  IF version_id IS NULL OR rev IS NULL OR NOT(p_payload ? 'label') OR jsonb_typeof(p_payload->'label') NOT IN ('string','null') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid version'; END IF;
  new_label:=NULLIF(public.recruitment_trim(p_payload->>'label'),''); IF new_label IS NOT NULL AND char_length(new_label)>160 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid label'; END IF;
  SELECT * INTO ver FROM public.document_version v WHERE v.owner_id=owner AND v.id=version_id FOR UPDATE;
  IF NOT FOUND OR ver.state NOT IN ('pending','ready') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Version unavailable'; END IF;
  IF ver.revision<>rev THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Version changed'; END IF;
  document_id:=ver.document_id; previous:=jsonb_build_object('label',ver.label); current:=jsonb_build_object('label',new_label);
  UPDATE public.document_version SET label=new_label,revision=revision+1 WHERE owner_id=owner AND id=version_id;
  INSERT INTO public.document_metadata_revision(owner_id,document_id,version_id,action,before_values,after_values) VALUES(owner,document_id,version_id,'label',previous,current);
  output:=jsonb_build_object('kind','saved','versionId',version_id);
 ELSE
  case_id:=(p_payload->>'caseId')::uuid;
  IF case_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.recruitment_case c WHERE c.owner_id=owner AND c.id=case_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Case unavailable'; END IF;
  IF op<>'attach' THEN
   link_id:=(p_payload->>'linkId')::uuid; rev:=(p_payload->>'revision')::integer;
   SELECT * INTO link FROM public.case_document l WHERE l.owner_id=owner AND l.case_id=case_id AND l.id=link_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Link unavailable'; END IF;
   IF rev IS NULL OR link.revision<>rev THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Link changed'; END IF;
   SELECT * INTO ver FROM public.document_version v WHERE v.owner_id=owner AND v.id=link.version_id;
   SELECT * INTO doc FROM public.document d WHERE d.owner_id=owner AND d.id=ver.document_id;
   IF doc.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document unavailable'; END IF;
   document_id:=doc.id;
  END IF;
  IF op IN ('attach','change-version') THEN
   version_id:=(p_payload->>'versionId')::uuid;
   SELECT * INTO target FROM public.document_version v WHERE v.owner_id=owner AND v.id=version_id;
   IF NOT FOUND OR target.state<>'ready' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Version unavailable'; END IF;
   SELECT * INTO doc FROM public.document d WHERE d.owner_id=owner AND d.id=target.document_id;
   IF NOT FOUND OR doc.name IS NULL OR (doc.case_id IS NOT NULL AND doc.case_id<>case_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document unavailable'; END IF;
   IF op='change-version' AND document_id<>target.document_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Version must belong to linked document'; END IF;
   document_id:=target.document_id;
   IF EXISTS(SELECT 1 FROM public.case_document l JOIN public.document_version v ON v.owner_id=l.owner_id AND v.id=l.version_id WHERE l.owner_id=owner AND l.case_id=case_id AND v.document_id=document_id AND (op='attach' OR l.id<>link_id)) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Document already linked'; END IF;
   IF op='attach' THEN INSERT INTO public.case_document(owner_id,case_id,version_id) VALUES(owner,case_id,version_id) RETURNING id INTO link_id;
   ELSE UPDATE public.case_document SET version_id=target.id,revision=revision+1 WHERE owner_id=owner AND id=link_id; END IF;
  ELSE
   IF doc.case_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.case_document l JOIN public.document_version v ON v.owner_id=l.owner_id AND v.id=l.version_id WHERE l.owner_id=owner AND v.document_id=doc.id AND l.id<>link_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Last case-only link'; END IF;
   DELETE FROM public.case_document WHERE owner_id=owner AND id=link_id;
  END IF;
  output:=jsonb_build_object('kind','saved','linkId',link_id);
 END IF;
 INSERT INTO public.document_command(owner_id,request_id,document_id,version_id,payload,result,expires_at) VALUES(owner,p_request_id,document_id,version_id,p_payload,output,expires);
 RETURN output;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid command';
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.execute_document_command(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.execute_document_command(uuid,jsonb) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION recruitment_private.document_command_collision_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM public.document_command c WHERE c.owner_id=NEW.owner_id AND c.request_id=NEW.request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent unavailable'; END IF;
 RETURN NEW;
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION recruitment_private.document_command_collision_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER document_sent_command_collision BEFORE INSERT ON public.document_sent_command FOR EACH ROW EXECUTE FUNCTION recruitment_private.document_command_collision_guard();
CREATE TRIGGER document_upload_command_collision BEFORE INSERT ON recruitment_private.document_upload_command FOR EACH ROW EXECUTE FUNCTION recruitment_private.document_command_collision_guard();
CREATE TRIGGER document_delete_command_collision BEFORE INSERT ON recruitment_private.document_delete_command FOR EACH ROW EXECUTE FUNCTION recruitment_private.document_command_collision_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reconcile_document_upload(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE owner uuid:=auth.uid(); expires timestamptz; cmd recruitment_private.document_upload_command%ROWTYPE; deletion recruitment_private.document_delete_command%ROWTYPE; sent public.document_sent_command%ROWTYPE; change_command public.document_command%ROWTYPE; phase text;
BEGIN
 IF owner IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 expires:=recruitment_private.document_request_expiry(p_request_id);
 IF expires>clock_timestamp()+interval '7 days' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid request id'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,76211));
 SELECT * INTO change_command FROM public.document_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN RETURN jsonb_build_object('kind','found','result',change_command.result); END IF;
 SELECT * INTO sent FROM public.document_sent_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN RETURN jsonb_build_object('kind','found','result',sent.result); END IF;
 SELECT * INTO deletion FROM recruitment_private.document_delete_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN RETURN jsonb_build_object('kind','found','result',jsonb_build_object('kind','saved','versionIds',deletion.version_ids)); END IF;
 SELECT * INTO cmd FROM recruitment_private.document_upload_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN
  SELECT o.phase INTO phase FROM recruitment_private.document_object o WHERE o.owner_id=owner AND o.version_id=cmd.version_id;
  IF phase='ready' THEN RETURN jsonb_build_object('kind','found','result',jsonb_build_object('kind','saved','documentId',cmd.document_id,'versionId',cmd.version_id)); END IF;
  RETURN jsonb_build_object('kind','pending');
 END IF;
 IF expires>clock_timestamp() THEN INSERT INTO recruitment_private.document_upload_fence(owner_id,request_id,expires_at) VALUES(owner,p_request_id,expires) ON CONFLICT(owner_id,request_id) DO NOTHING; END IF;
 RETURN jsonb_build_object('kind','cancelled');
END;$fn$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.purge_expired_document_ledgers() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE deleted_count integer:=0;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'documents_cleanup' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Cleanup role required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(762110043);
 IF NOT EXISTS(SELECT 1 FROM recruitment_private.document_restore_hold) THEN
  DELETE FROM recruitment_private.document_deletion_ledger WHERE confirmed_at IS NOT NULL AND confirmed_at < clock_timestamp()-interval '7 days' AND NOT restore_hold;
  GET DIAGNOSTICS deleted_count=ROW_COUNT;
 END IF;
 DELETE FROM recruitment_private.document_upload_fence WHERE expires_at<=clock_timestamp();
 DELETE FROM recruitment_private.document_delete_command WHERE expires_at<=clock_timestamp();
 DELETE FROM recruitment_private.document_delete_preview WHERE expires_at<=clock_timestamp();
 DELETE FROM public.document_command WHERE expires_at<=clock_timestamp();
 RETURN deleted_count;
END;$fn$;
