CREATE TABLE "recruitment_private"."document_upload_fence" (
	"owner_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_upload_fence_owner_request_unique" UNIQUE("owner_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "recruitment_private"."document_upload_fence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "document_upload_fence_expiry_idx" ON "recruitment_private"."document_upload_fence" USING btree ("expires_at");--> statement-breakpoint
REVOKE ALL ON recruitment_private.document_upload_fence FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
CREATE FUNCTION recruitment_private.document_request_expiry(p_id uuid) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path='' AS $fn$
DECLARE encoded text:=replace(p_id::text,'-',''); millis bigint;
BEGIN
 IF substring(encoded from 13 for 1)<>'7' OR substring(encoded from 17 for 1) NOT IN ('8','9','a','b') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid request id'; END IF;
 millis:=('x'||substring(encoded from 1 for 12))::bit(48)::bigint;
 -- Leave one second inside the seven-day ledger retention to allow at most
 -- one second of app/DB clock skew without extending the replay window.
 RETURN pg_catalog.to_timestamp(millis::double precision / 1000.0) + interval '7 days' - interval '1 second';
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION recruitment_private.document_request_expiry(uuid) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
CREATE FUNCTION recruitment_private.document_upload_fence_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE expires timestamptz:=recruitment_private.document_request_expiry(NEW.request_id);
BEGIN
 IF expires<=clock_timestamp() OR expires>clock_timestamp()+interval '7 days' OR EXISTS(SELECT 1 FROM recruitment_private.document_upload_fence f WHERE f.owner_id=NEW.owner_id AND f.request_id=NEW.request_id) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent expired or cancelled';
 END IF;
 RETURN NEW;
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION recruitment_private.document_upload_fence_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER document_upload_fence_guard BEFORE INSERT ON recruitment_private.document_upload_command FOR EACH ROW EXECUTE FUNCTION recruitment_private.document_upload_fence_guard();
--> statement-breakpoint
CREATE FUNCTION public.reconcile_document_upload(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE owner uuid:=auth.uid(); expires timestamptz; cmd recruitment_private.document_upload_command%ROWTYPE; phase text;
BEGIN
 IF owner IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 expires:=recruitment_private.document_request_expiry(p_request_id);
 IF expires>clock_timestamp()+interval '7 days' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid request id'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner::text,76211));
 SELECT * INTO cmd FROM recruitment_private.document_upload_command c WHERE c.owner_id=owner AND c.request_id=p_request_id;
 IF FOUND THEN
  SELECT o.phase INTO phase FROM recruitment_private.document_object o WHERE o.owner_id=owner AND o.version_id=cmd.version_id;
  IF phase='ready' THEN RETURN jsonb_build_object('kind','found','result',jsonb_build_object('kind','saved','documentId',cmd.document_id,'versionId',cmd.version_id)); END IF;
  RETURN jsonb_build_object('kind','pending');
 END IF;
 IF expires>clock_timestamp() THEN
  INSERT INTO recruitment_private.document_upload_fence(owner_id,request_id,expires_at) VALUES(owner,p_request_id,expires) ON CONFLICT(owner_id,request_id) DO NOTHING;
 END IF;
 RETURN jsonb_build_object('kind','cancelled');
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reconcile_document_upload(uuid) FROM PUBLIC,anon,authenticated,service_role;
