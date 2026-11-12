-- Storage SELECT must apply only to an authenticated download and only to a
-- ready inventory entry whose version still belongs to the same owner.
CREATE FUNCTION recruitment_private.document_owner_download_allowed(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
   SELECT 1 FROM recruitment_private.document_object o
   JOIN public.document_version v ON v.id=o.version_id AND v.owner_id=o.owner_id
   WHERE o.object_key=p_name AND o.owner_id=(SELECT auth.uid())
     AND o.phase='ready' AND v.state='ready'
 );
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION recruitment_private.document_owner_download_allowed(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION recruitment_private.document_owner_download_allowed(text) TO authenticated;
--> statement-breakpoint
CREATE POLICY documents_owner_ready_download ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='documents' AND storage.allow_only_operation('object.get_authenticated') AND recruitment_private.document_owner_download_allowed(name));
--> statement-breakpoint
-- An owner may resolve only a currently ready version. The opaque object key is
-- returned only to the authenticated owner and is never a signed URL.
CREATE FUNCTION public.document_download_target(p_version_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT jsonb_build_object('objectKey',o.object_key,'filename',v.filename,'mime',v.mime,'bytes',o.bytes)
 FROM recruitment_private.document_object o
 JOIN public.document_version v ON v.id=o.version_id AND v.owner_id=o.owner_id
 JOIN public.document d ON d.id=v.document_id AND d.owner_id=v.owner_id
 WHERE (SELECT auth.uid()) IS NOT NULL AND o.owner_id=(SELECT auth.uid())
   AND o.version_id=p_version_id AND o.phase='ready' AND v.state='ready'
   AND v.filename IS NOT NULL AND v.mime IS NOT NULL AND v.size=o.bytes
 LIMIT 1;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.document_download_target(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.document_download_target(uuid) TO authenticated;
