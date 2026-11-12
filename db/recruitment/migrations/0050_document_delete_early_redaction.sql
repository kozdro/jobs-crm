-- Redact before a Storage DELETE can complete, so loss of the delete response
-- cannot leave removed filenames or content hashes observable through receipts.
CREATE OR REPLACE FUNCTION public.document_version_redact_history() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE redact boolean:=false;
BEGIN
 IF TG_OP='DELETE' THEN redact:=true;
 ELSIF NEW.state IN ('deleting','deleted') AND OLD.state<>NEW.state THEN redact:=true;
 END IF;
 IF redact THEN
  UPDATE public.document_command SET payload=NULL WHERE owner_id=OLD.owner_id AND document_id=OLD.document_id;
  UPDATE recruitment_private.document_upload_command SET intent=NULL WHERE owner_id=OLD.owner_id AND version_id=OLD.id;
  DELETE FROM public.document_metadata_revision WHERE owner_id=OLD.owner_id AND version_id=OLD.id;
  IF NOT EXISTS(SELECT 1 FROM public.document_version v WHERE v.owner_id=OLD.owner_id AND v.document_id=OLD.document_id AND v.id<>OLD.id AND v.state IN ('pending','ready')) THEN
   DELETE FROM public.document_metadata_revision WHERE owner_id=OLD.owner_id AND document_id=OLD.document_id;
   UPDATE public.document SET name=NULL,is_cv=NULL WHERE owner_id=OLD.owner_id AND id=OLD.document_id;
  ELSE
   UPDATE public.document_metadata_revision SET before_values=NULL,after_values=NULL WHERE owner_id=OLD.owner_id AND document_id=OLD.document_id AND action='rename';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.state IN ('deleting','deleted') THEN
  NEW.label:=NULL; NEW.filename:=NULL; NEW.mime:=NULL; NEW.size:=NULL;
 END IF;
 RETURN NEW;
END;$fn$;
