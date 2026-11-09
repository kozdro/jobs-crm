-- Queue contains opaque intent identifiers only. The worker role has no table privileges.
CREATE EXTENSION IF NOT EXISTS pgmq;
--> statement-breakpoint
SELECT pgmq.create('email_reminders');
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jobs_email_worker') THEN CREATE ROLE jobs_email_worker NOLOGIN; END IF; END $$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA email_reminder FROM jobs_email_worker;
--> statement-breakpoint
GRANT USAGE ON SCHEMA email_reminder TO jobs_email_worker;
--> statement-breakpoint
ALTER TABLE email_reminder.intent ADD COLUMN retry_after timestamptz;
--> statement-breakpoint
CREATE TABLE email_reminder.attempt (
 id uuid PRIMARY KEY,
 intent_id uuid NOT NULL REFERENCES email_reminder.intent(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 outcome text NOT NULL CHECK (outcome IN ('dispatching','safe_failure','permanent_failure','accepted','unknown','cancelled','expired')),
 finished_at timestamptz
);
--> statement-breakpoint
REVOKE ALL ON email_reminder.attempt FROM PUBLIC,anon,authenticated,service_role,jobs_email_worker;
--> statement-breakpoint
CREATE FUNCTION email_reminder.enqueue_due() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE i email_reminder.intent%ROWTYPE; mid bigint; n integer:=0;
BEGIN
 FOR i IN SELECT * FROM email_reminder.intent WHERE enabled AND state='pending' AND scheduled_at<=clock_timestamp() AND (retry_after IS NULL OR retry_after<=clock_timestamp()) ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LIMIT 50 LOOP
   IF clock_timestamp()>i.scheduled_at+interval '6 hours' THEN
     UPDATE email_reminder.intent SET enabled=false,state='expired',terminal_at=clock_timestamp() WHERE id=i.id;
   ELSE
     SELECT pgmq.send('email_reminders',jsonb_build_object('intent_id',i.id)) INTO mid;
     UPDATE email_reminder.intent SET state='queued',queued_message_id=mid WHERE id=i.id;
     n:=n+1;
   END IF;
 END LOOP;
 RETURN n;
END $fn$;
--> statement-breakpoint
CREATE FUNCTION email_reminder.claim() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE m record; i email_reminder.intent%ROWTYPE; a uuid;
BEGIN
 SELECT * INTO m FROM pgmq.read('email_reminders',60,1);
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- A dispatch transaction can hold the intent while it deletes this message.
 -- Never wait on that row while pgmq.read holds the queue message lock.
 SELECT * INTO i FROM email_reminder.intent WHERE id=(m.message->>'intent_id')::uuid FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN
   IF NOT EXISTS (SELECT 1 FROM email_reminder.intent WHERE id=(m.message->>'intent_id')::uuid) THEN
     PERFORM pgmq.delete('email_reminders',m.msg_id);
   END IF;
   RETURN NULL;
 END IF;
 IF i.queued_message_id IS DISTINCT FROM m.msg_id THEN
   PERFORM pgmq.delete('email_reminders',m.msg_id); RETURN NULL;
 END IF;
 IF i.state='dispatching' THEN
   UPDATE email_reminder.intent SET state='unknown',enabled=false,terminal_at=clock_timestamp() WHERE id=i.id;
   UPDATE email_reminder.attempt SET outcome='unknown',finished_at=clock_timestamp() WHERE id=i.attempt_id AND outcome='dispatching';
   PERFORM pgmq.delete('email_reminders',m.msg_id); RETURN NULL;
 END IF;
 IF i.state<>'queued' OR NOT i.enabled THEN
   PERFORM pgmq.delete('email_reminders',m.msg_id); RETURN NULL;
 END IF;
 a:=gen_random_uuid();
 UPDATE email_reminder.intent SET state='dispatching',attempt_id=a WHERE id=i.id;
 INSERT INTO email_reminder.attempt(id,intent_id,outcome) VALUES(a,i.id,'dispatching');
 RETURN a;
END $fn$;
--> statement-breakpoint
-- Caller MUST retain this transaction, including its Auth and owner locks, through provider handoff and finish.
CREATE FUNCTION email_reminder.prepare(p_attempt uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE i email_reminder.intent%ROWTYPE; u auth.users%ROWTYPE; valid boolean;
BEGIN
 SELECT * INTO i FROM email_reminder.intent WHERE attempt_id=p_attempt AND state='dispatching';
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO u FROM auth.users WHERE id=i.owner_id FOR SHARE;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(i.owner_id::text,76211));
 SELECT * INTO i FROM email_reminder.intent WHERE attempt_id=p_attempt AND state='dispatching' FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT EXISTS (
   SELECT 1 FROM public.recruitment_task t
   JOIN LATERAL (SELECT * FROM public.recruitment_reminder_command c WHERE c.owner_id=t.owner_id AND c.payload->>'operation'='set-reminder' AND (c.payload->>'taskId')::uuid=t.id ORDER BY c.order_no DESC LIMIT 1) c ON true
   WHERE t.owner_id=i.owner_id AND t.id=i.task_id AND t.status='Do zrobienia' AND c.request_id=i.configuration_id
     AND NOT EXISTS (SELECT 1 FROM public.recruitment_task_command a WHERE a.owner_id=t.owner_id AND a.task_id=t.id AND (a.after_values->>'revision')::integer > (c.payload->>'expectedRevision')::integer AND (a.before_values->>'status' IS DISTINCT FROM a.after_values->>'status' OR a.before_values->>'due_on' IS DISTINCT FROM a.after_values->>'due_on' OR a.before_values->>'case_id' IS DISTINCT FROM a.after_values->>'case_id'))
     AND NOT EXISTS (SELECT 1 FROM public.recruitment_reminder_command x WHERE x.owner_id=c.owner_id AND x.payload->>'operation' IN ('acknowledge','disable') AND (x.payload->>'configurationId')::uuid=c.request_id)
 ) INTO valid;
 IF NOT i.enabled OR NOT valid OR u.email IS NULL OR length(btrim(u.email))=0 OR u.email_confirmed_at IS NULL OR clock_timestamp()>i.scheduled_at+interval '6 hours' THEN
   UPDATE email_reminder.intent SET enabled=false,state=CASE WHEN clock_timestamp()>i.scheduled_at+interval '6 hours' THEN 'expired' ELSE 'cancelled' END,terminal_at=clock_timestamp() WHERE id=i.id;
   UPDATE email_reminder.attempt SET outcome=CASE WHEN clock_timestamp()>i.scheduled_at+interval '6 hours' THEN 'expired' ELSE 'cancelled' END,finished_at=clock_timestamp() WHERE id=p_attempt AND outcome='dispatching';
   PERFORM pgmq.delete('email_reminders',i.queued_message_id);
   RETURN NULL;
 END IF;
 RETURN u.email;
END $fn$;
--> statement-breakpoint
CREATE FUNCTION email_reminder.finish(p_attempt uuid,p_outcome text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE i email_reminder.intent%ROWTYPE;
BEGIN
 IF p_outcome NOT IN ('accepted','safe_failure','permanent_failure','unknown') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 SELECT * INTO i FROM email_reminder.intent WHERE attempt_id=p_attempt AND state='dispatching' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown attempt'; END IF;
 PERFORM pgmq.delete('email_reminders',i.queued_message_id);
 UPDATE email_reminder.attempt SET outcome=p_outcome,finished_at=clock_timestamp() WHERE id=p_attempt AND outcome='dispatching';
 UPDATE email_reminder.intent SET state=CASE p_outcome WHEN 'safe_failure' THEN 'pending' WHEN 'permanent_failure' THEN 'failed' ELSE p_outcome END,
   enabled=(p_outcome='safe_failure'),retry_after=CASE WHEN p_outcome='safe_failure' THEN clock_timestamp()+interval '1 minute' ELSE NULL END,
   terminal_at=CASE WHEN p_outcome='safe_failure' THEN NULL ELSE clock_timestamp() END,queued_message_id=NULL
 WHERE id=i.id;
END $fn$;
--> statement-breakpoint
CREATE FUNCTION email_reminder.purge_terminal() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE n integer; BEGIN
 DELETE FROM email_reminder.intent WHERE terminal_at IS NOT NULL AND terminal_at<=clock_timestamp()-interval '30 days';
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION email_reminder.enqueue_due(),email_reminder.claim(),email_reminder.prepare(uuid),email_reminder.finish(uuid,text),email_reminder.purge_terminal() FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION email_reminder.enqueue_due(),email_reminder.claim(),email_reminder.prepare(uuid),email_reminder.finish(uuid,text),email_reminder.purge_terminal() TO jobs_email_worker;
