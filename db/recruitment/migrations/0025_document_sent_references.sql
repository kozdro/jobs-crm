CREATE TABLE "document_sent_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"case_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_sent_reference_owner_id_unique" UNIQUE("owner_id","id")
);
--> statement-breakpoint
ALTER TABLE "document_sent_reference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_sent_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"reference_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"version_id" uuid,
	"withdrawn" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_sent_revision_unique" UNIQUE("owner_id","reference_id","revision"),
	CONSTRAINT "document_sent_revision_valid" CHECK ("document_sent_revision"."revision">0 AND (("document_sent_revision"."withdrawn" AND "document_sent_revision"."version_id" IS NULL) OR (NOT "document_sent_revision"."withdrawn" AND "document_sent_revision"."version_id" IS NOT NULL)))
);
--> statement-breakpoint
ALTER TABLE "document_sent_revision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_sent_reference" ADD CONSTRAINT "document_sent_reference_case_fk" FOREIGN KEY ("owner_id","case_id") REFERENCES "public"."recruitment_case"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sent_reference" ADD CONSTRAINT "document_sent_reference_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."recruitment_case_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sent_reference" ADD CONSTRAINT "document_sent_reference_version_fk" FOREIGN KEY ("owner_id","version_id") REFERENCES "public"."document_version"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sent_revision" ADD CONSTRAINT "document_sent_revision_reference_fk" FOREIGN KEY ("owner_id","reference_id") REFERENCES "public"."document_sent_reference"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sent_revision" ADD CONSTRAINT "document_sent_revision_version_fk" FOREIGN KEY ("owner_id","version_id") REFERENCES "public"."document_version"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_sent_reference_event_idx" ON "document_sent_reference" USING btree ("owner_id","event_id");
--> statement-breakpoint
-- No writes or reads until the owner/event/void checks are implemented.
REVOKE ALL ON public.document_sent_reference, public.document_sent_revision FROM PUBLIC, anon, authenticated, service_role;
