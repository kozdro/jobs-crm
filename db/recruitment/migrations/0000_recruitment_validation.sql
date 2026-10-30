-- Custom SQL migration file, put your code below! --
-- DEC-052 product helpers, before the generated table constraints that use them.
-- JavaScript String.trim() WhiteSpace + LineTerminator set (ECMAScript, not locale-dependent).
CREATE FUNCTION public.recruitment_trim(value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT pg_catalog.btrim(value, E'\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff');
$$;
--> statement-breakpoint
-- Input from the application uses WHATWG URL.href. Validate the HTTP(S) URI
-- structure again at the DB boundary, including authority, IPv4/IPv6 and ports.
-- No DNS, HTTP, HTML, metadata or favicon request is ever made by this function.
CREATE FUNCTION public.recruitment_source_url(value text)
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
BEGIN
  -- URL.href contains ASCII output. Raw spaces/control/non-ASCII or backslashes
  -- are not a canonical persisted URL; the BFF parser escapes them first.
  IF value = '' OR value ~ '[^\x21-\x7e]' OR pg_catalog.strpos(value, E'\\') > 0 THEN RETURN NULL; END IF;
  matched := pg_catalog.regexp_match(value, '^(https?)://([^/?#]+)([/?#].*)?$', 'i');
  IF matched IS NULL THEN RETURN NULL; END IF;
  scheme := pg_catalog.lower(matched[1]);
  authority := matched[2];
  suffix := COALESCE(matched[3], '');
  IF pg_catalog.strpos(authority, '@') > 0 THEN
    matched := pg_catalog.regexp_match(authority, '^([^@]*)@([^@]+)$');
    IF matched IS NULL OR matched[1] !~ '^[A-Za-z0-9._~!$&''()*+,;=:%-]*$' THEN RETURN NULL; END IF;
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
    -- Keep WHATWG's hexadecimal spelling (including mapped IPv4 addresses),
    -- while rejecting invalid IPv6 via PostgreSQL's inet parser above.
    hostpart := '[' || pg_catalog.lower(hostmatch[1]) || ']';
    portpart := hostmatch[3];
  ELSE
    hostmatch := pg_catalog.regexp_match(authority, '^([^:]+)(:([0-9]+))?$');
    IF hostmatch IS NULL THEN RETURN NULL; END IF;
    hostpart := pg_catalog.lower(hostmatch[1]);
    portpart := hostmatch[3];
    IF hostpart !~ '^[a-z0-9._~!$&''()*+,;=-]+$' THEN RETURN NULL; END IF;
    -- A numeric last label is interpreted as IPv4 by WHATWG, not DNS.
    IF hostpart ~ '(^|\.)[0-9]+\.?$' THEN
      IF hostpart !~ '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' THEN RETURN NULL; END IF;
      BEGIN
        address := hostpart::pg_catalog.inet;
      EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
      END;
      IF pg_catalog.family(address) <> 4 OR pg_catalog.host(address) <> hostpart THEN RETURN NULL; END IF;
    ELSIF hostpart ~ '(^|\.)0x[0-9a-f]+\.?$' THEN
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
REVOKE ALL ON FUNCTION public.recruitment_trim(text) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.recruitment_source_url(text) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.recruitment_trim(text), public.recruitment_source_url(text) TO authenticated;
