ALTER TABLE "document" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ALTER COLUMN "is_cv" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_minimized_fields" CHECK (("document"."name" IS NULL) = ("document"."is_cv" IS NULL));