-- Custom SQL migration file, put your code below! --
-- Replacing an IMMUTABLE function does not revalidate existing CHECK rows.
-- Re-add the identical Drizzle-declared URL constraint under the new helper.
-- The migrator transaction rolls back on any old noncanonical URL; no data is
-- silently rewritten, removed, or exempted by a NOT VALID constraint.
ALTER TABLE public.recruitment_case
  DROP CONSTRAINT recruitment_case_url_valid,
  ADD CONSTRAINT recruitment_case_url_valid CHECK (
    source_url IS NULL OR (
      source_url = public.recruitment_source_url(source_url)
      AND public.recruitment_source_url(source_url) IS NOT NULL
    )
  );
