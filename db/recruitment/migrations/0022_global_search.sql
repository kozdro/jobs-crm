CREATE TABLE public.case_note (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), case_id uuid NOT NULL,
 body text NOT NULL, date_kind text NOT NULL, occurred_on date, voided boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,id), FOREIGN KEY(owner_id,case_id) REFERENCES public.recruitment_case(owner_id,id),
 CHECK(char_length(body) BETWEEN 1 AND 10000 AND body=public.recruitment_trim(body)),
 CHECK(date_kind IN ('ordinary','historical')), CHECK(date_kind <> 'ordinary' OR occurred_on IS NULL), CHECK(revision>=0)
);
--> statement-breakpoint
CREATE TABLE public.case_link (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), case_id uuid NOT NULL,
 legacy boolean NOT NULL DEFAULT false, url text NOT NULL, role text NOT NULL, position integer NOT NULL,
 voided boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,id), FOREIGN KEY(owner_id,case_id) REFERENCES public.recruitment_case(owner_id,id),
 CHECK(public.recruitment_source_url(url) IS NOT NULL AND public.recruitment_source_url(url)=url),
 CHECK(role IN ('primary_offer','additional_offer','application_form','company_site','profile','correspondence','other','unspecified')),
 CHECK(position>=0 AND revision>=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX case_link_legacy_unique ON public.case_link(owner_id,case_id) WHERE legacy;
--> statement-breakpoint
CREATE TABLE public.case_content_command (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL DEFAULT auth.uid(), request_id uuid NOT NULL,
 payload jsonb NOT NULL, result jsonb NOT NULL, target_id uuid NOT NULL, case_id uuid NOT NULL,
 before_values jsonb, after_values jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,request_id), FOREIGN KEY(owner_id,case_id) REFERENCES public.recruitment_case(owner_id,id)
);
--> statement-breakpoint
ALTER TABLE public.case_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_content_command ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_note,public.case_link,public.case_content_command FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.case_note,public.case_link TO authenticated;
GRANT SELECT ON public.case_content_command TO authenticated;
GRANT INSERT(request_id,payload) ON public.case_content_command TO authenticated;
CREATE POLICY case_note_owner ON public.case_note FOR ALL TO authenticated USING ((SELECT auth.uid())=owner_id) WITH CHECK ((SELECT auth.uid())=owner_id);
CREATE POLICY case_link_owner ON public.case_link FOR ALL TO authenticated USING ((SELECT auth.uid())=owner_id) WITH CHECK ((SELECT auth.uid())=owner_id);
CREATE POLICY case_content_command_read ON public.case_content_command FOR SELECT TO authenticated USING ((SELECT auth.uid())=owner_id);
CREATE POLICY case_content_command_insert ON public.case_content_command FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=owner_id);
--> statement-breakpoint
CREATE VIEW public.case_link_current WITH(security_invoker=true) AS
 SELECT c.owner_id,c.id AS case_id,c.id AS id,'legacy'::text AS source,c.source_url AS url,'unspecified'::text AS role,0 AS position,false AS voided,0 AS revision,c.created_at
 FROM public.recruitment_case c WHERE c.source_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.case_link l WHERE l.owner_id=c.owner_id AND l.case_id=c.id AND l.legacy)
 UNION ALL
 SELECT l.owner_id,l.case_id,CASE WHEN l.legacy THEN l.case_id ELSE l.id END,CASE WHEN l.legacy THEN 'legacy' ELSE 'additional' END,l.url,l.role,l.position,l.voided,l.revision,l.created_at FROM public.case_link l;
--> statement-breakpoint
REVOKE ALL ON public.case_link_current FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.case_link_current TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.case_content_projection_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 IF pg_trigger_depth()<2 OR auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content command required'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.case_id IS DISTINCT FROM OLD.case_id OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Immutable identity'; END IF;
 RETURN NEW;
END;$fn$;
--> statement-breakpoint
CREATE TRIGGER case_note_projection_guard BEFORE INSERT OR UPDATE ON public.case_note FOR EACH ROW EXECUTE FUNCTION public.case_content_projection_guard();
CREATE TRIGGER case_link_projection_guard BEFORE INSERT OR UPDATE ON public.case_link FOR EACH ROW EXECUTE FUNCTION public.case_content_projection_guard();
--> statement-breakpoint
CREATE FUNCTION public.case_content_command_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE p jsonb:=NEW.payload; op text; cid uuid; target uuid; n public.case_note%ROWTYPE; l public.case_link%ROWTYPE; other public.case_link%ROWTYPE; displaced record; old jsonb; moved_before jsonb; moved_after jsonb; u text; r text; pos integer; rev integer; note_date_kind text; d date; src text; allowed text[];
BEGIN
 IF auth.uid() IS NULL OR NEW.owner_id IS DISTINCT FROM auth.uid() OR NEW.request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid command'; END IF;
 op:=p->>'operation'; cid:=(p->>'caseId')::uuid;
 IF op IS NULL OR op NOT IN ('create-note','correct-note','void-note','add-link','correct-link','void-link','reconcile-fence') OR cid IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid command'; END IF;
 allowed:=CASE WHEN op='reconcile-fence' THEN ARRAY['operation','caseId'] WHEN op='create-note' THEN ARRAY['operation','caseId','body','dateKind','occurredOn'] WHEN op='correct-note' THEN ARRAY['operation','caseId','id','expectedRevision','body','dateKind','occurredOn'] WHEN op='void-note' THEN ARRAY['operation','caseId','id','expectedRevision'] WHEN op='add-link' THEN ARRAY['operation','caseId','url','role'] WHEN op='correct-link' THEN ARRAY['operation','caseId','id','source','expectedRevision','url','role','position'] ELSE ARRAY['operation','caseId','id','source','expectedRevision'] END;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE NOT(k=ANY(allowed))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid command field'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,76211));
 -- Direct INSERT ... ON CONFLICT DO NOTHING runs this BEFORE trigger even when
 -- the outer row is discarded. Reject a consumed key before any side effect.
 IF EXISTS(SELECT 1 FROM public.case_content_command WHERE owner_id=auth.uid() AND request_id=NEW.request_id) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent already recorded'; END IF;
 PERFORM 1 FROM public.recruitment_case c WHERE c.owner_id=auth.uid() AND c.id=cid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Record unavailable'; END IF;
 NEW.case_id:=cid; NEW.id:=gen_random_uuid(); NEW.recorded_at:=clock_timestamp();
 IF op='reconcile-fence' THEN
  NEW.target_id:=cid; NEW.before_values:=NULL; NEW.after_values:='{}'::jsonb; NEW.result:=jsonb_build_object('kind','cancelled'); RETURN NEW;
 END IF;
 IF op IN ('create-note','correct-note','void-note') THEN
  IF op<>'create-note' THEN
   target:=(p->>'id')::uuid; rev:=(p->>'expectedRevision')::integer;
   SELECT * INTO n FROM public.case_note WHERE owner_id=auth.uid() AND case_id=cid AND id=target FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Record unavailable'; END IF;
   IF rev IS NULL OR n.revision<>rev OR n.voided THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Content changed'; END IF;
   old:=to_jsonb(n)-'owner_id';
  END IF;
  IF op<>'void-note' THEN
   IF jsonb_typeof(p->'body') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid note'; END IF;
   u:=public.recruitment_trim(p->>'body'); note_date_kind:=p->>'dateKind';
   IF note_date_kind IS NULL OR note_date_kind NOT IN ('ordinary','historical') OR char_length(u) NOT BETWEEN 1 AND 10000 OR NOT (p ? 'occurredOn') OR jsonb_typeof(p->'occurredOn') NOT IN ('string','null') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid note'; END IF;
   IF p->>'occurredOn' IS NOT NULL THEN d:=(p->>'occurredOn')::date; IF to_char(d,'YYYY-MM-DD')<>p->>'occurredOn' OR d>(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date OR note_date_kind='ordinary' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid date'; END IF; END IF;
  END IF;
  IF op='create-note' THEN INSERT INTO public.case_note(case_id,body,date_kind,occurred_on) VALUES(cid,u,note_date_kind,d) RETURNING * INTO n;
  ELSIF op='correct-note' THEN UPDATE public.case_note SET body=u,date_kind=note_date_kind,occurred_on=d,revision=revision+1 WHERE owner_id=auth.uid() AND id=target RETURNING * INTO n;
  ELSE UPDATE public.case_note SET voided=true,revision=revision+1 WHERE owner_id=auth.uid() AND id=target RETURNING * INTO n; END IF;
  NEW.target_id:=n.id; NEW.before_values:=old; NEW.after_values:=to_jsonb(n)-'owner_id'; NEW.result:=jsonb_build_object('kind','saved','note',NEW.after_values);
 ELSE
  IF op<>'add-link' THEN
   target:=(p->>'id')::uuid; src:=p->>'source'; rev:=(p->>'expectedRevision')::integer;
   IF target IS NULL OR src NOT IN ('legacy','additional') OR rev IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid link'; END IF;
   SELECT * INTO l FROM public.case_link WHERE owner_id=auth.uid() AND case_id=cid AND ((src='legacy' AND legacy AND target=cid) OR (src='additional' AND NOT legacy AND id=target)) FOR UPDATE;
   IF NOT FOUND AND src='legacy' AND target=cid THEN
    SELECT c.source_url INTO u FROM public.recruitment_case c WHERE c.owner_id=auth.uid() AND c.id=cid;
    IF u IS NOT NULL AND rev=0 THEN INSERT INTO public.case_link(case_id,legacy,url,role,position,created_at) SELECT cid,true,u,'unspecified',0,c.created_at FROM public.recruitment_case c WHERE c.owner_id=auth.uid() AND c.id=cid RETURNING * INTO l; END IF;
   END IF;
   IF l.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Record unavailable'; END IF;
   IF l.revision<>rev OR l.voided THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Content changed'; END IF;
   old:=(to_jsonb(l)-'owner_id')||jsonb_build_object('id',target,'source',src);
  END IF;
  IF op<>'void-link' THEN
   u:=public.recruitment_source_url(public.recruitment_trim(p->>'url')); r:=p->>'role';
   IF u IS NULL OR r IS NULL OR r NOT IN ('primary_offer','additional_offer','application_form','company_site','profile','correspondence','other','unspecified') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid link'; END IF;
   IF EXISTS(SELECT 1 FROM public.case_link_current x WHERE x.owner_id=auth.uid() AND x.case_id=cid AND NOT x.voided AND x.url=u AND (op='add-link' OR (x.source,x.id) IS DISTINCT FROM (src,target))) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Link exists'; END IF;
  END IF;
  IF op='add-link' THEN
   SELECT COALESCE(max(position),-1)+1 INTO pos FROM public.case_link_current WHERE owner_id=auth.uid() AND case_id=cid AND NOT voided;
   INSERT INTO public.case_link(case_id,url,role,position) VALUES(cid,u,r,pos) RETURNING * INTO l;
  ELSIF op='correct-link' THEN
   pos:=(p->>'position')::integer; IF pos IS NULL OR pos<0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid position'; END IF;
   IF pos<>l.position THEN
    SELECT * INTO displaced FROM public.case_link_current x WHERE x.owner_id=auth.uid() AND x.case_id=cid AND NOT x.voided AND x.position=pos AND (x.source,x.id) IS DISTINCT FROM (src,target) ORDER BY x.source,x.id LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid position'; END IF;
    IF displaced.source='legacy' THEN
     SELECT * INTO other FROM public.case_link WHERE owner_id=auth.uid() AND case_id=cid AND legacy FOR UPDATE;
     IF NOT FOUND THEN INSERT INTO public.case_link(case_id,legacy,url,role,position,created_at) VALUES(cid,true,displaced.url,displaced.role,displaced.position,displaced.created_at) RETURNING * INTO other; END IF;
    ELSE
     SELECT * INTO other FROM public.case_link WHERE owner_id=auth.uid() AND case_id=cid AND id=displaced.id AND NOT legacy FOR UPDATE;
    END IF;
    IF other.id IS NULL OR other.voided THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Content changed'; END IF;
    moved_before:=(to_jsonb(other)-'owner_id')||jsonb_build_object('id',displaced.id,'source',displaced.source);
    UPDATE public.case_link SET position=l.position,revision=revision+1 WHERE owner_id=auth.uid() AND id=other.id RETURNING * INTO other;
    moved_after:=(to_jsonb(other)-'owner_id')||jsonb_build_object('id',displaced.id,'source',displaced.source);
    old:=old||jsonb_build_object('reordered',moved_before);
   END IF;
   UPDATE public.case_link SET url=u,role=r,position=pos,revision=revision+1 WHERE owner_id=auth.uid() AND id=l.id RETURNING * INTO l;
  ELSE UPDATE public.case_link SET voided=true,revision=revision+1 WHERE owner_id=auth.uid() AND id=l.id RETURNING * INTO l; END IF;
  NEW.target_id:=CASE WHEN l.legacy THEN cid ELSE l.id END; NEW.before_values:=old; NEW.after_values:=(to_jsonb(l)-'owner_id') || jsonb_build_object('id',NEW.target_id,'source',CASE WHEN l.legacy THEN 'legacy' ELSE 'additional' END) || CASE WHEN moved_after IS NOT NULL THEN jsonb_build_object('reordered',moved_after) ELSE '{}'::jsonb END; NEW.result:=jsonb_build_object('kind','saved','link',NEW.after_values);
 END IF;
 RETURN NEW;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid command';
END;$fn$;
--> statement-breakpoint
CREATE TRIGGER case_content_command_guard BEFORE INSERT ON public.case_content_command FOR EACH ROW EXECUTE FUNCTION public.case_content_command_guard();
--> statement-breakpoint
CREATE FUNCTION public.execute_case_content_command(p_request_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE prior public.case_content_command%ROWTYPE; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,76211));
 SELECT * INTO prior FROM public.case_content_command WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN IF prior.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent payload conflict'; END IF; RETURN prior.result||jsonb_build_object('kind','replayed'); END IF;
 INSERT INTO public.case_content_command(request_id,payload) VALUES(p_request_id,p_payload) RETURNING case_content_command.result INTO result;
 RETURN result;
END;$fn$;
--> statement-breakpoint
CREATE FUNCTION public.case_content_reconcile(p_request_id uuid,p_case_id uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE prior public.case_content_command%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR p_case_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Record unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,76211));
 SELECT * INTO prior FROM public.case_content_command WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.case_id IS DISTINCT FROM p_case_id THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Record unavailable'; END IF;
  IF prior.payload->>'operation'='reconcile-fence' THEN RETURN jsonb_build_object('kind','cancelled'); END IF;
  RETURN jsonb_build_object('kind','found','result',prior.result);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.recruitment_case WHERE owner_id=auth.uid() AND id=p_case_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Record unavailable'; END IF;
 INSERT INTO public.case_content_command(request_id,payload) VALUES(p_request_id,jsonb_build_object('operation','reconcile-fence','caseId',p_case_id));
 RETURN jsonb_build_object('kind','cancelled');
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.case_content_projection_guard(),public.case_content_command_guard(),public.execute_case_content_command(uuid,jsonb),public.case_content_reconcile(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.execute_case_content_command(uuid,jsonb),public.case_content_reconcile(uuid,uuid) TO authenticated;
--> statement-breakpoint
CREATE INDEX case_note_owner_case_idx ON public.case_note(owner_id,case_id,created_at,id);
CREATE INDEX case_link_owner_case_idx ON public.case_link(owner_id,case_id,position,id);
CREATE INDEX case_content_command_audit_idx ON public.case_content_command(owner_id,case_id,target_id,recorded_at,id);
--> statement-breakpoint
CREATE FUNCTION public.search_normalize(v text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT translate(lower(normalize(v,NFC)),'ąćęłńóśźż','acelnoszz');
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.search_normalize(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.search_normalize(text) TO authenticated;
--> statement-breakpoint
CREATE INDEX recruitment_case_search_gin ON public.recruitment_case USING gin(to_tsvector('pg_catalog.simple'::regconfig,public.search_normalize(coalesce(title,'')||' '||coalesce(description,''))));
CREATE INDEX catalog_profile_search_gin ON public.catalog_profile USING gin(to_tsvector('pg_catalog.simple'::regconfig,public.search_normalize(coalesce(name,''))));
CREATE INDEX case_note_search_gin ON public.case_note USING gin(to_tsvector('pg_catalog.simple'::regconfig,public.search_normalize(body)));
CREATE INDEX case_link_search_gin ON public.case_link USING gin(to_tsvector('pg_catalog.simple'::regconfig,public.search_normalize(url)));
CREATE INDEX calendar_event_search_gin ON public.recruitment_calendar_event USING gin(to_tsvector('pg_catalog.simple'::regconfig,public.search_normalize(coalesce(title,'')||' '||coalesce(description,''))));
--> statement-breakpoint
CREATE FUNCTION public.global_search(p_query text,p_pages jsonb DEFAULT '{}'::jsonb,p_limit integer DEFAULT 20) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE q text; raw_q text; terms text; ts tsquery; grp text; result jsonb:='{}'::jsonb; page_no numeric; items jsonb; more boolean; offset_no bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 IF p_query IS NULL OR char_length(public.recruitment_trim(p_query)) NOT BETWEEN 1 AND 200 OR p_limit IS NULL OR p_limit NOT IN (3,20) OR jsonb_typeof(p_pages) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_pages) k WHERE k NOT IN ('cases','companies','contacts','links','notes','events')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid query'; END IF;
 raw_q:=lower(public.recruitment_trim(p_query)); q:=public.search_normalize(public.recruitment_trim(p_query));
 SELECT string_agg(quote_literal(t)||':*',' & ') INTO terms FROM regexp_split_to_table(q,'[^[:alnum:]]+') t WHERE t<>'';
 IF terms IS NOT NULL THEN ts:=to_tsquery('pg_catalog.simple'::regconfig,terms); END IF;
 FOREACH grp IN ARRAY ARRAY['cases','companies','contacts','links','notes','events'] LOOP
  IF p_pages ? grp AND (jsonb_typeof(p_pages->grp)<>'number' OR p_pages->>grp !~ '^[1-9][0-9]*$') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid page'; END IF;
  page_no:=COALESCE((p_pages->>grp)::numeric,1); IF (page_no-1)*p_limit > 9223372036854775807 THEN result:=result||jsonb_build_object(grp,jsonb_build_object('items','[]'::jsonb,'hasMore',false)); CONTINUE; END IF; offset_no:=((page_no-1)*p_limit)::bigint;
  WITH source AS NOT MATERIALIZED (
   SELECT 'cases'::text AS group_name,c.id,c.id AS case_id,c.title,coalesce(c.description,'') AS snippet,c.created_at,'case'::text AS source, public.search_normalize(coalesce(c.title,'')||' '||coalesce(c.description,'')) AS body FROM public.recruitment_case c WHERE grp='cases' AND c.owner_id=auth.uid()
   UNION ALL SELECT CASE WHEN p.type='organization' THEN 'companies' ELSE 'contacts' END,p.id,NULL::uuid,p.name,coalesce(p.email,''),p.created_at,p.type,public.search_normalize(coalesce(p.name,'')) FROM public.catalog_profile p WHERE grp IN ('companies','contacts') AND p.owner_id=auth.uid() AND p.type=CASE WHEN grp='companies' THEN 'organization' ELSE 'contact' END
   UNION ALL SELECT 'links',l.id,l.case_id,l.url,l.url,l.created_at,l.source,public.search_normalize(l.url) FROM public.case_link_current l WHERE grp='links' AND l.owner_id=auth.uid() AND NOT l.voided
   UNION ALL SELECT 'notes',n.id,n.case_id,'Notatka',n.body,n.created_at,'note',public.search_normalize(n.body) FROM public.case_note n WHERE grp='notes' AND n.owner_id=auth.uid() AND NOT n.voided
   UNION ALL SELECT 'events',e.id,e.case_id,e.title,coalesce(e.description,''),e.created_at,'calendar',public.search_normalize(coalesce(e.title,'')||' '||coalesce(e.description,'')) FROM public.recruitment_calendar_event e WHERE grp='events' AND e.owner_id=auth.uid()
  ), candidates AS (
   SELECT * FROM source WHERE grp<>'links' AND (grp<>'contacts' OR raw_q !~ '[@.%_/]') AND ts IS NOT NULL AND to_tsvector('pg_catalog.simple'::regconfig,body) @@ ts
   UNION
   SELECT * FROM source WHERE (grp IN ('cases','companies','contacts','events') AND strpos(public.search_normalize(title),q)>0)
    OR (grp='contacts' AND strpos(lower(snippet),raw_q)>0)
    OR (grp='links' AND strpos(lower(title),raw_q)>0)
    OR (grp IN ('cases','notes','events') AND q ~ '[^[:alnum:][:space:]]' AND strpos(body,q)>0)
  ), matched AS (
   SELECT *,CASE WHEN (grp='links' AND lower(title)=raw_q) OR (grp='contacts' AND lower(snippet)=raw_q) OR (grp<>'links' AND (public.search_normalize(title)=q OR (grp<>'contacts' AND public.search_normalize(snippet)=q))) THEN 0 WHEN (grp='links' AND strpos(lower(title),raw_q)>0) OR (grp='contacts' AND strpos(lower(snippet),raw_q)>0) OR (grp<>'links' AND strpos(body,q)>0) THEN 1 ELSE 2 END AS grade,
    CASE WHEN ts IS NULL THEN 0 ELSE ts_rank(to_tsvector('pg_catalog.simple'::regconfig,body),ts) END AS rank
   FROM candidates
  ), limited AS (
   SELECT * FROM matched ORDER BY grade,CASE WHEN grade=2 THEN rank ELSE 0 END DESC,created_at DESC,id ASC,source ASC OFFSET offset_no LIMIT p_limit+1
  ), ordered AS (
   SELECT *,row_number() OVER (ORDER BY grade,CASE WHEN grade=2 THEN rank ELSE 0 END DESC,created_at DESC,id ASC,source ASC) AS rn FROM limited
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',ordered.id,'case_id',ordered.case_id,'title',ordered.title,'snippet',ordered.snippet,'created_at',ordered.created_at,'source',ordered.source,
   'case_title',(SELECT c.title FROM public.recruitment_case c WHERE c.owner_id=auth.uid() AND c.id=ordered.case_id),
   'role',CASE WHEN grp='links' THEN (SELECT l.role FROM public.case_link_current l WHERE l.owner_id=auth.uid() AND l.case_id=ordered.case_id AND l.source=ordered.source AND l.id=ordered.id) ELSE NULL END,
   'status',CASE WHEN grp='cases' THEN (SELECT c.status FROM public.recruitment_case c WHERE c.owner_id=auth.uid() AND c.id=ordered.id) WHEN grp='events' THEN (SELECT e.status FROM public.recruitment_calendar_event e WHERE e.owner_id=auth.uid() AND e.id=ordered.id) ELSE NULL END
  ) ORDER BY rn) FILTER (WHERE rn<=p_limit),'[]'::jsonb),coalesce(bool_or(rn>p_limit),false) INTO items,more FROM ordered;
  result:=result||jsonb_build_object(grp,jsonb_build_object('items',items,'hasMore',more));
 END LOOP;
 RETURN result;
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.global_search(text,jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.global_search(text,jsonb,integer) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst,'reload schema';
--> statement-breakpoint
CREATE FUNCTION public.case_has_matching_url(p_case_id uuid,p_url text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT p_url IS NOT NULL AND EXISTS(SELECT 1 FROM public.case_link_current l WHERE l.owner_id=auth.uid() AND l.case_id=p_case_id AND NOT l.voided AND md5(l.url)=md5(p_url) AND l.url=p_url);
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.case_matching_url_revision(p_case_id uuid,p_url text) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT coalesce(string_agg(l.source||':'||l.id::text||':'||l.revision::text,',' ORDER BY l.source,l.id),'') FROM public.case_link_current l WHERE l.owner_id=auth.uid() AND l.case_id=p_case_id AND NOT l.voided AND p_url IS NOT NULL AND md5(l.url)=md5(p_url) AND l.url=p_url;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.case_has_matching_url(uuid,text),public.case_matching_url_revision(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.case_has_matching_url(uuid,text),public.case_matching_url_revision(uuid,text) TO authenticated;

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
    pg_catalog.md5(COALESCE(pg_catalog.string_agg(c.id::text || ':' || public.case_matching_url_revision(c.id,v_source_url), ',' ORDER BY c.id),''))
    INTO v_match_count, v_matchset_fingerprint
    FROM public.recruitment_case AS c
    WHERE c.owner_id = v_owner AND
      (c.title = v_title OR public.case_has_matching_url(c.id,v_source_url));

  SELECT COALESCE(pg_catalog.jsonb_agg(candidate.projection ORDER BY candidate.created_at DESC,candidate.id DESC),'[]'::jsonb)
    INTO v_matches
    FROM (
      SELECT pg_catalog.to_jsonb(c) - 'owner_id' - 'request_id' AS projection,c.created_at,c.id
      FROM public.recruitment_case AS c
      WHERE c.owner_id = v_owner AND (c.title = v_title OR public.case_has_matching_url(c.id,v_source_url))
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
          (c.title = v_title OR public.case_has_matching_url(c.id,v_source_url))
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
NOTIFY pgrst,'reload schema';

--> statement-breakpoint
CREATE OR REPLACE VIEW public.recruitment_case_timeline WITH(security_invoker=true) AS
 SELECT e.owner_id,e.case_id,e.id,e.occurred_on,e.recorded_at,'fact'::text AS type,
 jsonb_build_object('id',e.id,'case_id',e.case_id,'kind',e.kind,'direction',e.direction,'occurred_on',e.occurred_on,'recorded_at',e.recorded_at,'revision',e.revision,'voided',e.voided,'original',e.original,'stage_name',e.stage_name,'previous_stage',e.previous_stage,'expected_stage_version',e.expected_stage_version) AS payload
 FROM public.recruitment_case_event_current e
 UNION ALL
 SELECT l.owner_id,l.case_id,l.id,l.occurred_on,l.recorded_at,'lifecycle'::text,
 jsonb_build_object('id',l.id,'request_id',l.request_id,'case_id',l.case_id,'kind',l.kind,'cycle',l.cycle,'occurred_on',l.occurred_on,'recorded_at',l.recorded_at,'outcome',l.outcome,'offer_confirmed',l.offer_confirmed,'previous_status',l.previous_status,'previous_stage',l.previous_stage,'resulting_status',l.resulting_status,'resulting_stage',l.resulting_stage,'revision',l.revision,'expected_case_revision',l.expected_case_revision,'expected_task_snapshot',l.expected_task_snapshot,'task_resolutions',l.task_resolutions,'original',l.original)
 FROM public.recruitment_case_lifecycle_current l
 UNION ALL
 SELECT e.owner_id,e.case_id,e.id,(e.actual->>'date')::date,first_occurrence.recorded_at,'calendar'::text,public.recruitment_calendar_json(e)
 FROM public.recruitment_calendar_event e JOIN LATERAL
 (SELECT c.recorded_at FROM public.recruitment_calendar_command c WHERE c.owner_id=e.owner_id AND c.event_id=e.id AND c.after_values->>'status'='occurred' AND (c.before_values IS NULL OR c.before_values->>'status' IS DISTINCT FROM 'occurred') ORDER BY c.recorded_at ASC,c.id ASC LIMIT 1) first_occurrence ON true
 WHERE e.case_id IS NOT NULL AND e.status='occurred'
 UNION ALL
 SELECT n.owner_id,n.case_id,n.id,CASE WHEN n.date_kind='ordinary' THEN (n.created_at AT TIME ZONE 'Europe/Warsaw')::date ELSE n.occurred_on END,n.created_at,'note'::text,to_jsonb(n)-'owner_id' FROM public.case_note n;
--> statement-breakpoint
NOTIFY pgrst,'reload schema';
--> statement-breakpoint
CREATE FUNCTION public.case_note_timeline_page(p_case_id uuid,p_note_id uuid) RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT ((position-1)/25+1)::integer FROM (
  SELECT t.id,t.type,row_number() OVER(ORDER BY t.occurred_on DESC NULLS LAST,t.recorded_at DESC,t.id DESC) AS position
  FROM public.recruitment_case_timeline t WHERE t.owner_id=auth.uid() AND t.case_id=p_case_id
 ) ordered WHERE type='note' AND id=p_note_id;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.case_note_timeline_page(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.case_note_timeline_page(uuid,uuid) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst,'reload schema';
--> statement-breakpoint
CREATE FUNCTION public.find_case_link_duplicate(p_case_id uuid,p_url text,p_exclude_source text DEFAULT NULL,p_exclude_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT jsonb_build_object('id',l.id,'source',l.source) FROM public.case_link_current l
 WHERE l.owner_id=auth.uid() AND l.case_id=p_case_id AND NOT l.voided
 AND l.url=public.recruitment_source_url(public.recruitment_trim(p_url))
 AND (p_exclude_id IS NULL OR (l.source,l.id) IS DISTINCT FROM (p_exclude_source,p_exclude_id))
 ORDER BY l.position,l.source,l.id LIMIT 1;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.find_case_link_duplicate(uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.find_case_link_duplicate(uuid,text,text,uuid) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst,'reload schema';
