BEGIN;
CREATE TABLE public.xp_google_account (
  id boolean PRIMARY KEY DEFAULT true CHECK(id), email text NOT NULL,
  refresh_cipher text NOT NULL, connected_at timestamptz NOT NULL DEFAULT now(),
  reconnect_required boolean NOT NULL DEFAULT false
);
CREATE TABLE public.xp_google_oauth_states (
  state_hash text PRIMARY KEY, browser_hash text NOT NULL, verifier_cipher text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE TABLE public.xp_google_worker (
  id boolean PRIMARY KEY DEFAULT true CHECK(id), owner uuid, lease_until timestamptz,
  heartbeat_at timestamptz
);
INSERT INTO public.xp_google_worker(id) VALUES(true);
ALTER TABLE public.xp_google_forms ADD COLUMN mode text NOT NULL DEFAULT 'script' CHECK(mode IN ('script','oauth'));
ALTER TABLE public.xp_google_forms ADD COLUMN poll_since timestamptz;
ALTER TABLE public.xp_google_forms ADD COLUMN poll_page text;
ALTER TABLE public.xp_google_forms ADD COLUMN poll_started_at timestamptz;
ALTER TABLE public.xp_google_forms ADD COLUMN sync_checked_at timestamptz;
ALTER TABLE public.xp_google_forms ADD COLUMN last_synced_at timestamptz;
ALTER TABLE public.xp_google_forms ADD COLUMN sync_error text;
CREATE TABLE public.xp_google_inbox (
  action_id uuid NOT NULL REFERENCES public.xp_google_forms, response_id text NOT NULL,
  email text NOT NULL, submitted_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(), next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0, completed_at timestamptz,
  PRIMARY KEY(action_id,response_id)
);
CREATE INDEX xp_google_inbox_pending ON public.xp_google_inbox(next_attempt_at) WHERE completed_at IS NULL;
ALTER TABLE public.xp_google_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_google_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_google_worker ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_google_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xp_google_account,public.xp_google_oauth_states,public.xp_google_worker,public.xp_google_inbox FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.xp_google_account,public.xp_google_oauth_states,public.xp_google_worker,public.xp_google_inbox TO service_role;

CREATE FUNCTION public.xp_create_central_task(p_title text,p_points integer,p_cap integer,p_expires timestamptz,
  p_event uuid,p_form text,p_url text,p_secret text,p_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE aid uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM xp_google_account WHERE id AND NOT reconnect_required) THEN
    RAISE EXCEPTION 'Conectá la cuenta de Google primero.';
  END IF;
  aid := xp_create_google_task(p_title,p_points,p_cap,p_expires,p_event,p_form,p_url,p_secret,p_token);
  UPDATE xp_google_forms SET mode='oauth',connected_at=now(),poll_since=now() WHERE action_id=aid;
  UPDATE xp_actions SET active=true WHERE id=aid;
  RETURN aid;
END $$;
REVOKE ALL ON FUNCTION public.xp_create_central_task(text,integer,integer,timestamptz,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xp_create_central_task(text,integer,integer,timestamptz,uuid,text,text,text,text) TO service_role;

-- Prevent stale pagination from crossing a new publication window.
CREATE FUNCTION public.xp_reset_google_poll() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.mode='oauth' AND NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
    NEW.poll_since := NEW.activated_at; NEW.poll_page := NULL; NEW.poll_started_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER xp_reset_google_poll BEFORE UPDATE ON public.xp_google_forms FOR EACH ROW EXECUTE FUNCTION public.xp_reset_google_poll();
REVOKE ALL ON FUNCTION public.xp_reset_google_poll() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.xp_rotate_google_secret(p_action uuid,p_secret text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE fid text;
BEGIN
  PERFORM 1 FROM xp_actions WHERE id=p_action FOR UPDATE;
  IF EXISTS(SELECT 1 FROM xp_google_forms WHERE action_id=p_action AND mode='oauth') THEN
    RAISE EXCEPTION 'Esta tarea usa la conexión central. Reconectá la cuenta de Google desde Ops.';
  END IF;
  UPDATE xp_actions SET active=false WHERE id=p_action AND kind='google_form';
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarea de Google Forms no encontrada.'; END IF;
  UPDATE xp_google_forms SET secret_hash=p_secret,connected_at=null WHERE action_id=p_action RETURNING form_id INTO fid;
  RETURN fid;
END $$;

CREATE FUNCTION public.xp_google_lease(p_owner uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE xp_google_worker SET owner=p_owner,lease_until=now()+interval '2 minutes',heartbeat_at=now()
    WHERE id AND (owner=p_owner OR lease_until IS NULL OR lease_until<now());
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.xp_google_lease(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xp_google_lease(uuid) TO service_role;
COMMIT;
