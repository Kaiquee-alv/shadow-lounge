CREATE OR REPLACE FUNCTION public.reject_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $audit_immutable$
BEGIN
  RAISE EXCEPTION 'Registros de auditoria são imutáveis; alterações e exclusões não são permitidas'
    USING ERRCODE = '55000';
END;
$audit_immutable$;

DO $audit_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'audit_logs_no_update_delete'
      AND tgrelid = 'public.audit_logs'::regclass
      AND NOT tgisinternal
  ) THEN
    BEGIN
      CREATE TRIGGER audit_logs_no_update_delete
      BEFORE UPDATE OR DELETE ON public.audit_logs
      FOR EACH ROW EXECUTE FUNCTION public.reject_audit_log_mutation();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'audit_logs_no_truncate'
      AND tgrelid = 'public.audit_logs'::regclass
      AND NOT tgisinternal
  ) THEN
    BEGIN
      CREATE TRIGGER audit_logs_no_truncate
      BEFORE TRUNCATE ON public.audit_logs
      FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_log_mutation();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$audit_trigger$;
