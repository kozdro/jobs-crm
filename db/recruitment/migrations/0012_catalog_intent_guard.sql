-- DEC-058: preserve command/audit integrity under direct PostgREST ON CONFLICT.
-- Additive repair of frozen 0011; no data mutation, profile changes, or lifecycle effects.
CREATE OR REPLACE FUNCTION public.catalog_command_guard() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb; op text; profile public.catalog_profile%ROWTYPE; rel public.catalog_relation%ROWTYPE; matches jsonb; cid uuid; oid uuid; pid uuid;
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() OR NEW.request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76212));
 -- BEFORE triggers run even when the outer INSERT later ignores a unique conflict.
 -- Reject consumed intent keys before any projection effect; only the canonical
 -- RPC may replay its already recorded result without executing this trigger.
 IF EXISTS(SELECT 1 FROM public.catalog_command WHERE owner_id=auth.uid() AND request_id=NEW.request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent already recorded'; END IF;
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
