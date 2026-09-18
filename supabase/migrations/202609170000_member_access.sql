-- Standalone passwordless access. Requires public.member_accounts.
-- No writes or permission changes to CRM contacts, attendance, or Points tables.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.member_accounts ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '';
ALTER TABLE public.member_accounts ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.xp_access (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  code_hash text NOT NULL,
  magic_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
CREATE INDEX IF NOT EXISTS xp_access_email ON public.xp_access(email, created_at DESC);
ALTER TABLE public.xp_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xp_access FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.xp_access TO service_role;

CREATE OR REPLACE FUNCTION public.xp_issue_access(p_id uuid, p_email text, p_code text, p_magic text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE prior public.xp_access; normalized text := lower(trim(p_email));
BEGIN
  IF normalized IS NULL OR normalized = '' OR length(normalized) > 240 THEN
    RAISE EXCEPTION 'Email inválido.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(normalized, 17));
  SELECT * INTO prior FROM public.xp_access
    WHERE email = normalized AND consumed_at IS NULL AND attempts < 5
      AND expires_at > now() AND created_at > now() - interval '2 minutes'
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('id', prior.id, 'issued', false); END IF;
  UPDATE public.xp_access SET consumed_at = now() WHERE email = normalized AND consumed_at IS NULL;
  INSERT INTO public.xp_access(id, email, code_hash, magic_hash) VALUES(p_id, normalized, p_code, p_magic);
  RETURN jsonb_build_object('id', p_id, 'issued', true);
END $$;

CREATE OR REPLACE FUNCTION public.xp_consume_access(p_id uuid, p_hash text, p_magic boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.xp_access; result uuid;
BEGIN
  SELECT * INTO c FROM public.xp_access WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR c.consumed_at IS NOT NULL OR c.expires_at <= now() OR p_hash IS NULL THEN RETURN NULL; END IF;
  IF p_magic THEN
    IF c.magic_hash <> p_hash THEN RETURN NULL; END IF;
  ELSE
    IF c.attempts >= 5 THEN RETURN NULL; END IF;
    UPDATE public.xp_access SET attempts = attempts + 1 WHERE id = p_id;
    IF c.code_hash <> p_hash THEN RETURN NULL; END IF;
  END IF;
  UPDATE public.xp_access SET consumed_at = now() WHERE id = p_id;
  INSERT INTO public.member_accounts(email, email_confirmed_at) VALUES(c.email, now())
    ON CONFLICT(email) DO UPDATE SET email_confirmed_at = coalesce(member_accounts.email_confirmed_at, now())
    RETURNING id INTO result;
  -- Optional integration, only after Points is separately installed and enabled.
  IF to_regprocedure('public.xp_sync_member(uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.xp_sync_member($1)' USING result;
  END IF;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.xp_issue_access(uuid,text,text,text), public.xp_consume_access(uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.xp_issue_access(uuid,text,text,text), public.xp_consume_access(uuid,text,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
