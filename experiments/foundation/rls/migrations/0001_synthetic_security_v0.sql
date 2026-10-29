-- SYNTHETIC FOUNDATION PoC v0. Explicit grants and row policies, no product data.
ALTER DEFAULT PRIVILEGES IN SCHEMA foundation_poc REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA foundation_poc REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT USAGE ON SCHEMA foundation_poc TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA foundation_poc TO authenticated;
--> statement-breakpoint
CREATE POLICY probe_item_select_owner ON foundation_poc.probe_item
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
CREATE POLICY probe_item_insert_owner ON foundation_poc.probe_item
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
CREATE POLICY probe_item_update_owner ON foundation_poc.probe_item
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
CREATE POLICY probe_item_delete_owner ON foundation_poc.probe_item
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
CREATE POLICY probe_label_select_owner ON foundation_poc.probe_label
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
CREATE POLICY probe_label_insert_owner ON foundation_poc.probe_label
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
CREATE POLICY probe_label_update_owner ON foundation_poc.probe_label
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
CREATE POLICY probe_label_delete_owner ON foundation_poc.probe_label
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
CREATE POLICY probe_link_select_owner ON foundation_poc.probe_link
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);
--> statement-breakpoint
CREATE POLICY probe_link_insert_owner ON foundation_poc.probe_link
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = owner_id
    AND EXISTS (
      SELECT 1 FROM foundation_poc.probe_item AS item
      WHERE item.owner_id = probe_link.owner_id AND item.id = probe_link.item_id
    )
    AND EXISTS (
      SELECT 1 FROM foundation_poc.probe_label AS label
      WHERE label.owner_id = probe_link.owner_id AND label.id = probe_link.label_id
    ));
--> statement-breakpoint
CREATE POLICY probe_link_update_owner ON foundation_poc.probe_link
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id
    AND EXISTS (
      SELECT 1 FROM foundation_poc.probe_item AS item
      WHERE item.owner_id = probe_link.owner_id AND item.id = probe_link.item_id
    )
    AND EXISTS (
      SELECT 1 FROM foundation_poc.probe_label AS label
      WHERE label.owner_id = probe_link.owner_id AND label.id = probe_link.label_id
    ));
--> statement-breakpoint
CREATE POLICY probe_link_delete_owner ON foundation_poc.probe_link
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = owner_id);
