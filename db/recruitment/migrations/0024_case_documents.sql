CREATE TABLE "case_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"case_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_document_owner_id_unique" UNIQUE("owner_id","id"),
	CONSTRAINT "case_document_version_unique" UNIQUE("owner_id","case_id","version_id"),
	CONSTRAINT "case_document_revision_valid" CHECK ("case_document"."revision">=0)
);
--> statement-breakpoint
ALTER TABLE "case_document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "case_document" ADD CONSTRAINT "case_document_owned_case_fk" FOREIGN KEY ("owner_id","case_id") REFERENCES "public"."recruitment_case"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_document" ADD CONSTRAINT "case_document_owned_version_fk" FOREIGN KEY ("owner_id","version_id") REFERENCES "public"."document_version"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_document_owner_case_idx" ON "case_document" USING btree ("owner_id","case_id");
--> statement-breakpoint
REVOKE ALL ON public.case_document FROM PUBLIC, anon, authenticated, service_role;
