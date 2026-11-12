CREATE TABLE "recruitment_private"."document_object" (
	"version_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"bytes" integer NOT NULL,
	"phase" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_object_owner_request_unique" UNIQUE("owner_id","request_id"),
	CONSTRAINT "document_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "document_object_bytes_valid" CHECK ("recruitment_private"."document_object"."bytes" BETWEEN 1 AND 20971520),
	CONSTRAINT "document_object_phase_valid" CHECK ("recruitment_private"."document_object"."phase" IN ('pending','ready','deleting'))
);
--> statement-breakpoint
ALTER TABLE "recruitment_private"."document_object" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recruitment_private"."document_object" ADD CONSTRAINT "document_object_owned_version_fk" FOREIGN KEY ("owner_id","version_id") REFERENCES "public"."document_version"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_object_owner_phase_idx" ON "recruitment_private"."document_object" USING btree ("owner_id","phase");
--> statement-breakpoint
REVOKE ALL ON recruitment_private.document_object FROM PUBLIC, anon, authenticated, service_role;
