-- Independent consent evidence: no Auth object is changed by this migration.
-- Existing intents have no evidence and therefore cannot dispatch until renewed.
ALTER TABLE email_reminder.auth_version ADD COLUMN consent_context jsonb, ADD COLUMN consent_xid numeric;
--> statement-breakpoint
ALTER TABLE email_reminder.intent ADD COLUMN consent_context jsonb, ADD COLUMN consent_xid numeric;
--> statement-breakpoint
-- Kept separate from catalog reads for deterministic missing/disabled/changed tests.
CREATE FUNCTION email_reminder.auth_guard_matches(p_trigger jsonb,p_function jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $guard$
 SELECT COALESCE(p_trigger=jsonb_build_object(
   'enabled','O','definition','CREATE TRIGGER email_reminder_auth_changed AFTER UPDATE OF email, email_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION email_reminder.auth_changed()')
 AND p_function=jsonb_build_object('source',$expected$
BEGIN
 IF NEW.email IS DISTINCT FROM OLD.email OR NEW.email_confirmed_at IS DISTINCT FROM OLD.email_confirmed_at THEN
   PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.id::text,76211));
   INSERT INTO email_reminder.auth_version(owner_id,version) VALUES(NEW.id,gen_random_uuid())
     ON CONFLICT(owner_id) DO UPDATE SET version=EXCLUDED.version;
   UPDATE email_reminder.intent SET enabled=false,
     state=CASE WHEN state IN ('pending','queued') THEN 'cancelled' ELSE state END,
     terminal_at=CASE WHEN state IN ('pending','queued') THEN clock_timestamp() ELSE terminal_at END
   WHERE owner_id=NEW.id AND enabled;
 END IF;
 RETURN NEW;
END;
$expected$,
   'securityDefiner',true,'config',jsonb_build_array('search_path=""'),
   'language','plpgsql','result','trigger','arguments',''),false);
$guard$;
--> statement-breakpoint
CREATE FUNCTION email_reminder.auth_guard_valid() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $guard$
 SELECT email_reminder.auth_guard_matches(
   (SELECT jsonb_build_object('enabled',t.tgenabled::text,'definition',pg_catalog.pg_get_triggerdef(t.oid))
    FROM pg_catalog.pg_trigger t WHERE t.tgrelid='auth.users'::regclass AND t.tgname='email_reminder_auth_changed' AND NOT t.tgisinternal),
   (SELECT jsonb_build_object('source',p.prosrc,'securityDefiner',p.prosecdef,'config',to_jsonb(p.proconfig),
      'language',l.lanname,'result',pg_catalog.pg_get_function_result(p.oid),'arguments',pg_catalog.pg_get_function_identity_arguments(p.oid))
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE p.oid=pg_catalog.to_regprocedure('email_reminder.auth_changed()')));
$guard$;
--> statement-breakpoint
-- The Auth row lock is retained by the surrounding transaction through handoff.
CREATE FUNCTION email_reminder.auth_context(p_owner uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $context$
 SELECT jsonb_build_object('email',u.email,'confirmedAt',u.email_confirmed_at,
   'xmin',u.xmin::text,'ctid',u.ctid::text,
   'relation',u.tableoid::text,'filenode',pg_catalog.pg_relation_filenode(u.tableoid)::text)
 FROM auth.users u WHERE u.id=p_owner FOR SHARE;
$context$;
--> statement-breakpoint
-- xmin is only 32 bits. Expire evidence BEFORE its saved low XID can recur,
-- even when the original tuple is ancient/frozen. ctid detects same-XID updates.
-- Full XID reversal (e.g. an incompatible restore) also fails closed.
CREATE FUNCTION email_reminder.consent_context_matches(p_saved jsonb,p_captured numeric,p_current jsonb,p_now numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $context$
 SELECT COALESCE(p_saved=p_current AND p_saved ?& ARRAY['email','confirmedAt','xmin','ctid','relation','filenode']
   AND p_saved->>'email' IS NOT NULL AND length(btrim(p_saved->>'email'))>0
   AND p_saved->>'confirmedAt' IS NOT NULL
   AND (p_saved->>'xmin')::numeric BETWEEN 3 AND 4294967295
   AND p_captured>=3 AND p_now>=p_captured
   AND p_now-p_captured < mod((p_saved->>'xmin')::numeric-mod(p_captured,4294967296)+4294967295,4294967296)+1,false);
$context$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.read_email_reminder(p_task_id uuid,p_configuration_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u auth.users%ROWTYPE; active jsonb; selected email_reminder.intent%ROWTYPE; current_version uuid; context jsonb; snapshot email_reminder.auth_version%ROWTYPE; current_xid numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required'; END IF;
 IF NOT email_reminder.auth_guard_valid() THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Consent context unavailable'; END IF;
 context:=email_reminder.auth_context(auth.uid());
 current_xid:=pg_catalog.pg_current_xact_id()::text::numeric;
 SELECT * INTO u FROM auth.users WHERE id=auth.uid();
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 INSERT INTO email_reminder.auth_version(owner_id) VALUES(auth.uid()) ON CONFLICT(owner_id) DO NOTHING;
 SELECT * INTO snapshot FROM email_reminder.auth_version WHERE owner_id=auth.uid() FOR UPDATE;
 IF NOT email_reminder.consent_context_matches(snapshot.consent_context,snapshot.consent_xid,context,current_xid) THEN
   UPDATE email_reminder.auth_version SET version=gen_random_uuid(),consent_context=context,consent_xid=current_xid WHERE owner_id=auth.uid();
   UPDATE email_reminder.intent SET enabled=false,
     state=CASE WHEN state IN ('pending','queued') THEN 'cancelled' ELSE state END,
     terminal_at=CASE WHEN state IN ('pending','queued') THEN clock_timestamp() ELSE terminal_at END
     WHERE owner_id=auth.uid() AND enabled;
 END IF;
 SELECT version INTO current_version FROM email_reminder.auth_version WHERE owner_id=auth.uid();
 SELECT public.recruitment_current_reminder(p_task_id) INTO active;
 IF active IS NULL OR active->>'id' IS DISTINCT FROM p_configuration_id::text THEN
   RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Reminder changed';
 END IF;
 SELECT * INTO selected FROM email_reminder.intent WHERE owner_id=auth.uid() AND task_id=p_task_id AND configuration_id=p_configuration_id;
 RETURN jsonb_build_object('enabled',COALESCE(selected.enabled,false),'state',COALESCE(selected.state,'off'),'consentVersion',current_version,
   'email',CASE WHEN u.email IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(u.email))>0 AND u.email_confirmed_at IS NOT NULL THEN u.email ELSE NULL END,
   'verified',u.email IS NOT NULL AND pg_catalog.length(pg_catalog.btrim(u.email))>0 AND u.email_confirmed_at IS NOT NULL);
END;
$fn$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.execute_email_reminder(p_request_id uuid,p_task_id uuid,p_configuration_id uuid,p_enabled boolean,p_consent_version uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE u auth.users%ROWTYPE; active jsonb; old email_reminder.command%ROWTYPE; prior email_reminder.intent%ROWTYPE; current_version uuid; context jsonb; snapshot email_reminder.auth_version%ROWTYPE; current_xid numeric;
 intent jsonb:=jsonb_build_object('taskId',p_task_id,'configurationId',p_configuration_id,'enabled',p_enabled,'consentVersion',p_consent_version);
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR p_task_id IS NULL OR p_configuration_id IS NULL OR p_enabled IS NULL OR (p_enabled AND p_consent_version IS NULL) OR (NOT p_enabled AND p_consent_version IS NOT NULL) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Authentication required';
 END IF;
 -- Same order as auth trigger: Auth row first, then owner advisory lock.
 context:=email_reminder.auth_context(auth.uid());
 current_xid:=pg_catalog.pg_current_xact_id()::text::numeric;
 SELECT * INTO u FROM auth.users WHERE id=auth.uid();
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,76211));
 SELECT * INTO snapshot FROM email_reminder.auth_version WHERE owner_id=auth.uid();
 current_version:=snapshot.version;
 IF p_enabled AND (NOT email_reminder.auth_guard_valid() OR NOT email_reminder.consent_context_matches(snapshot.consent_context,snapshot.consent_xid,context,current_xid)) THEN
   RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Consent context changed';
 END IF;
 SELECT * INTO old FROM email_reminder.command WHERE owner_id=auth.uid() AND request_id=p_request_id;
 IF FOUND THEN
   IF old.payload IS DISTINCT FROM intent THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Intent conflict'; END IF;
   IF p_enabled AND p_consent_version IS DISTINCT FROM current_version THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Consent context changed'; END IF;
   RETURN jsonb_build_object('kind','replayed');
 END IF;
 SELECT public.recruitment_current_reminder(p_task_id) INTO active;
 IF active IS NULL OR active->>'id' IS DISTINCT FROM p_configuration_id::text THEN
   RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Reminder changed';
 END IF;
 SELECT * INTO prior FROM email_reminder.intent WHERE owner_id=auth.uid() AND configuration_id=p_configuration_id FOR UPDATE;
 IF p_enabled THEN
   IF p_consent_version IS DISTINCT FROM current_version THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Consent context changed'; END IF;
   IF u.email IS NULL OR pg_catalog.length(pg_catalog.btrim(u.email))=0 OR u.email_confirmed_at IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Verified email required'; END IF;
   IF FOUND AND prior.state IN ('dispatching','accepted','unknown','expired','failed') THEN
     RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Delivery already attempted';
   END IF;
   INSERT INTO email_reminder.intent(owner_id,task_id,configuration_id,scheduled_at,enabled,state,terminal_at,consent_context,consent_xid)
     VALUES(auth.uid(),p_task_id,p_configuration_id,(active->>'instant')::timestamptz,true,'pending',NULL,context,current_xid)
   ON CONFLICT(owner_id,configuration_id) DO UPDATE SET enabled=true,state='pending',terminal_at=NULL,queued_message_id=NULL,attempt_id=NULL,consent_context=EXCLUDED.consent_context,consent_xid=EXCLUDED.consent_xid
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
CREATE OR REPLACE FUNCTION email_reminder.prepare(p_attempt uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE i email_reminder.intent%ROWTYPE; u auth.users%ROWTYPE; valid boolean; context jsonb; current_xid numeric; guard_valid boolean;
BEGIN
 SELECT * INTO i FROM email_reminder.intent WHERE attempt_id=p_attempt AND state='dispatching';
 IF NOT FOUND THEN RETURN NULL; END IF;
 context:=email_reminder.auth_context(i.owner_id);
 current_xid:=pg_catalog.pg_current_xact_id()::text::numeric;
 guard_valid:=email_reminder.auth_guard_valid();
 SELECT * INTO u FROM auth.users WHERE id=i.owner_id;
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
 IF NOT guard_valid OR NOT email_reminder.consent_context_matches(i.consent_context,i.consent_xid,context,current_xid) OR NOT i.enabled OR NOT valid OR u.email IS NULL OR length(btrim(u.email))=0 OR u.email_confirmed_at IS NULL OR clock_timestamp()>i.scheduled_at+interval '6 hours' THEN
   UPDATE email_reminder.intent SET enabled=false,state=CASE WHEN clock_timestamp()>i.scheduled_at+interval '6 hours' THEN 'expired' ELSE 'cancelled' END,terminal_at=clock_timestamp() WHERE id=i.id;
   UPDATE email_reminder.attempt SET outcome=CASE WHEN clock_timestamp()>i.scheduled_at+interval '6 hours' THEN 'expired' ELSE 'cancelled' END,finished_at=clock_timestamp() WHERE id=p_attempt AND outcome='dispatching';
   PERFORM pgmq.delete('email_reminders',i.queued_message_id);
   RETURN NULL;
 END IF;
 RETURN i.consent_context->>'email';
END $fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION email_reminder.auth_guard_matches(jsonb,jsonb),email_reminder.auth_guard_valid(),email_reminder.auth_context(uuid),email_reminder.consent_context_matches(jsonb,numeric,jsonb,numeric) FROM PUBLIC,anon,authenticated,service_role,jobs_email_worker;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
