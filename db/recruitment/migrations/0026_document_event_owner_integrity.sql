ALTER TABLE "document_sent_reference" DROP CONSTRAINT "document_sent_reference_event_fk";
--> statement-breakpoint
ALTER TABLE "recruitment_case_event" ADD CONSTRAINT "recruitment_case_event_owner_case_id_unique" UNIQUE("owner_id","case_id","id");--> statement-breakpoint
ALTER TABLE "document_sent_reference" ADD CONSTRAINT "document_sent_reference_event_fk" FOREIGN KEY ("owner_id","case_id","event_id") REFERENCES "public"."recruitment_case_event"("owner_id","case_id","id") ON DELETE no action ON UPDATE no action;
