-- Reconciliation is owner-bound and creates a bounded fence under the same
-- advisory lock as reservation. It never grants upload or finalize rights.
GRANT EXECUTE ON FUNCTION public.reconcile_document_upload(uuid) TO authenticated;
