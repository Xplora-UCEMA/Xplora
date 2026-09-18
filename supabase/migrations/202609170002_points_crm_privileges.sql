-- Supabase may give its API roles additional table privileges by default.
-- Keep existing CRM SELECT/RLS behavior, but leave all mutations to the trusted API.
BEGIN;
SET LOCAL lock_timeout = '5s';
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.usuarios, public.inscripciones_evento FROM anon, authenticated;
COMMIT;
