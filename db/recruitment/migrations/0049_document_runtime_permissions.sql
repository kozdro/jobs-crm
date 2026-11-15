-- Least-privilege execution boundaries: user-scoped reservation/preview,
-- verified-byte finalization, and current-Auth-gated deletion authorization.
GRANT EXECUTE ON FUNCTION public.reserve_document_upload(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_document_delete(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_document_upload(uuid,integer,text,text) TO documents_validator;
GRANT EXECUTE ON FUNCTION public.authorize_document_delete(uuid,uuid,uuid) TO documents_delete_authorizer;
