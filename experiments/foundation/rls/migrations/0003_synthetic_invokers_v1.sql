-- SYNTHETIC FOUNDATION PoC v1. Minimal invoker surfaces, not the atomic F4 RPC.
CREATE VIEW foundation_poc.probe_item_view
WITH (security_invoker = true)
AS SELECT owner_id, id, marker, revision FROM foundation_poc.probe_item;
--> statement-breakpoint
REVOKE ALL ON foundation_poc.probe_item_view FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT SELECT ON foundation_poc.probe_item_view TO authenticated;
--> statement-breakpoint
CREATE FUNCTION foundation_poc.probe_set_marker(p_item_id uuid, p_marker text)
RETURNS SETOF foundation_poc.probe_item
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE foundation_poc.probe_item
  SET marker = p_marker, revision = revision + 1
  WHERE id = p_item_id
  RETURNING *;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION foundation_poc.probe_set_marker(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION foundation_poc.probe_set_marker(uuid, text) TO authenticated;
--> statement-breakpoint
COMMENT ON SCHEMA foundation_poc IS 'Synthetic Jobs CRM Foundation F2 PoC; non-production; no business entities';
