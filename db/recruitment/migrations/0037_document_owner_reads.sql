-- Read-only owner access; writes continue to require the controlled commands.
GRANT SELECT ON public.document,public.document_version,public.case_document,public.document_sent_reference,public.document_sent_revision TO authenticated;
--> statement-breakpoint
CREATE POLICY document_owner_read ON public.document FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
CREATE POLICY document_version_owner_read ON public.document_version FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
CREATE POLICY case_document_owner_read ON public.case_document FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
CREATE POLICY document_sent_reference_owner_read ON public.document_sent_reference FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
CREATE POLICY document_sent_revision_owner_read ON public.document_sent_revision FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
