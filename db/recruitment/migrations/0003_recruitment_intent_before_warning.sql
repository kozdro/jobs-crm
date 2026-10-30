-- Forward fix for the direct Data API INSERT / RPC duplicate-warning race.
-- Migrations 0000-0002 are already applied and remain byte-for-byte immutable.
-- CREATE OR REPLACE retains the existing function signature and EXECUTE ACL.
CREATE OR REPLACE FUNCTION public.create_recruitment_case(
  p_request_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_source_url text DEFAULT NULL,
  p_allow_duplicate boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_owner uuid := auth.uid();
  v_title text := public.recruitment_trim(p_title);
  v_description text := NULLIF(public.recruitment_trim(p_description), '');
  v_source_url text;
  v_existing public.recruitment_case%ROWTYPE;
  v_created public.recruitment_case%ROWTYPE;
  v_matches jsonb;
  v_match_count integer;
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required'; END IF;
  IF p_request_id IS NULL OR v_title IS NULL OR pg_catalog.char_length(v_title) NOT BETWEEN 1 AND 160
    OR (v_description IS NOT NULL AND pg_catalog.char_length(v_description) > 2000)
    OR p_allow_duplicate IS NULL
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid case input'; END IF;
  IF p_source_url IS NOT NULL AND public.recruitment_trim(p_source_url) <> '' THEN
    v_source_url := public.recruitment_source_url(public.recruitment_trim(p_source_url));
    IF v_source_url IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid source URL'; END IF;
  END IF;

  -- All create commands of one owner serialize, including duplicate checks.
  -- Hash collisions only serialize unrelated owners; RLS remains the authority.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 76211));
  SELECT * INTO v_existing FROM public.recruitment_case
    WHERE owner_id = v_owner AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.title IS DISTINCT FROM v_title OR v_existing.description IS DISTINCT FROM v_description
      OR v_existing.source_url IS DISTINCT FROM v_source_url THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Save intent payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object('kind', 'replayed', 'case', pg_catalog.to_jsonb(v_existing) - 'owner_id' - 'request_id');
  END IF;

  IF NOT p_allow_duplicate THEN
    SELECT COALESCE(pg_catalog.jsonb_agg(candidate.projection ORDER BY candidate.created_at DESC, candidate.id DESC)
      FILTER (WHERE candidate.position <= 20), '[]'::jsonb), pg_catalog.count(*)::integer
      INTO v_matches, v_match_count
      FROM (
        SELECT pg_catalog.to_jsonb(c) - 'owner_id' - 'request_id' AS projection, c.created_at, c.id,
          pg_catalog.row_number() OVER (ORDER BY c.created_at DESC, c.id DESC) AS position
        FROM public.recruitment_case AS c WHERE c.owner_id = v_owner AND
          (c.title = v_title OR (v_source_url IS NOT NULL AND pg_catalog.md5(c.source_url) = pg_catalog.md5(v_source_url) AND c.source_url = v_source_url))
        ORDER BY c.created_at DESC, c.id DESC LIMIT 21
      ) AS candidate;
    IF v_match_count > 0 THEN
      -- A direct INSERT does not take the RPC advisory lock. It can commit after
      -- the initial intent lookup and become a match in the later SELECT.
      -- Resolve that owner/key first: an intent is replay/conflict, not a
      -- business-duplicate decision. Under READ COMMITTED this statement sees
      -- every row that was visible to the preceding duplicate query.
      SELECT * INTO v_existing FROM public.recruitment_case
        WHERE owner_id = v_owner AND request_id = p_request_id;
      IF FOUND THEN
        IF v_existing.title IS DISTINCT FROM v_title OR v_existing.description IS DISTINCT FROM v_description
          OR v_existing.source_url IS DISTINCT FROM v_source_url THEN
          RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Save intent payload conflict';
        END IF;
        RETURN pg_catalog.jsonb_build_object('kind', 'replayed', 'case', pg_catalog.to_jsonb(v_existing) - 'owner_id' - 'request_id');
      END IF;
      RETURN pg_catalog.jsonb_build_object('kind', 'duplicates', 'matches', v_matches, 'hasMore', v_match_count > 20);
    END IF;
  END IF;

  -- A direct permitted INSERT may race this RPC. Unique owner/key is the final
  -- arbiter; never obtain UPDATE privileges just to return an existing result.
  INSERT INTO public.recruitment_case (request_id, title, description, source_url)
    VALUES (p_request_id, v_title, v_description, v_source_url)
    ON CONFLICT ON CONSTRAINT recruitment_case_owner_request_unique DO NOTHING
    RETURNING * INTO v_created;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('kind', 'created', 'case', pg_catalog.to_jsonb(v_created) - 'owner_id' - 'request_id');
  END IF;
  -- This new statement sees a concurrently committed row under READ COMMITTED.
  SELECT * INTO v_existing FROM public.recruitment_case
    WHERE owner_id = v_owner AND request_id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Retry the same save intent'; END IF;
  IF v_existing.title IS DISTINCT FROM v_title OR v_existing.description IS DISTINCT FROM v_description
    OR v_existing.source_url IS DISTINCT FROM v_source_url THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Save intent payload conflict';
  END IF;
  RETURN pg_catalog.jsonb_build_object('kind', 'replayed', 'case', pg_catalog.to_jsonb(v_existing) - 'owner_id' - 'request_id');
END;
$fn$;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
