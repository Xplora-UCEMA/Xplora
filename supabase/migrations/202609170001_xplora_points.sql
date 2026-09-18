-- Xplora Points. Requires member_accounts, eventos, inscripciones_evento and 202609170000_member_access.sql.
-- Deploy the compatible CRM backend first, then apply once via Supabase SQL editor.
-- Never run from a browser client.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public.xp_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.member_accounts ON DELETE RESTRICT,
  source text NOT NULL,
  amount numeric NOT NULL CHECK (amount = trunc(amount) AND amount <> 0),
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, source)
);
CREATE INDEX xp_ledger_member_date ON public.xp_ledger(member_id, created_at DESC);
ALTER TABLE public.xp_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xp_ledger FROM anon, authenticated;
GRANT SELECT, INSERT ON public.xp_ledger TO service_role;

CREATE FUNCTION public.xp_sync_member(p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a member_accounts;
BEGIN
  SELECT * INTO a FROM member_accounts WHERE id=p_member FOR UPDATE;
  IF a.email_confirmed_at IS NULL THEN RETURN; END IF;
  INSERT INTO xp_ledger(member_id, source, amount, description)
    VALUES(p_member, 'signup', 20, 'Bienvenida a Xplora') ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.xp_sync_member(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.xp_sync_member(uuid) TO service_role;
CREATE UNIQUE INDEX xp_verified_usuario ON member_accounts(usuario_id)
  WHERE usuario_id IS NOT NULL AND email_confirmed_at IS NOT NULL;
CREATE TABLE public.xp_events (
  event_id uuid PRIMARY KEY REFERENCES public.eventos ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL UNIQUE,
  tier text NOT NULL CHECK(tier IN ('normal','large','major')),
  base_points integer NOT NULL CHECK(base_points > 0),
  closed boolean NOT NULL DEFAULT false,
  CHECK(base_points <= CASE tier WHEN 'normal' THEN 20 WHEN 'large' THEN 50 ELSE 100 END)
);
CREATE TABLE public.xp_members (
  member_id uuid PRIMARY KEY REFERENCES public.member_accounts ON DELETE RESTRICT,
  commitment integer NOT NULL DEFAULT 0 CHECK(commitment BETWEEN 0 AND 5),
  consecutive integer NOT NULL DEFAULT 0 CHECK(consecutive BETWEEN 0 AND 5)
);
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xp_events, public.xp_members FROM anon, authenticated;
GRANT ALL ON public.xp_events, public.xp_members TO service_role;

-- Attendance is final once rewarded. Close events chronologically, after importing attendance.
-- The first still-open event can award immediately; later events wait for earlier attendance to settle.
CREATE OR REPLACE FUNCTION public.xp_sync_member(p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a member_accounts; e record; c integer := 0; s integer := 0; m numeric;
BEGIN
  SELECT * INTO a FROM member_accounts WHERE id=p_member FOR UPDATE;
  IF a.email_confirmed_at IS NULL THEN RETURN; END IF;
  INSERT INTO xp_ledger(member_id, source, amount, description)
    VALUES(p_member, 'signup', 20, 'Bienvenida a Xplora') ON CONFLICT DO NOTHING;
  FOR e IN SELECT p.*, v.title,
      EXISTS(SELECT 1 FROM inscripciones_evento i WHERE i.evento_id=p.event_id AND i.usuario_id=a.usuario_id) AS registered,
      EXISTS(SELECT 1 FROM inscripciones_evento i WHERE i.evento_id=p.event_id AND i.usuario_id=a.usuario_id AND i.asistio) AS attended
    FROM xp_events p JOIN eventos v ON v.id=p.event_id WHERE p.starts_at <= now() ORDER BY p.starts_at
  LOOP
    IF NOT e.closed AND NOT e.attended THEN EXIT; END IF;
    IF e.attended THEN
      c := least(c+1,5); s := least(s+1,5);
      m := greatest((ARRAY[1,1.5,2,2.5,3]::numeric[])[c], (ARRAY[1,3,4,5,6]::numeric[])[s]);
      INSERT INTO xp_ledger(member_id,source,amount,description,metadata)
        VALUES(p_member,'event:'||e.event_id, floor(e.base_points*m), 'Asistencia · '||e.title,
          jsonb_build_object('base',e.base_points,'multiplier',m,'commitment',c,'consecutive',s)) ON CONFLICT DO NOTHING;
    ELSE
      s := 0;
      IF e.registered THEN c := 0; END IF;
    END IF;
    IF NOT e.closed THEN EXIT; END IF;
  END LOOP;
  INSERT INTO xp_members(member_id,commitment,consecutive) VALUES(p_member,c,s)
    ON CONFLICT(member_id) DO UPDATE SET commitment=EXCLUDED.commitment, consecutive=EXCLUDED.consecutive;
END $$;

CREATE FUNCTION public.xp_guard_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(170926);
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'No se elimina el historial de Points.'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.closed AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Evento cerrado: asistencia y política definitivas.'; END IF;
    IF (NEW.event_id,NEW.starts_at,NEW.tier,NEW.base_points) IS DISTINCT FROM (OLD.event_id,OLD.starts_at,OLD.tier,OLD.base_points)
      AND EXISTS(SELECT 1 FROM xp_ledger WHERE source='event:'||OLD.event_id) THEN
      RAISE EXCEPTION 'Este evento ya tiene puntos acreditados.';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM xp_events p WHERE p.event_id<>NEW.event_id AND p.starts_at>=NEW.starts_at
      AND (p.closed OR EXISTS(SELECT 1 FROM xp_ledger l WHERE l.source='event:'||p.event_id))) THEN
    RAISE EXCEPTION 'No se inserta ni reordena un evento antes de una asistencia ya liquidada.';
  END IF;
  IF NEW.closed AND (NEW.starts_at>now() OR EXISTS(SELECT 1 FROM xp_events p WHERE p.starts_at<NEW.starts_at AND NOT p.closed)) THEN
    RAISE EXCEPTION 'Cerrá primero los eventos anteriores; no se cierran eventos futuros.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER xp_event_guard BEFORE INSERT OR UPDATE OR DELETE ON public.xp_events FOR EACH ROW EXECUTE FUNCTION public.xp_guard_event();

CREATE FUNCTION public.xp_attendance_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE eid uuid; uid uuid;
BEGIN
  IF current_setting('role',true) IN ('anon','authenticated') THEN RAISE EXCEPTION 'La asistencia se gestiona desde el API autorizado.'; END IF;
  IF current_setting('xplora.erasure',true)='on' AND TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND (NEW.evento_id,NEW.usuario_id,NEW.asistio) IS NOT DISTINCT FROM (OLD.evento_id,OLD.usuario_id,OLD.asistio) THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN eid:=NEW.evento_id; uid:=NEW.usuario_id; ELSE eid:=OLD.evento_id; uid:=OLD.usuario_id; END IF;
  PERFORM 1 FROM xp_events WHERE event_id=eid FOR UPDATE;
  IF EXISTS(SELECT 1 FROM xp_events WHERE event_id=eid AND closed)
    OR EXISTS(SELECT 1 FROM xp_ledger l JOIN member_accounts a ON a.id=l.member_id WHERE l.source='event:'||eid AND a.usuario_id=uid) THEN
    RAISE EXCEPTION 'Asistencia cerrada o acreditada: no se modifica ni elimina.';
  END IF;
  IF TG_OP='UPDATE' AND NEW.evento_id<>OLD.evento_id THEN RAISE EXCEPTION 'Creá una inscripción nueva, no cambies su evento.'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER xp_attendance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.inscripciones_evento FOR EACH ROW EXECUTE FUNCTION public.xp_attendance_guard();

CREATE FUNCTION public.xp_attendance_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a record;
BEGIN
  FOR a IN SELECT id FROM member_accounts WHERE usuario_id=NEW.usuario_id AND email_confirmed_at IS NOT NULL ORDER BY id LOOP
    PERFORM xp_sync_member(a.id);
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER xp_attendance_sync AFTER INSERT OR UPDATE ON public.inscripciones_evento FOR EACH ROW EXECUTE FUNCTION public.xp_attendance_sync();
CREATE FUNCTION public.xp_event_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a record;
BEGIN
  FOR a IN SELECT id FROM member_accounts WHERE email_confirmed_at IS NOT NULL ORDER BY id LOOP PERFORM xp_sync_member(a.id); END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER xp_event_sync AFTER INSERT OR UPDATE ON public.xp_events FOR EACH ROW EXECUTE FUNCTION public.xp_event_sync();
REVOKE ALL ON FUNCTION public.xp_guard_event(), public.xp_attendance_guard(), public.xp_attendance_sync(), public.xp_event_sync() FROM PUBLIC,anon,authenticated;
CREATE TABLE public.xp_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '', cost integer NOT NULL CHECK(cost>0),
  active boolean NOT NULL DEFAULT false, per_member integer NOT NULL DEFAULT 1 CHECK(per_member BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.xp_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reward_id uuid NOT NULL REFERENCES public.xp_rewards,
  used_at timestamptz,
  delivery text NOT NULL CHECK(length(delivery) BETWEEN 1 AND 4000), UNIQUE(reward_id,delivery)
);
CREATE TABLE public.xp_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid NOT NULL REFERENCES public.member_accounts,
  reward_id uuid NOT NULL REFERENCES public.xp_rewards, inventory_id uuid NOT NULL UNIQUE REFERENCES public.xp_inventory,
  request_id uuid NOT NULL, cost integer NOT NULL CHECK(cost>0), title text NOT NULL, delivery text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(member_id,request_id)
);
CREATE TABLE public.xp_program (
  id boolean PRIMARY KEY DEFAULT true CHECK(id), notice text NOT NULL DEFAULT '',
  announced_at timestamptz, closes_at timestamptz,
  CHECK(closes_at IS NULL OR (announced_at IS NOT NULL AND closes_at>=announced_at+interval '90 days'))
);
INSERT INTO public.xp_program(id) VALUES(true);
INSERT INTO public.xp_rewards(title,description,cost) VALUES('Entrada a LaBitConf','Tu próxima experiencia con la comunidad. Se habilitará cuando Xplora confirme las entradas disponibles.',150);

CREATE FUNCTION public.xp_redeem(p_member uuid,p_reward uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r xp_rewards; old xp_redemptions; ticket xp_inventory; result xp_redemptions; balance numeric;
BEGIN
  PERFORM xp_sync_member(p_member);
  IF NOT EXISTS(SELECT 1 FROM member_accounts WHERE id=p_member AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Confirmá tu cuenta.'; END IF;
  SELECT * INTO old FROM xp_redemptions WHERE member_id=p_member AND request_id=p_request;
  IF FOUND THEN
    IF old.reward_id<>p_reward THEN RAISE EXCEPTION 'El intento de canje pertenece a otra recompensa.'; END IF;
    RETURN to_jsonb(old);
  END IF;
  SELECT * INTO r FROM xp_rewards WHERE id=p_reward FOR UPDATE;
  IF NOT FOUND OR NOT r.active THEN RAISE EXCEPTION 'Recompensa no disponible.'; END IF;
  IF EXISTS(SELECT 1 FROM xp_program WHERE closes_at<=now()) THEN RAISE EXCEPTION 'El programa cerró; contactá a Xplora.'; END IF;
  IF (SELECT count(*) FROM xp_redemptions WHERE member_id=p_member AND reward_id=p_reward)>=r.per_member THEN RAISE EXCEPTION 'Ya alcanzaste el límite de canjes de esta recompensa.'; END IF;
  SELECT coalesce(sum(amount),0) INTO balance FROM xp_ledger WHERE member_id=p_member;
  IF balance<r.cost THEN RAISE EXCEPTION 'Saldo insuficiente.'; END IF;
  SELECT i.* INTO ticket FROM xp_inventory i WHERE i.reward_id=p_reward AND i.used_at IS NULL ORDER BY i.id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recompensa agotada.'; END IF;
  UPDATE xp_inventory SET used_at=now() WHERE id=ticket.id;
  INSERT INTO xp_redemptions(member_id,reward_id,inventory_id,request_id,cost,title,delivery)
    VALUES(p_member,p_reward,ticket.id,p_request,r.cost,r.title,ticket.delivery) RETURNING * INTO result;
  INSERT INTO xp_ledger(member_id,source,amount,description) VALUES(p_member,'redemption:'||result.id,-r.cost,'Canje · '||r.title);
  RETURN to_jsonb(result);
END $$;
ALTER TABLE public.xp_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_program ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xp_rewards, public.xp_inventory, public.xp_redemptions, public.xp_program FROM anon,authenticated;
GRANT ALL ON public.xp_rewards, public.xp_inventory, public.xp_program TO service_role;
GRANT SELECT ON public.xp_redemptions TO service_role;
REVOKE ALL ON FUNCTION public.xp_redeem(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xp_redeem(uuid,uuid,uuid) TO service_role;
CREATE TABLE public.xp_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  kind text NOT NULL CHECK(kind IN ('qr','survey','award')), points integer NOT NULL CHECK(points BETWEEN 1 AND 100),
  token_hash text NOT NULL UNIQUE, event_id uuid REFERENCES public.eventos, active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL, max_claims integer NOT NULL CHECK(max_claims BETWEEN 1 AND 100000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.xp_claims (
  member_id uuid NOT NULL REFERENCES public.member_accounts, action_id uuid NOT NULL REFERENCES public.xp_actions,
  rating integer CHECK(rating BETWEEN 1 AND 5), feedback text NOT NULL DEFAULT '' CHECK(length(feedback)<=2000),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(member_id,action_id)
);
CREATE FUNCTION public.xp_claim(p_member uuid,p_hash text,p_rating integer DEFAULT NULL,p_feedback text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a xp_actions;
BEGIN
  PERFORM xp_sync_member(p_member);
  IF NOT EXISTS(SELECT 1 FROM member_accounts WHERE id=p_member AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Confirmá tu cuenta.'; END IF;
  SELECT * INTO a FROM xp_actions WHERE token_hash=p_hash FOR UPDATE;
  IF NOT FOUND OR NOT a.active OR a.expires_at<=now() OR EXISTS(SELECT 1 FROM xp_program WHERE closes_at<=now()) THEN RAISE EXCEPTION 'Acción no disponible o vencida.'; END IF;
  IF EXISTS(SELECT 1 FROM xp_claims WHERE member_id=p_member AND action_id=a.id) THEN RETURN jsonb_build_object('points',a.points,'alreadyClaimed',true); END IF;
  IF a.event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inscripciones_evento i JOIN member_accounts m ON m.usuario_id=i.usuario_id WHERE m.id=p_member AND i.evento_id=a.event_id AND i.asistio) THEN RAISE EXCEPTION 'Esta acción requiere asistencia verificada al evento.'; END IF;
  IF a.kind='survey' AND (p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 OR length(trim(coalesce(p_feedback,'')))<3) THEN RAISE EXCEPTION 'Completá la encuesta antes de recibir puntos.'; END IF;
  IF (SELECT count(*) FROM xp_claims WHERE action_id=a.id)>=a.max_claims THEN RAISE EXCEPTION 'Se agotó el cupo de esta acción.'; END IF;
  INSERT INTO xp_claims(member_id,action_id,rating,feedback) VALUES(p_member,a.id,p_rating,coalesce(p_feedback,''));
  INSERT INTO xp_ledger(member_id,source,amount,description) VALUES(p_member,'action:'||a.id,a.points,a.title);
  RETURN jsonb_build_object('points',a.points,'alreadyClaimed',false);
END $$;
ALTER TABLE public.xp_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xp_actions,public.xp_claims FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.xp_actions TO service_role;
GRANT SELECT ON public.xp_claims TO service_role;
REVOKE ALL ON FUNCTION public.xp_claim(uuid,text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xp_claim(uuid,text,integer,text) TO service_role;

CREATE FUNCTION public.xp_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND current_setting('xplora.erasure',true)='on' AND current_setting('role',true) NOT IN ('anon','authenticated') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'El historial de puntos y canjes es inmutable.';
END $$;
CREATE TRIGGER xp_ledger_immutable BEFORE UPDATE OR DELETE ON public.xp_ledger FOR EACH ROW EXECUTE FUNCTION public.xp_immutable();
CREATE TRIGGER xp_redemptions_immutable BEFORE UPDATE OR DELETE ON public.xp_redemptions FOR EACH ROW EXECUTE FUNCTION public.xp_immutable();
REVOKE ALL ON FUNCTION public.xp_immutable() FROM PUBLIC,anon,authenticated;
-- Access is installed independently; xp_consume_access detects xp_sync_member when Points is available.
CREATE FUNCTION public.xp_snapshot(p_member uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM xp_sync_member(p_member);
  RETURN jsonb_build_object(
    'balance',(SELECT coalesce(sum(amount),0)::text FROM xp_ledger WHERE member_id=p_member),
    'streaks',(SELECT to_jsonb(s) FROM xp_members s WHERE member_id=p_member),
    'program',(SELECT to_jsonb(p) FROM xp_program p),
    'ledger',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM (SELECT id,amount::text,description,metadata,created_at FROM xp_ledger WHERE member_id=p_member ORDER BY created_at DESC,id DESC LIMIT 50) l),'[]'::jsonb),
    'redemptions',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM (SELECT id,title,cost,delivery,created_at FROM xp_redemptions WHERE member_id=p_member ORDER BY created_at DESC LIMIT 50) d),'[]'::jsonb),
    'rewards',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT r.id,r.title,r.description,r.cost,r.active,r.per_member,
      (SELECT count(*) FROM xp_inventory i WHERE i.reward_id=r.id AND i.used_at IS NULL) AS available,
      (SELECT count(*) FROM xp_redemptions d WHERE d.reward_id=r.id AND d.member_id=p_member) AS redeemed
      FROM xp_rewards r ORDER BY r.cost,r.created_at) r),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.xp_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xp_snapshot(uuid) TO service_role;
-- Only the existing authenticated API's permission-checked import may mutate attendance.
REVOKE INSERT,UPDATE,DELETE ON public.inscripciones_evento FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.inscripciones_evento TO service_role;
-- Contact email establishes account ownership; ordinary browser sessions must not reassign it.
REVOKE INSERT,UPDATE,DELETE ON public.usuarios FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.usuarios TO service_role;

-- Preserve the existing explicit contact/account erasure flow, atomically. Used tickets stay used.
CREATE FUNCTION public.xp_delete_contact(p_user uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u record; m record; tbl text;
BEGIN
  SELECT id,email INTO u FROM usuarios WHERE id=p_user FOR UPDATE;
  IF NOT FOUND THEN RETURN 'already_deleted'; END IF;
  PERFORM set_config('xplora.erasure','on',true);
  FOR m IN SELECT id FROM member_accounts WHERE usuario_id=p_user OR lower(trim(email))=lower(trim(u.email)) ORDER BY id FOR UPDATE LOOP
    DELETE FROM xp_redemptions WHERE member_id=m.id;
    DELETE FROM xp_ledger WHERE member_id=m.id;
    DELETE FROM xp_claims WHERE member_id=m.id;
    DELETE FROM xp_members WHERE member_id=m.id;
    DELETE FROM member_accounts WHERE id=m.id;
  END LOOP;
  DELETE FROM xp_access WHERE email=lower(trim(u.email));
  DELETE FROM member_auth_challenges WHERE email=lower(trim(u.email));
  FOREACH tbl IN ARRAY ARRAY['contact_list_members','campanias_envios'] LOOP
    IF to_regclass('public.'||tbl) IS NOT NULL THEN EXECUTE format('DELETE FROM public.%I WHERE usuario_id=$1',tbl) USING p_user; END IF;
  END LOOP;
  DELETE FROM inscripciones_evento WHERE usuario_id=p_user;
  DELETE FROM usuarios WHERE id=p_user;
  PERFORM set_config('xplora.erasure','off',true);
  RETURN 'deleted';
END $$;
REVOKE ALL ON FUNCTION public.xp_delete_contact(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xp_delete_contact(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
CREATE FUNCTION public.xp_reward_catalog() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM (
    SELECT r.*, (SELECT count(*) FROM xp_inventory i WHERE i.reward_id=r.id AND i.used_at IS NULL) AS available
    FROM xp_rewards r ORDER BY r.created_at
  ) r;
$$;
REVOKE ALL ON FUNCTION public.xp_reward_catalog() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xp_reward_catalog() TO service_role;
COMMIT;
