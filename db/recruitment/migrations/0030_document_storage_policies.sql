-- Restricted JWT roles are externally issued to the validator and cleanup
-- processes. No general service-role credential is needed by either process.
DO $block$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN ('documents_validator','documents_cleanup')) THEN
  RAISE EXCEPTION 'Documents operator roles already exist; inspect ownership before migration';
 END IF;
 CREATE ROLE documents_validator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 CREATE ROLE documents_cleanup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
END;$block$;
--> statement-breakpoint
GRANT documents_validator, documents_cleanup TO authenticator;
GRANT USAGE ON SCHEMA storage, recruitment_private TO documents_validator, documents_cleanup;
GRANT SELECT ON storage.objects TO documents_validator, documents_cleanup;
GRANT DELETE ON storage.objects TO documents_cleanup;
--> statement-breakpoint
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('documents','documents',false,20971520,ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/jpeg','image/png']);
--> statement-breakpoint
-- The helper reveals only whether this opaque path currently belongs to a
-- pending or deletion-queued operation. No operator can enumerate inventory.
CREATE FUNCTION recruitment_private.document_object_permitted(p_name text,p_phase text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT EXISTS(SELECT 1 FROM recruitment_private.document_object o WHERE o.object_key=p_name AND o.phase=p_phase);
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION recruitment_private.document_object_permitted(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION recruitment_private.document_object_permitted(text,text) TO documents_validator,documents_cleanup;
--> statement-breakpoint
CREATE POLICY documents_validator_pending_download ON storage.objects FOR SELECT TO documents_validator
USING(bucket_id='documents' AND storage.allow_only_operation('object.get_authenticated') AND recruitment_private.document_object_permitted(name,'pending'));
--> statement-breakpoint
CREATE POLICY documents_cleanup_queued_select ON storage.objects FOR SELECT TO documents_cleanup
USING(bucket_id='documents' AND storage.allow_any_operation(ARRAY['object.delete','object.delete_many']) AND recruitment_private.document_object_permitted(name,'deleting'));
--> statement-breakpoint
CREATE POLICY documents_cleanup_queued_delete ON storage.objects FOR DELETE TO documents_cleanup
USING(bucket_id='documents' AND storage.allow_any_operation(ARRAY['object.delete','object.delete_many']) AND recruitment_private.document_object_permitted(name,'deleting'));
