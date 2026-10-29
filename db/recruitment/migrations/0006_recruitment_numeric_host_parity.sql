-- Forward parity fix: WHATWG's numeric-host detection also treats bare "0x"
-- as a hexadecimal-number label. Its canonical URL.href is 0.0.0.0; a.0x is
-- invalid. Reject these raw spellings at the serialized DB boundary instead
-- of persisting a value the BFF would transform or reject on retry.
-- No ACE/IDNA policy change; keep migrations 0000-0005 immutable.
CREATE OR REPLACE FUNCTION public.recruitment_source_url(value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  matched text[];
  scheme text;
  authority text;
  suffix text;
  userinfo text := '';
  hostpart text;
  portpart text;
  hostmatch text[];
  address inet;
  portnumber integer;
  pathpart text;
  querypart text;
  fragmentpart text;
  separator integer;
  address_bytes bytea;
  words text[] := ARRAY[]::text[];
  word_value integer;
  word_index integer;
  run_start integer := 0;
  run_length integer := 0;
  best_start integer := 0;
  best_length integer := 0;
  ipv6_text text := '';
BEGIN
  -- URL.href contains ASCII output. Raw spaces/control/non-ASCII or backslashes
  -- are not a canonical persisted URL; the BFF parser escapes them first.
  IF value = '' OR value ~ '[^\x21-\x7e]' OR pg_catalog.strpos(value, E'\\') > 0 THEN RETURN NULL; END IF;
  matched := pg_catalog.regexp_match(value, '^(https?)://([^/?#]+)([/?#].*)?$', 'i');
  IF matched IS NULL THEN RETURN NULL; END IF;
  scheme := pg_catalog.lower(matched[1]);
  authority := matched[2];
  suffix := COALESCE(matched[3], '');
  -- Compare serialized components rather than silently storing a raw spelling
  -- that Node URL.href would change on replay through the BFF. Raw callers can
  -- canonicalize with URL.href too; the product UI already does so.
  pathpart := suffix;
  separator := pg_catalog.strpos(pathpart, '#');
  IF separator > 0 THEN
    fragmentpart := pg_catalog.substr(pathpart, separator + 1);
    pathpart := pg_catalog.left(pathpart, separator - 1);
  END IF;
  separator := pg_catalog.strpos(pathpart, '?');
  IF separator > 0 THEN
    querypart := pg_catalog.substr(pathpart, separator + 1);
    pathpart := pg_catalog.left(pathpart, separator - 1);
  END IF;
  -- Path, special-query and fragment have different WHATWG percent-encode
  -- sets. Already escaped octets are preserved, including their letter case.
  IF pathpart ~ '["<>^`{}]' OR querypart ~ '["''<>]' OR fragmentpart ~ '["<>`]' THEN RETURN NULL; END IF;
  -- WHATWG removes literal or percent-encoded single/double dot path segments.
  -- Do not inspect query/fragment values: those may be publication identifiers.
  IF pathpart ~* '(^|/)(\.|%2e){1,2}(/|$)' THEN RETURN NULL; END IF;
  IF pg_catalog.strpos(authority, '@') > 0 THEN
    matched := pg_catalog.regexp_match(authority, '^([^@]*)@([^@]+)$');
    IF matched IS NULL OR matched[1] = '' OR pg_catalog.right(matched[1], 1) = ':'
      OR matched[1] !~ '^[A-Za-z0-9._~!$&''()*+,%_-]*(:[A-Za-z0-9._~!$&''()*+,%_-]*)?$'
    THEN RETURN NULL; END IF;
    userinfo := matched[1] || '@';
    authority := matched[2];
  END IF;
  IF pg_catalog.left(authority, 1) = '[' THEN
    hostmatch := pg_catalog.regexp_match(authority, '^\[([0-9a-fA-F:.]+)\](:([0-9]+))?$');
    IF hostmatch IS NULL THEN RETURN NULL; END IF;
    BEGIN
      address := hostmatch[1]::pg_catalog.inet;
    EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
    END;
    IF pg_catalog.family(address) <> 6 THEN RETURN NULL; END IF;
    -- inet's text form can use dotted IPv4 tails; WHATWG always serializes
    -- eight hexadecimal words, compressing the FIRST longest zero run >= 2.
    -- inet_send's four-byte header precedes the sixteen IPv6 address bytes.
    address_bytes := pg_catalog.inet_send(address);
    FOR word_index IN 0..7 LOOP
      word_value := pg_catalog.get_byte(address_bytes, 4 + word_index * 2) * 256
        + pg_catalog.get_byte(address_bytes, 5 + word_index * 2);
      words := pg_catalog.array_append(words, pg_catalog.to_hex(word_value));
      IF word_value = 0 THEN
        IF run_length = 0 THEN run_start := word_index + 1; END IF;
        run_length := run_length + 1;
        IF run_length > best_length THEN best_start := run_start; best_length := run_length; END IF;
      ELSE
        run_length := 0;
      END IF;
    END LOOP;
    word_index := 1;
    WHILE word_index <= 8 LOOP
      IF best_length >= 2 AND word_index = best_start THEN
        ipv6_text := ipv6_text || '::';
        word_index := word_index + best_length;
      ELSE
        IF ipv6_text <> '' AND pg_catalog.right(ipv6_text, 1) <> ':' THEN ipv6_text := ipv6_text || ':'; END IF;
        ipv6_text := ipv6_text || words[word_index];
        word_index := word_index + 1;
      END IF;
    END LOOP;
    IF hostmatch[1] <> ipv6_text THEN RETURN NULL; END IF;
    hostpart := '[' || ipv6_text || ']';
    portpart := hostmatch[3];
  ELSE
    hostmatch := pg_catalog.regexp_match(authority, '^([^:]+)(:([0-9]+))?$');
    IF hostmatch IS NULL THEN RETURN NULL; END IF;
    hostpart := pg_catalog.lower(hostmatch[1]);
    portpart := hostmatch[3];
    -- WHATWG special hosts permit printable ASCII punctuation such as quote,
    -- backtick and braces. Reject forbidden host codepoints, not arbitrary DNS
    -- label conventions: this contract stores URLs without resolving DNS.
    IF hostpart !~ '^[a-z0-9.!"$&''()*+,;=_`{}~-]+$' THEN RETURN NULL; END IF;
    -- A numeric last label is interpreted as IPv4 by WHATWG, not DNS.
    IF hostpart ~ '(^|\.)[0-9]+\.?$' THEN
      IF hostpart !~ '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' THEN RETURN NULL; END IF;
      BEGIN
        address := hostpart::pg_catalog.inet;
      EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
      END;
      IF pg_catalog.family(address) <> 4 OR pg_catalog.host(address) <> hostpart THEN RETURN NULL; END IF;
    ELSIF hostpart ~ '(^|\.)0x[0-9a-f]*\.?$' THEN
      RETURN NULL;
    END IF;
  END IF;
  IF portpart IS NOT NULL THEN
    -- Avoid integer overflow; large zero-prefixed inputs are not canonical.
    IF pg_catalog.length(portpart) > 5 THEN RETURN NULL; END IF;
    portnumber := portpart::integer;
    IF portnumber > 65535 THEN RETURN NULL; END IF;
    portpart := CASE WHEN (scheme = 'http' AND portnumber = 80) OR (scheme = 'https' AND portnumber = 443) THEN '' ELSE ':' || portnumber::text END;
  END IF;
  IF suffix = '' OR pg_catalog.left(suffix, 1) IN ('?', '#') THEN suffix := '/' || suffix; END IF;
  RETURN scheme || '://' || userinfo || hostpart || COALESCE(portpart, '') || suffix;
END;
$fn$;
--> statement-breakpoint
ALTER TABLE public.recruitment_case
  DROP CONSTRAINT recruitment_case_url_valid,
  ADD CONSTRAINT recruitment_case_url_valid CHECK (
    source_url IS NULL OR (
      source_url = public.recruitment_source_url(source_url)
      AND public.recruitment_source_url(source_url) IS NOT NULL
    )
  );

--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
