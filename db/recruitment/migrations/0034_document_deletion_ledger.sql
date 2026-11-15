CREATE TABLE "recruitment_private"."document_deletion_ledger" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"restore_hold" boolean DEFAULT false NOT NULL,
	CONSTRAINT "document_deletion_ledger_object_unique" UNIQUE("object_key")
);
--> statement-breakpoint
ALTER TABLE "recruitment_private"."document_deletion_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "document_deletion_ledger_owner_idx" ON "recruitment_private"."document_deletion_ledger" USING btree ("owner_id","requested_at");
--> statement-breakpoint
REVOKE ALL ON recruitment_private.document_deletion_ledger FROM PUBLIC,anon,authenticated,service_role;
