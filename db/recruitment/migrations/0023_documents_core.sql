CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"name" text NOT NULL,
	"is_cv" boolean DEFAULT false NOT NULL,
	"case_id" uuid,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_owner_id_unique" UNIQUE("owner_id","id"),
	CONSTRAINT "document_name_valid" CHECK (char_length("document"."name") BETWEEN 1 AND 160 AND "document"."name"=public.recruitment_trim("document"."name")),
	CONSTRAINT "document_revision_valid" CHECK ("document"."revision">=0)
);
--> statement-breakpoint
ALTER TABLE "document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid DEFAULT auth.uid() NOT NULL,
	"document_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"label" text,
	"filename" text,
	"mime" text,
	"size" integer,
	"state" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_version_owner_id_unique" UNIQUE("owner_id","id"),
	CONSTRAINT "document_version_number_unique" UNIQUE("owner_id","document_id","number"),
	CONSTRAINT "document_version_number_valid" CHECK ("document_version"."number">0 AND "document_version"."revision">=0),
	CONSTRAINT "document_version_state_valid" CHECK ("document_version"."state" IN ('pending','ready','deleting','deleted','error')),
	CONSTRAINT "document_version_label_valid" CHECK ("document_version"."label" IS NULL OR (char_length("document_version"."label") BETWEEN 1 AND 160 AND "document_version"."label"=public.recruitment_trim("document_version"."label"))),
	CONSTRAINT "document_version_size_valid" CHECK ("document_version"."size" IS NULL OR "document_version"."size" BETWEEN 1 AND 20971520),
	CONSTRAINT "document_version_deleted_minimal" CHECK ("document_version"."state"<>'deleted' OR ("document_version"."label" IS NULL AND "document_version"."filename" IS NULL AND "document_version"."mime" IS NULL AND "document_version"."size" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "document_version" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_owned_case_fk" FOREIGN KEY ("owner_id","case_id") REFERENCES "public"."recruitment_case"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_owned_document_fk" FOREIGN KEY ("owner_id","document_id") REFERENCES "public"."document"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_owner_case_idx" ON "document" USING btree ("owner_id","case_id","created_at");--> statement-breakpoint
CREATE INDEX "document_version_owner_document_idx" ON "document_version" USING btree ("owner_id","document_id","number");
--> statement-breakpoint
-- Fail closed until the command and operator boundaries are added. No client
-- can create a ready version or read metadata through the Data API here.
REVOKE ALL ON public.document, public.document_version FROM PUBLIC, anon, authenticated, service_role;
