-- Email consent and delivery intent are private; the public RPC checks auth.uid().
CREATE SCHEMA IF NOT EXISTS email_reminder;
--> statement-breakpoint
REVOKE ALL ON SCHEMA email_reminder FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE TABLE email_reminder.intent (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id),
 task_id uuid NOT NULL,
 configuration_id uuid NOT NULL,
 scheduled_at timestamptz NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','queued','dispatching','accepted','unknown','cancelled','expired','failed')),
 attempt_id uuid,
 queued_message_id bigint,
 terminal_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_id,configuration_id)
);
--> statement-breakpoint
CREATE INDEX email_reminder_pending_idx ON email_reminder.intent(scheduled_at) WHERE enabled AND state='pending';
--> statement-breakpoint
CREATE TABLE email_reminder.command (
 owner_id uuid NOT NULL REFERENCES auth.users(id),
 request_id uuid NOT NULL,
 payload jsonb NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,request_id)
);
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA email_reminder FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE FUNCTION email_reminder.auth_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NEW.email IS DISTINCT FROM OLD.email OR NEW.email_confirmed_at IS DISTINCT FROM OLD.email_confirmed_at THEN
   PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.id::text,76211));
   UPDATE email_reminder.intent SET enabled=false,
     state=CASE WHEN state IN ('pending','queued') THEN 'cancelled' ELSE state END,
     terminal_at=CASE WHEN state IN ('pending','queued') THEN clock_timestamp() ELSE terminal_at END
   WHERE owner_id=NEW.id AND enabled;
 END IF;
 RETURN NEW;
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION email_reminder.auth_changed() FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
CREATE TRIGGER email_reminder_auth_changed AFTER UPDATE OF email,email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION email_reminder.auth_changed();
--> statement-breakpoint
CREATE FUNCTION public.read_email_reminder(p_task_id uuid,p_configuration_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u auth.users%ROWTYPE; active jsonb; selected email_reminder.intent%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 SELECT * INTO u FROM auth.users WHERE id=auth.uid();
 SELECT public.recruitment_current_reminder(p_task_id) INTO active;
 IF active IS NULL OR active->>'id' IS DISTINCT FROM p_configuration_id::text THEN
   RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Reminder changed';
 END IF;
 SELECT * INTO selected FROM email_reminder.intent WHERE owner_id=auth.uid() AND task_id=p_task_id AND configuration_id=p_configuration_id;
 RETURN jsonb_build_object('enabled',COALESCE(selected.enabled,false),
   'email',CASE WHEN u.email IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(u.email))>0 AND u.email_confirmed_at IS NOT NULL THEN u.email ELSE NULL END,
   'verified',u.email IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(u.email))>0 AND u.email_confirmed_at IS NOT NULL);
END;
$fn$;
--> statement-breakpoint
CREATE FUNCTION public.execute_email_reminder(p_request_id uuid,p_task_id uuid,p_configuration_id uuid,p_enabled boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u auth.users%ROWTYPE; active jsonb; old email_reminder.command%ROWTYPE; prior email_reminder.intent%ROWTYPE;
 intent jsonb:=jsonb_build_object('taskId',p_task_id,'configurationId',p_configuration_id,'enabled',p_enabled);
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR p_task_id IS NULL OR p_configuration_id IS NULL OR p_enabled IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required';
 END IF;
 -- Same order as auth trigger: Auth row first, then owner advisory lock.
 SELECT * INTO u FROM auth.users WHERE id=auth.uid() FOR SHARE;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO old FROM email_reminder.command WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
   IF old.payload IS DISTINCT FROM intent THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent conflict'; END IF;
   RETURN jsonb_build_object('kind','replayed');
 END IF;
 SELECT public.recruitment_current_reminder(p_task_id) INTO active;
 IF active IS NULL OR active->>'id' IS DISTINCT FROM p_configuration_id::text THEN
   RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Reminder changed';
 END IF;
 SELECT * INTO prior FROM email_reminder.intent WHERE owner_id=auth.uid() AND configuration_id=p_configuration_id FOR UPDATE;
 IF p_enabled THEN
   IF u.email IS NULL OR pg_catalog.length(pg_catalog.btrim(u.email))=0 OR u.email_confirmed_at IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Verified email required'; END IF;
   IF FOUND AND prior.state IN ('dispatching','accepted','unknown','expired','failed') THEN
     RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Delivery already attempted';
   END IF;
   INSERT INTO email_reminder.intent(owner_id,task_id,configuration_id,scheduled_at,enabled,state,terminal_at)
     VALUES(auth.uid(),p_task_id,p_configuration_id,(active->>'instant')::timestamptz,true,'pending',NULL)
   ON CONFLICT(owner_id,configuration_id) DO UPDATE SET enabled=true,state='pending',terminal_at=NULL,queued_message_id=NULL,attempt_id=NULL
     WHERE NOT email_reminder.intent.enabled AND email_reminder.intent.state='cancelled';
 ELSE
   UPDATE email_reminder.intent SET enabled=false,
     state=CASE WHEN state IN ('pending','queued') THEN 'cancelled' ELSE state END,
     terminal_at=CASE WHEN state IN ('pending','queued') THEN clock_timestamp() ELSE terminal_at END
   WHERE owner_id=auth.uid() AND task_id=p_task_id AND configuration_id=p_configuration_id;
 END IF;
 INSERT INTO email_reminder.command(owner_id,request_id,payload,result) VALUES(auth.uid(),p_request_id,intent,jsonb_build_object('kind','created'));
 RETURN jsonb_build_object('kind','created');
END;
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.read_email_reminder(uuid,uuid),public.execute_email_reminder(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.read_email_reminder(uuid,uuid),public.execute_email_reminder(uuid,uuid,uuid,boolean) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
