-- Preserve the highest allocated number even after unsent versions are purged.
CREATE TABLE recruitment_private.document_version_counter (
 owner_id uuid NOT NULL,
 document_id uuid NOT NULL,
 last_number integer NOT NULL CHECK (last_number > 0),
 PRIMARY KEY (owner_id, document_id),
 FOREIGN KEY (owner_id, document_id) REFERENCES public.document(owner_id,id) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE recruitment_private.document_version_counter ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON recruitment_private.document_version_counter FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
INSERT INTO recruitment_private.document_version_counter(owner_id,document_id,last_number)
SELECT owner_id,document_id,max(number) FROM public.document_version GROUP BY owner_id,document_id;
--> statement-breakpoint
CREATE FUNCTION recruitment_private.document_allocate_version_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE target public.document%ROWTYPE;
BEGIN
 -- Lock the same document that redaction updates. Whichever operation wins,
 -- the loser observes either the new pending version or the redacted parent.
 SELECT * INTO target FROM public.document d WHERE d.owner_id=NEW.owner_id AND d.id=NEW.document_id FOR UPDATE;
 IF NOT FOUND OR target.name IS NULL OR target.is_cv IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Document unavailable';
 END IF;
 INSERT INTO recruitment_private.document_version_counter AS c(owner_id,document_id,last_number)
 VALUES(NEW.owner_id,NEW.document_id,1)
 ON CONFLICT(owner_id,document_id) DO UPDATE SET last_number=c.last_number+1
 RETURNING last_number INTO NEW.number;
 RETURN NEW;
END;$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION recruitment_private.document_allocate_version_number() FROM PUBLIC,anon,authenticated,service_role;
--> statement-breakpoint
CREATE TRIGGER document_allocate_version_number BEFORE INSERT ON public.document_version
FOR EACH ROW EXECUTE FUNCTION recruitment_private.document_allocate_version_number();
