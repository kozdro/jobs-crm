-- SYNTHETIC FOUNDATION PoC v1: activate only after RLS/grants/invokers exist.
-- Local Supabase starts with its empty public schema; this database-local setting
-- lets PostgREST reload the protected PoC without a second migration history.
ALTER ROLE authenticator IN DATABASE postgres SET pgrst.db_schemas = 'public,foundation_poc';
--> statement-breakpoint
NOTIFY pgrst, 'reload config';
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
