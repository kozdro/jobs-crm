CREATE TABLE "recruitment_private"."document_upload_command" (
	"owner_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"intent" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_upload_command_owner_request_unique" UNIQUE("owner_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "recruitment_private"."document_upload_command" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruitment_private"."document_upload_command" ADD CONSTRAINT "document_upload_command_owned_version_fk" FOREIGN KEY ("owner_id","version_id") REFERENCES "public"."document_version"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
REVOKE ALL ON recruitment_private.document_upload_command FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
-- A reservation cannot itself upload or finalize bytes. It is intentionally not
-- granted to clients until the uploader identity and recovery are verified.
CREATE FUNCTION public.reserve_document_upload(p_request_id uuid,p_intent jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE owner uuid:=auth.uid(); prior recruitment_private.document_upload_command%ROWTYPE;
  scope text; doc_id uuid; ver_id uuid; case_id uuid; object_key text; amount integer;
  doc public.document%ROWTYPE; ver_number integer; total bigint; desired_name text; label text; original_filename text; declared_mime text;
BEGIN
 IF owner IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_intent) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_intent) AS k WHERE k NOT IN ('scope','documentId','caseId','name','isCv','label','filename','mime','bytes','sha256')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid intent'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,76211));
 SELECT * INTO prior FROM recruitment_private.document_upload_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN
  IF prior.intent IS NULL OR prior.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent conflict'; END IF;
  SELECT o.object_key INTO object_key FROM recruitment_private.document_object o WHERE o.owner_id=owner AND o.version_id=prior.version_id AND o.phase='pending';
  IF object_key IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent no longer pending'; END IF;
  RETURN jsonb_build_object('kind','replayed','documentId',prior.document_id,'versionId',prior.version_id,'objectKey',object_key);
 END IF;
 scope:=p_intent->>'scope'; amount:=(p_intent->>'bytes')::integer; original_filename:=p_intent->>'filename'; declared_mime:=p_intent->>'mime'; label:=NULLIF(public.recruitment_trim(p_intent->>'label'),'');
 IF scope IS NULL OR scope NOT IN ('library','case','library-and-case','version') OR amount IS NULL OR amount NOT BETWEEN 1 AND 20971520 OR original_filename IS NULL OR char_length(original_filename)=0 OR declared_mime IS NULL OR declared_mime NOT IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/jpeg','image/png') OR (p_intent->>'sha256') IS NULL OR (p_intent->>'sha256') !~ '^[0-9a-f]{64}$' OR (label IS NOT NULL AND char_length(label)>160) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid intent'; END IF;
 IF p_intent->>'caseId' IS NOT NULL THEN case_id:=(p_intent->>'caseId')::uuid; END IF;
 IF scope IN ('case','library-and-case') AND case_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Case required'; END IF;
 IF case_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.recruitment_case c WHERE c.owner_id=owner AND c.id=case_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Case unavailable'; END IF;
 IF scope='version' THEN
  doc_id:=(p_intent->>'documentId')::uuid;
  SELECT * INTO doc FROM public.document d WHERE d.owner_id=owner AND d.id=doc_id FOR UPDATE;
  IF NOT FOUND OR (doc.case_id IS NOT NULL AND doc.case_id IS DISTINCT FROM case_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document unavailable'; END IF;
 ELSE
  desired_name:=public.recruitment_trim(p_intent->>'name');
  IF desired_name IS NULL OR char_length(desired_name) NOT BETWEEN 1 AND 160 OR jsonb_typeof(p_intent->'isCv') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid document'; END IF;
 END IF;
 SELECT COALESCE(sum(o.bytes),0) INTO total FROM recruitment_private.document_object o WHERE o.owner_id=owner;
 IF total + amount > 1073741824 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Quota exceeded'; END IF;
 IF scope<>'version' THEN
  INSERT INTO public.document(owner_id,name,is_cv,case_id) VALUES(owner,desired_name,(p_intent->>'isCv')::boolean,CASE WHEN scope='case' THEN case_id ELSE NULL END) RETURNING id INTO doc_id;
 END IF;
 SELECT COALESCE(max(v.number),0)+1 INTO ver_number FROM public.document_version v WHERE v.owner_id=owner AND v.document_id=doc_id;
 INSERT INTO public.document_version(owner_id,document_id,number,label,filename,state) VALUES(owner,doc_id,ver_number,label,original_filename,'pending') RETURNING id INTO ver_id;
 object_key:=pg_catalog.gen_random_uuid()::text;
 INSERT INTO recruitment_private.document_object(owner_id,version_id,request_id,object_key,bytes,phase) VALUES(owner,ver_id,p_request_id,object_key,amount,'pending');
 INSERT INTO recruitment_private.document_upload_command(owner_id,request_id,document_id,version_id,intent) VALUES(owner,p_request_id,doc_id,ver_id,p_intent);
 IF scope IN ('case','library-and-case') THEN INSERT INTO public.case_document(owner_id,case_id,version_id) VALUES(owner,case_id,ver_id); END IF;
 RETURN jsonb_build_object('kind','reserved','documentId',doc_id,'versionId',ver_id,'objectKey',object_key);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid intent';
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reserve_document_upload(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
