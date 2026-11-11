DO $block$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='documents_uploader') THEN RAISE EXCEPTION 'Documents uploader role already exists'; END IF;
 CREATE ROLE documents_uploader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
END;$block$;
--> statement-breakpoint
GRANT documents_uploader TO authenticator;
GRANT USAGE ON SCHEMA storage,recruitment_private TO documents_uploader;
GRANT INSERT ON storage.objects TO documents_uploader;
GRANT EXECUTE ON FUNCTION recruitment_private.document_object_permitted(text,text) TO documents_uploader;
--> statement-breakpoint
CREATE POLICY documents_uploader_pending_insert ON storage.objects FOR INSERT TO documents_uploader
WITH CHECK(bucket_id='documents' AND storage.allow_only_operation('object.upload') AND recruitment_private.document_object_permitted(name,'pending'));
