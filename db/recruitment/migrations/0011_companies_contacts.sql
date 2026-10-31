CREATE TABLE "catalog_command" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"target_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"before_values" jsonb,
	"after_values" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_command_owner_request_unique" UNIQUE("owner_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "catalog_command" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_profile_owner_id_unique" UNIQUE("owner_id","id"),
	CONSTRAINT "catalog_profile_type_valid" CHECK ("catalog_profile"."type" IN ('organization','contact')),
	CONSTRAINT "catalog_profile_name_valid" CHECK (char_length("catalog_profile"."name") BETWEEN 1 AND 160 AND "catalog_profile"."name"=public.recruitment_trim("catalog_profile"."name")),
	CONSTRAINT "catalog_profile_email_valid" CHECK ("catalog_profile"."email" IS NULL OR ("catalog_profile"."type"='contact' AND char_length("catalog_profile"."email") BETWEEN 1 AND 254 AND "catalog_profile"."email"=public.recruitment_trim("catalog_profile"."email") AND "catalog_profile"."email" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
	CONSTRAINT "catalog_profile_revision_valid" CHECK ("catalog_profile"."revision">=0)
);
--> statement-breakpoint
ALTER TABLE "catalog_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalog_relation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"type" text NOT NULL,
	"case_id" uuid,
	"organization_id" uuid,
	"contact_id" uuid,
	"role" text,
	"active" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_relation_owner_id_unique" UNIQUE("owner_id","id"),
	CONSTRAINT "catalog_relation_shape_valid" CHECK (("catalog_relation"."type"='case-organization' AND "catalog_relation"."case_id" IS NOT NULL AND "catalog_relation"."organization_id" IS NOT NULL AND "catalog_relation"."contact_id" IS NULL AND "catalog_relation"."role" IN ('employer','agency')) OR ("catalog_relation"."type"='case-contact' AND "catalog_relation"."case_id" IS NOT NULL AND "catalog_relation"."organization_id" IS NULL AND "catalog_relation"."contact_id" IS NOT NULL AND "catalog_relation"."role" IS NULL) OR ("catalog_relation"."type"='organization-contact' AND "catalog_relation"."case_id" IS NULL AND "catalog_relation"."organization_id" IS NOT NULL AND "catalog_relation"."contact_id" IS NOT NULL AND "catalog_relation"."role" IS NULL)),
	CONSTRAINT "catalog_relation_revision_valid" CHECK ("catalog_relation"."revision">=0)
);
--> statement-breakpoint
ALTER TABLE "catalog_relation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "catalog_command" ADD CONSTRAINT "catalog_command_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_profile" ADD CONSTRAINT "catalog_profile_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_relation" ADD CONSTRAINT "catalog_relation_owned_case_fk" FOREIGN KEY ("owner_id","case_id") REFERENCES "public"."recruitment_case"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_relation" ADD CONSTRAINT "catalog_relation_owned_org_fk" FOREIGN KEY ("owner_id","organization_id") REFERENCES "public"."catalog_profile"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_relation" ADD CONSTRAINT "catalog_relation_owned_contact_fk" FOREIGN KEY ("owner_id","contact_id") REFERENCES "public"."catalog_profile"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_command_audit_idx" ON "catalog_command" USING btree ("owner_id","target_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "catalog_profile_owner_order_idx" ON "catalog_profile" USING btree ("owner_id","created_at","id");--> statement-breakpoint
CREATE INDEX "catalog_relation_owner_idx" ON "catalog_relation" USING btree ("owner_id","case_id","organization_id","contact_id");
--> statement-breakpoint
-- Mutations are canonical commands, never arbitrary writes to projections/audit.
REVOKE ALL ON public.catalog_profile,public.catalog_relation,public.catalog_command FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE ON public.catalog_profile,public.catalog_relation TO authenticated;
--> statement-breakpoint
GRANT SELECT ON public.catalog_command TO authenticated;
--> statement-breakpoint
GRANT INSERT(request_id,payload) ON public.catalog_command TO authenticated;
--> statement-breakpoint
CREATE POLICY catalog_profile_owner ON public.catalog_profile FOR ALL TO authenticated USING ((SELECT auth.uid())=owner_id) WITH CHECK ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE POLICY catalog_relation_owner ON public.catalog_relation FOR ALL TO authenticated USING ((SELECT auth.uid())=owner_id) WITH CHECK ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE POLICY catalog_command_select ON public.catalog_command FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE POLICY catalog_command_insert ON public.catalog_command FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE UNIQUE INDEX catalog_relation_active_unique ON public.catalog_relation(owner_id,type,COALESCE(case_id,'00000000-0000-0000-0000-000000000000'::uuid),COALESCE(organization_id,'00000000-0000-0000-0000-000000000000'::uuid),COALESCE(contact_id,'00000000-0000-0000-0000-000000000000'::uuid),COALESCE(role,'')) WHERE active;
--> statement-breakpoint
CREATE FUNCTION public.catalog_name_key(v text) RETURNS text LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path='' AS $fn$
 SELECT lower(regexp_replace(normalize(public.recruitment_trim(v),NFC),'[' || chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)||']+',' ','g'));
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.catalog_profile_json(p public.catalog_profile) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object('id',p.id,'type',p.type,'name',p.name,'email',p.email,'revision',p.revision,'created_at',p.created_at);
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.catalog_relation_json(r public.catalog_relation) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object('id',r.id,'type',r.type,'left_id',COALESCE(r.case_id,r.organization_id),'right_id',CASE WHEN r.type='case-organization' THEN r.organization_id ELSE r.contact_id END,'leftLabel',CASE WHEN r.case_id IS NOT NULL THEN (SELECT title FROM public.recruitment_case WHERE id=r.case_id AND owner_id=auth.uid()) ELSE (SELECT name FROM public.catalog_profile WHERE id=r.organization_id AND owner_id=auth.uid()) END,'rightLabel',(SELECT name FROM public.catalog_profile WHERE id=CASE WHEN r.type='case-organization' THEN r.organization_id ELSE r.contact_id END AND owner_id=auth.uid()),'leftType',CASE WHEN r.case_id IS NOT NULL THEN 'case' ELSE 'organization' END,'rightType',CASE WHEN r.type='case-organization' THEN 'organization' ELSE 'contact' END,'role',r.role,'active',r.active,'revision',r.revision);
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.catalog_matches(p_type text,p_name text,p_email text,p_exclude uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT COALESCE(jsonb_agg(public.catalog_profile_json(p) ORDER BY p.id),'[]'::jsonb) FROM public.catalog_profile p WHERE p.owner_id=auth.uid() AND p.type=p_type AND (p_exclude IS NULL OR p.id<>p_exclude) AND (public.catalog_name_key(p.name)=public.catalog_name_key(p_name) OR (p_email IS NOT NULL AND lower(public.recruitment_trim(p.email))=lower(public.recruitment_trim(p_email))));
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.catalog_match_token(matches jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT COALESCE(jsonb_agg((x->>'id') || ':' || (x->>'revision') ORDER BY x->>'id'),'[]'::jsonb) FROM jsonb_array_elements(matches) x;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.catalog_projection_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 IF pg_trigger_depth()<2 OR auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Catalog command required'; END IF;
 IF TG_OP='UPDATE' AND (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Immutable identity'; END IF;
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER catalog_profile_guard BEFORE INSERT OR UPDATE ON public.catalog_profile FOR EACH ROW EXECUTE FUNCTION public.catalog_projection_guard();
--> statement-breakpoint
CREATE TRIGGER catalog_relation_guard BEFORE INSERT OR UPDATE ON public.catalog_relation FOR EACH ROW EXECUTE FUNCTION public.catalog_projection_guard();
--> statement-breakpoint
CREATE FUNCTION public.catalog_validate_payload(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE op text:=p->>'operation'; allowed text[]; n text; e text; r jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR op IS NULL OR op NOT IN ('create-profile','edit-profile','attach','detach','change-role') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid catalog command'; END IF;
 IF op IN ('create-profile','edit-profile') THEN
  allowed:=ARRAY['operation','profileType','profileId','name','email','expectedRevision','acknowledgedMatches'];
  IF p->>'profileType' IS NULL OR p->>'profileType' NOT IN ('organization','contact') OR jsonb_typeof(p->'name') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid profile'; END IF;
  n:=public.recruitment_trim(p->>'name'); e:=NULLIF(public.recruitment_trim(p->>'email'),'');
  IF char_length(n) NOT BETWEEN 1 AND 160 OR (p ? 'email' AND jsonb_typeof(p->'email') NOT IN ('string','null')) OR (e IS NOT NULL AND (p->>'profileType'<>'contact' OR char_length(e)>254 OR e !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR e ~ ('['||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)||']'))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid profile'; END IF;
  IF op='create-profile' AND (p ? 'profileId' OR p ? 'expectedRevision') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid profile'; END IF;
  IF op='edit-profile' THEN PERFORM (p->>'profileId')::uuid; IF p->>'profileId' IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid profile'; END IF; END IF;
  IF p ? 'acknowledgedMatches' AND (jsonb_typeof(p->'acknowledgedMatches') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'acknowledgedMatches') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR (x#>>'{}') !~ '^[0-9a-fA-F-]{36}:[0-9]+$')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid acknowledgment'; END IF;
  r:=p || jsonb_build_object('name',n,'email',e,'acknowledgedMatches',COALESCE(p->'acknowledgedMatches','[]'::jsonb));
 ELSIF op='attach' THEN
  allowed:=ARRAY['operation','relationType','leftId','rightId','role'];
  IF p->>'relationType' IS NULL OR p->>'relationType' NOT IN ('case-organization','case-contact','organization-contact') OR p->>'leftId' IS NULL OR p->>'rightId' IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid relation'; END IF;
  PERFORM (p->>'leftId')::uuid; PERFORM (p->>'rightId')::uuid;
  IF (p->>'relationType'='case-organization' AND (p->>'role' IS NULL OR p->>'role' NOT IN ('employer','agency'))) OR (p->>'relationType'<>'case-organization' AND p->>'role' IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid role'; END IF;
  r:=p || jsonb_build_object('role',p->>'role');
 ELSE
  allowed:=CASE WHEN op='detach' THEN ARRAY['operation','relationId','expectedRevision'] ELSE ARRAY['operation','relationId','expectedRevision','role'] END;
  IF p->>'relationId' IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid relation'; END IF; PERFORM (p->>'relationId')::uuid;
  IF op='change-role' AND (p->>'role' IS NULL OR p->>'role' NOT IN ('employer','agency')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid role'; END IF;
  r:=p;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT(k=ANY(allowed))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid catalog field'; END IF;
 IF op IN ('edit-profile','detach','change-role') AND (jsonb_typeof(p->'expectedRevision') IS DISTINCT FROM 'number' OR (p->>'expectedRevision') !~ '^[0-9]+$' OR (p->>'expectedRevision')::numeric>2147483646) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid revision'; END IF;
 RETURN r;
EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid catalog identifier';
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.catalog_command_guard() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb; op text; profile public.catalog_profile%ROWTYPE; rel public.catalog_relation%ROWTYPE; matches jsonb; cid uuid; oid uuid; pid uuid;
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() OR NEW.request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76212));
 p:=public.catalog_validate_payload(NEW.payload); NEW.payload:=p; op:=p->>'operation'; NEW.operation:=op; NEW.recorded_at:=clock_timestamp(); NEW.id:=gen_random_uuid(); NEW.before_values:=NULL;
 IF op IN ('create-profile','edit-profile') THEN
  IF op='edit-profile' THEN
   SELECT * INTO profile FROM public.catalog_profile WHERE id=(p->>'profileId')::uuid AND owner_id=auth.uid() AND type=p->>'profileType' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Record unavailable'; END IF;
   IF profile.revision<>(p->>'expectedRevision')::integer THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Catalog changed'; END IF;
   NEW.before_values:=public.catalog_profile_json(profile);
  END IF;
  matches:=public.catalog_matches(p->>'profileType',p->>'name',p->>'email',profile.id);
  IF jsonb_array_length(matches)>0 AND p->'acknowledgedMatches' IS DISTINCT FROM public.catalog_match_token(matches) THEN RAISE EXCEPTION USING ERRCODE='PT428',MESSAGE='Duplicate confirmation required'; END IF;
  IF op='create-profile' THEN
   INSERT INTO public.catalog_profile(type,name,email) VALUES(p->>'profileType',p->>'name',p->>'email') RETURNING * INTO profile;
  ELSE
   IF profile.name=p->>'name' AND profile.email IS NOT DISTINCT FROM p->>'email' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Correction must change data'; END IF;
   UPDATE public.catalog_profile SET name=p->>'name',email=p->>'email',revision=revision+1 WHERE id=profile.id AND owner_id=auth.uid() RETURNING * INTO profile;
  END IF;
  NEW.target_id:=profile.id; NEW.after_values:=public.catalog_profile_json(profile); NEW.result:=jsonb_build_object('kind','saved','profile',NEW.after_values);
 ELSIF op='attach' THEN
  cid:=CASE WHEN p->>'relationType' IN ('case-organization','case-contact') THEN (p->>'leftId')::uuid ELSE NULL END;
  oid:=CASE WHEN p->>'relationType'='case-organization' THEN (p->>'rightId')::uuid WHEN p->>'relationType'='organization-contact' THEN (p->>'leftId')::uuid ELSE NULL END;
  pid:=CASE WHEN p->>'relationType' IN ('case-contact','organization-contact') THEN (p->>'rightId')::uuid ELSE NULL END;
  IF (cid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.recruitment_case WHERE id=cid AND owner_id=auth.uid())) OR (oid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.catalog_profile WHERE id=oid AND owner_id=auth.uid() AND type='organization')) OR (pid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.catalog_profile WHERE id=pid AND owner_id=auth.uid() AND type='contact')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Record unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM public.catalog_relation WHERE owner_id=auth.uid() AND active AND type=p->>'relationType' AND case_id IS NOT DISTINCT FROM cid AND organization_id IS NOT DISTINCT FROM oid AND contact_id IS NOT DISTINCT FROM pid AND role IS NOT DISTINCT FROM p->>'role') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Relation exists'; END IF;
  INSERT INTO public.catalog_relation(type,case_id,organization_id,contact_id,role) VALUES(p->>'relationType',cid,oid,pid,p->>'role') RETURNING * INTO rel;
  NEW.target_id:=rel.id; NEW.after_values:=public.catalog_relation_json(rel); NEW.result:=jsonb_build_object('kind','saved','relation',NEW.after_values);
 ELSE
  SELECT * INTO rel FROM public.catalog_relation WHERE id=(p->>'relationId')::uuid AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Record unavailable'; END IF;
  IF NOT rel.active OR rel.revision<>(p->>'expectedRevision')::integer THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Catalog changed'; END IF;
  NEW.before_values:=public.catalog_relation_json(rel);
  IF op='change-role' THEN
   IF rel.type<>'case-organization' OR rel.role=p->>'role' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid role correction'; END IF;
   IF EXISTS(SELECT 1 FROM public.catalog_relation WHERE owner_id=auth.uid() AND active AND type=rel.type AND case_id=rel.case_id AND organization_id=rel.organization_id AND role=p->>'role' AND id<>rel.id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Relation exists'; END IF;
  END IF;
  UPDATE public.catalog_relation SET active=op<>'detach',role=CASE WHEN op='change-role' THEN p->>'role' ELSE role END,revision=revision+1 WHERE id=rel.id AND owner_id=auth.uid() RETURNING * INTO rel;
  NEW.target_id:=rel.id; NEW.after_values:=public.catalog_relation_json(rel); NEW.result:=jsonb_build_object('kind','saved','relation',NEW.after_values);
 END IF;
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
CREATE TRIGGER catalog_command_before_insert BEFORE INSERT ON public.catalog_command FOR EACH ROW EXECUTE FUNCTION public.catalog_command_guard();
--> statement-breakpoint
CREATE FUNCTION public.execute_catalog_command(p_request_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb; old public.catalog_command%ROWTYPE; matches jsonb; result jsonb; ex uuid;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76212));
 p:=public.catalog_validate_payload(p_payload);
 SELECT * INTO old FROM public.catalog_command WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
  IF old.payload IS DISTINCT FROM p THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent payload conflict'; END IF;
  RETURN old.result || jsonb_build_object('kind','replayed');
 END IF;
 IF p->>'operation' IN ('create-profile','edit-profile') THEN
  IF p->>'operation'='edit-profile' THEN
   ex:=(p->>'profileId')::uuid;
   IF NOT EXISTS(SELECT 1 FROM public.catalog_profile WHERE id=ex AND owner_id=auth.uid() AND type=p->>'profileType') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Record unavailable'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.catalog_profile WHERE id=ex AND owner_id=auth.uid() AND revision=(p->>'expectedRevision')::integer) THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Catalog changed'; END IF;
  END IF;
  matches:=public.catalog_matches(p->>'profileType',p->>'name',p->>'email',ex);
  IF jsonb_array_length(matches)>0 AND p->'acknowledgedMatches' IS DISTINCT FROM public.catalog_match_token(matches) THEN RETURN jsonb_build_object('kind','duplicates','matches',matches,'matchToken',public.catalog_match_token(matches)); END IF;
 END IF;
 INSERT INTO public.catalog_command(request_id,payload) VALUES(p_request_id,p) RETURNING catalog_command.result INTO result;
 RETURN result;
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.catalog_name_key(text),public.catalog_profile_json(public.catalog_profile),public.catalog_relation_json(public.catalog_relation),public.catalog_matches(text,text,text,uuid),public.catalog_match_token(jsonb),public.catalog_validate_payload(jsonb),public.execute_catalog_command(uuid,jsonb),public.catalog_projection_guard(),public.catalog_command_guard() FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.catalog_name_key(text),public.catalog_profile_json(public.catalog_profile),public.catalog_relation_json(public.catalog_relation),public.catalog_matches(text,text,text,uuid),public.catalog_match_token(jsonb),public.catalog_validate_payload(jsonb),public.execute_catalog_command(uuid,jsonb) TO authenticated;
