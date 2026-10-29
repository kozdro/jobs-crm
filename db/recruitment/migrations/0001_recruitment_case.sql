CREATE TABLE "recruitment_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"request_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_url" text,
	"status" text DEFAULT 'Zapisane' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_case_owner_request_unique" UNIQUE("owner_id","request_id"),
	CONSTRAINT "recruitment_case_title_valid" CHECK (char_length("recruitment_case"."title") BETWEEN 1 AND 160 AND "recruitment_case"."title" = public.recruitment_trim("recruitment_case"."title")),
	CONSTRAINT "recruitment_case_description_valid" CHECK ("recruitment_case"."description" IS NULL OR (char_length("recruitment_case"."description") BETWEEN 1 AND 2000 AND "recruitment_case"."description" = public.recruitment_trim("recruitment_case"."description"))),
	CONSTRAINT "recruitment_case_url_valid" CHECK ("recruitment_case"."source_url" IS NULL OR ("recruitment_case"."source_url" = public.recruitment_source_url("recruitment_case"."source_url") AND public.recruitment_source_url("recruitment_case"."source_url") IS NOT NULL)),
	CONSTRAINT "recruitment_case_saved_only" CHECK ("recruitment_case"."status" = 'Zapisane')
);
--> statement-breakpoint
ALTER TABLE "recruitment_case" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruitment_case" ADD CONSTRAINT "recruitment_case_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recruitment_case_owner_created_idx" ON "recruitment_case" USING btree ("owner_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "recruitment_case_owner_title_idx" ON "recruitment_case" USING btree ("owner_id","title");--> statement-breakpoint
CREATE INDEX "recruitment_case_owner_url_idx" ON "recruitment_case" USING btree ("owner_id",md5("source_url")) WHERE "recruitment_case"."source_url" IS NOT NULL;