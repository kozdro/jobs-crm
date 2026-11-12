CREATE TABLE "recruitment_private"."document_delete_preview" (
	"token" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"version_ids" uuid[] NOT NULL,
	"snapshot" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recruitment_private"."document_delete_preview" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "document_delete_preview_owner_idx" ON "recruitment_private"."document_delete_preview" USING btree ("owner_id","expires_at");--> statement-breakpoint
REVOKE ALL ON recruitment_private.document_delete_preview FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
CREATE FUNCTION recruitment_private.document_delete_snapshot(p_owner uuid,p_versions uuid[],p_document uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE version_rows jsonb; link_rows jsonb; application_rows jsonb; reference_rows jsonb; active_ids uuid[];
BEGIN
 IF p_owner IS NULL OR p_versions IS NULL OR cardinality(p_versions)=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid deletion scope'; END IF;
 SELECT array_agg(v.id ORDER BY v.id), jsonb_agg(jsonb_build_object('id',v.id,'state',v.state,'revision',v.revision,'documentId',v.document_id,'documentRevision',d.revision) ORDER BY v.id)
 INTO active_ids,version_rows FROM public.document_version v JOIN public.document d ON d.owner_id=v.owner_id AND d.id=v.document_id JOIN recruitment_private.document_object o ON o.owner_id=v.owner_id AND o.version_id=v.id
 WHERE v.owner_id=p_owner AND v.id=ANY(p_versions) AND v.state IN ('pending','ready') AND o.phase IN ('pending','ready');
 IF active_ids IS DISTINCT FROM p_versions THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Deletion scope changed'; END IF;
 IF p_document IS NOT NULL AND EXISTS(SELECT 1 FROM public.document_version v WHERE v.owner_id=p_owner AND v.document_id=p_document AND v.state<>'deleted' AND NOT (v.id=ANY(p_versions))) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Deletion scope changed'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'revision',l.revision,'caseId',l.case_id,'title',c.title,'caseRevision',c.case_revision) ORDER BY l.id),'[]'::jsonb) INTO link_rows
 FROM public.case_document l JOIN public.recruitment_case c ON c.owner_id=l.owner_id AND c.id=l.case_id WHERE l.owner_id=p_owner AND l.version_id=ANY(p_versions);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'eventId',r.event_id,'versionId',r.version_id,'revisions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',rr.id,'revision',rr.revision,'versionId',rr.version_id,'withdrawn',rr.withdrawn) ORDER BY rr.revision) FROM public.document_sent_revision rr WHERE rr.owner_id=p_owner AND rr.reference_id=r.id),'[]'::jsonb)) ORDER BY r.id),'[]'::jsonb) INTO reference_rows
 FROM public.document_sent_reference r WHERE r.owner_id=p_owner AND (r.version_id=ANY(p_versions) OR EXISTS(SELECT 1 FROM public.document_sent_revision rr WHERE rr.owner_id=p_owner AND rr.reference_id=r.id AND rr.version_id=ANY(p_versions)));
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'caseId',e.case_id,'caseTitle',c.title,'caseRevision',c.case_revision,'occurredOn',e.occurred_on,'eventRevision',e.revision,'voided',e.voided) ORDER BY e.id),'[]'::jsonb) INTO application_rows
 FROM public.recruitment_case_event_current e JOIN public.recruitment_case c ON c.owner_id=e.owner_id AND c.id=e.case_id WHERE e.owner_id=p_owner AND e.kind='application' AND EXISTS(SELECT 1 FROM public.document_sent_reference r WHERE r.owner_id=p_owner AND r.event_id=e.id AND (r.version_id=ANY(p_versions) OR EXISTS(SELECT 1 FROM public.document_sent_revision rr WHERE rr.owner_id=p_owner AND rr.reference_id=r.id AND rr.version_id=ANY(p_versions))));
 RETURN jsonb_build_object('documentId',p_document,'versions',version_rows,'links',link_rows,'references',reference_rows,'applications',application_rows);
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION recruitment_private.document_delete_snapshot(uuid,uuid[],uuid) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
CREATE FUNCTION public.preview_document_delete(p_version_id uuid,p_document_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE owner uuid:=auth.uid(); ids uuid[]; snapshot jsonb; token uuid; cases jsonb;
BEGIN
 IF owner IS NULL OR (p_version_id IS NULL)=(p_document_id IS NULL) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid deletion scope'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,76211));
 SELECT array_agg(v.id ORDER BY v.id) INTO ids FROM public.document_version v WHERE v.owner_id=owner AND v.state<>'deleted' AND ((p_version_id IS NOT NULL AND v.id=p_version_id) OR (p_document_id IS NOT NULL AND v.document_id=p_document_id));
 snapshot:=recruitment_private.document_delete_snapshot(owner,ids,p_document_id);
 INSERT INTO recruitment_private.document_delete_preview(owner_id,version_ids,snapshot,expires_at) VALUES(owner,ids,snapshot,clock_timestamp()+interval '15 minutes') RETURNING document_delete_preview.token INTO token;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',x.case_id,'title',x.title) ORDER BY x.case_id),'[]'::jsonb) INTO cases FROM (SELECT DISTINCT l.case_id,c.title FROM public.case_document l JOIN public.recruitment_case c ON c.owner_id=l.owner_id AND c.id=l.case_id WHERE l.owner_id=owner AND l.version_id=ANY(ids)) x;
 RETURN jsonb_build_object('kind','saved','preview',jsonb_build_object('token',token,'affectedCases',cases,'affectedApplications',snapshot->'applications'));
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.preview_document_delete(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
