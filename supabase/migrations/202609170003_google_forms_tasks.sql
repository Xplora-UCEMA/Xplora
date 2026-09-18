BEGIN;

ALTER TABLE public.xp_actions DROP CONSTRAINT xp_actions_kind_check;
ALTER TABLE public.xp_actions ADD CONSTRAINT xp_actions_kind_check
  CHECK(kind IN ('qr','survey','award','google_form'));

CREATE TABLE public.xp_google_forms (
  action_id uuid PRIMARY KEY REFERENCES public.xp_actions,
  form_id text NOT NULL UNIQUE CHECK(length(form_id) BETWEEN 1 AND 200),
  responder_url text CHECK(responder_url LIKE 'https://docs.google.com/forms/%'),
  secret_hash text NOT NULL,
  connected_at timestamptz,
  activated_at timestamptz,
  last_received_at timestamptz
);
CREATE TABLE public.xp_google_receipts (
  action_id uuid NOT NULL REFERENCES public.xp_google_forms,
  response_id text NOT NULL CHECK(length(response_id) BETWEEN 1 AND 200),
  member_id uuid NOT NULL REFERENCES public.member_accounts ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(action_id,response_id)
);
ALTER TABLE public.xp_google_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_google_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xp_google_forms,public.xp_google_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.xp_google_forms TO service_role;
GRANT SELECT ON public.xp_google_receipts TO service_role;

-- Keep the existing atomic award path; only the trusted Google adapter may use it for Forms.
ALTER FUNCTION public.xp_claim(uuid,text,integer,text) RENAME TO xp_claim_verified;
REVOKE ALL ON FUNCTION public.xp_claim_verified(uuid,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.xp_claim(p_member uuid,p_hash text,p_rating integer DEFAULT NULL,p_feedback text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM xp_actions WHERE token_hash=p_hash AND kind='google_form') THEN
    RAISE EXCEPTION 'Esta tarea se acredita desde Google Forms.';
  END IF;
  RETURN xp_claim_verified(p_member,p_hash,p_rating,p_feedback);
END $$;
REVOKE ALL ON FUNCTION public.xp_claim(uuid,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xp_claim(uuid,text,integer,text) TO service_role;

CREATE FUNCTION public.xp_google_claim(p_action uuid,p_form text,p_response text,p_email text,p_submitted timestamptz,p_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a xp_actions; f xp_google_forms; m member_accounts; prior xp_google_receipts; result jsonb;
BEGIN
  SELECT * INTO m FROM member_accounts WHERE email=lower(trim(p_email)) AND email_confirmed_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La persona debe confirmar su cuenta de Xplora con el mismo correo.'; END IF;
  SELECT * INTO a FROM xp_actions WHERE id=p_action FOR UPDATE;
  SELECT * INTO f FROM xp_google_forms WHERE action_id=p_action;
  IF f.secret_hash IS DISTINCT FROM p_secret THEN RAISE EXCEPTION 'Conexión no autorizada.'; END IF;
  IF a.kind IS DISTINCT FROM 'google_form' OR f.form_id IS DISTINCT FROM p_form OR f.connected_at IS NULL THEN
    RAISE EXCEPTION 'Conexión de Google Forms no disponible.';
  END IF;
  SELECT * INTO prior FROM xp_google_receipts WHERE action_id=p_action AND response_id=p_response;
  IF FOUND THEN
    IF prior.member_id<>m.id THEN RAISE EXCEPTION 'La respuesta ya pertenece a otra cuenta.'; END IF;
    RETURN jsonb_build_object('points',a.points,'alreadyClaimed',true);
  END IF;
  IF f.activated_at IS NULL OR p_submitted IS NULL OR p_submitted<greatest(a.created_at,f.connected_at,f.activated_at,m.email_confirmed_at)
    OR p_submitted>a.expires_at OR p_submitted>now()+interval '1 minute' THEN
    RAISE EXCEPTION 'Respuesta fuera del período habilitado.';
  END IF;
  -- Submission time, not transport latency, owns the deadline. Locks serialize quota and balance.
  IF NOT a.active OR EXISTS(SELECT 1 FROM xp_program WHERE closes_at<=now()) THEN RAISE EXCEPTION 'Tarea pausada o programa cerrado.'; END IF;
  IF EXISTS(SELECT 1 FROM xp_claims WHERE member_id=m.id AND action_id=a.id) THEN
    result := jsonb_build_object('points',a.points,'alreadyClaimed',true);
  ELSE
    IF a.event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inscripciones_evento WHERE usuario_id=m.usuario_id AND evento_id=a.event_id AND asistio) THEN
      RAISE EXCEPTION 'Esta tarea requiere asistencia verificada.';
    END IF;
    IF (SELECT count(*) FROM xp_claims WHERE action_id=a.id)>=a.max_claims THEN RAISE EXCEPTION 'Se agotó el cupo de esta tarea.'; END IF;
    INSERT INTO xp_claims(member_id,action_id) VALUES(m.id,a.id);
    INSERT INTO xp_ledger(member_id,source,amount,description) VALUES(m.id,'action:'||a.id,a.points,a.title);
    result := jsonb_build_object('points',a.points,'alreadyClaimed',false);
  END IF;
  INSERT INTO xp_google_receipts(action_id,response_id,member_id,submitted_at) VALUES(p_action,p_response,m.id,p_submitted);
  UPDATE xp_google_forms SET last_received_at=now() WHERE action_id=p_action;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.xp_google_claim(uuid,text,text,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xp_google_claim(uuid,text,text,text,timestamptz,text) TO service_role;

CREATE FUNCTION public.xp_google_connect(p_action uuid,p_url text,p_secret text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM 1 FROM xp_actions WHERE id=p_action FOR UPDATE;
  UPDATE xp_google_forms SET responder_url=p_url,connected_at=coalesce(connected_at,now())
    WHERE action_id=p_action AND secret_hash=p_secret;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conexión no autorizada.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.xp_google_connect(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xp_google_connect(uuid,text,text) TO service_role;

-- A form connection and its action must be created together, never an orphan action.
CREATE FUNCTION public.xp_create_google_task(p_title text,p_points integer,p_cap integer,p_expires timestamptz,
  p_event uuid,p_form text,p_url text,p_secret text,p_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE aid uuid;
BEGIN
  INSERT INTO xp_actions(title,kind,points,max_claims,expires_at,event_id,token_hash,active)
    VALUES(p_title,'google_form',p_points,p_cap,p_expires,p_event,p_token,false) RETURNING id INTO aid;
  INSERT INTO xp_google_forms(action_id,form_id,responder_url,secret_hash) VALUES(aid,p_form,p_url,p_secret);
  RETURN aid;
END $$;
REVOKE ALL ON FUNCTION public.xp_create_google_task(text,integer,integer,timestamptz,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xp_create_google_task(text,integer,integer,timestamptz,uuid,text,text,text,text) TO service_role;
CREATE FUNCTION public.xp_guard_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.kind='google_form' AND NEW.active AND NOT EXISTS(
    SELECT 1 FROM xp_google_forms WHERE action_id=NEW.id AND connected_at IS NOT NULL AND responder_url IS NOT NULL
  ) THEN RAISE EXCEPTION 'Primero debés conectar Google Forms.'; END IF;
  IF NEW.kind='google_form' AND NEW.active AND TG_OP='UPDATE' AND NOT OLD.active THEN
    UPDATE xp_google_forms SET activated_at=now() WHERE action_id=NEW.id;
  END IF;
  IF TG_OP='UPDATE' AND (NEW.points,NEW.kind,NEW.event_id) IS DISTINCT FROM (OLD.points,OLD.kind,OLD.event_id)
    AND EXISTS(SELECT 1 FROM xp_claims WHERE action_id=OLD.id) THEN
    RAISE EXCEPTION 'Esta tarea ya tiene puntos acreditados.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER xp_guard_task BEFORE INSERT OR UPDATE ON public.xp_actions FOR EACH ROW EXECUTE FUNCTION public.xp_guard_task();
REVOKE ALL ON FUNCTION public.xp_guard_task() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.xp_rotate_google_secret(p_action uuid,p_secret text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE fid text;
BEGIN
  UPDATE xp_actions SET active=false WHERE id=p_action AND kind='google_form';
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarea de Google Forms no encontrada.'; END IF;
  UPDATE xp_google_forms SET secret_hash=p_secret,connected_at=null WHERE action_id=p_action RETURNING form_id INTO fid;
  RETURN fid;
END $$;
REVOKE ALL ON FUNCTION public.xp_rotate_google_secret(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xp_rotate_google_secret(uuid,text) TO service_role;
COMMIT;
