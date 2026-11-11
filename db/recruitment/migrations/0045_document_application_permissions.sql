-- Invoker command and nested guard preserve the existing application contract.
GRANT SELECT ON public.document_application_command TO authenticated;
GRANT INSERT(request_id,case_id,occurred_on,version_ids,cancelled) ON public.document_application_command TO authenticated;
GRANT INSERT(case_id,event_id,version_id) ON public.document_sent_reference TO authenticated;
--> statement-breakpoint
CREATE POLICY document_application_command_owner_read ON public.document_application_command FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
CREATE POLICY document_application_command_owner_insert ON public.document_application_command FOR INSERT TO authenticated WITH CHECK(owner_id=(SELECT auth.uid()));
CREATE POLICY document_sent_reference_owner_insert ON public.document_sent_reference FOR INSERT TO authenticated WITH CHECK(owner_id=(SELECT auth.uid()));
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_application_with_documents(uuid,uuid,date,uuid[]),public.reconcile_document_application(uuid,uuid) TO authenticated;
