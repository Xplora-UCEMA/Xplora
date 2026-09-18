-- Tickets QR privados: sólo guardamos descriptor Cloudinary + fingerprint HMAC.
ALTER TABLE public.xp_inventory
  ADD COLUMN IF NOT EXISTS fingerprint text
  CHECK (fingerprint IS NULL OR fingerprint ~ '^[0-9a-f]{64}$');

DROP INDEX IF EXISTS public.xp_inventory_reward_fingerprint_unique;
CREATE UNIQUE INDEX IF NOT EXISTS xp_inventory_fingerprint_unique
  ON public.xp_inventory(fingerprint)
  WHERE fingerprint IS NOT NULL;

CREATE OR REPLACE FUNCTION public.xp_import_ticket_inventory(p_reward uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reward_active boolean;
  inserted_count integer;
  ticket_item record;
  descriptor jsonb;
  key_count integer;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'El lote debe contener entre 1 y 500 tickets.' USING ERRCODE = 'P0001';
  END IF;

  SELECT active INTO reward_active FROM xp_rewards WHERE id = p_reward FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La recompensa no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF reward_active THEN
    RAISE EXCEPTION 'Desactivá la recompensa antes de cargar tickets.' USING ERRCODE = 'P0001';
  END IF;

  FOR ticket_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS value(delivery text, fingerprint text)
  LOOP
    IF ticket_item.delivery IS NULL OR length(ticket_item.delivery) NOT BETWEEN 1 AND 4000
       OR ticket_item.fingerprint IS NULL OR ticket_item.fingerprint !~ '^[0-9a-f]{64}$'
       OR ticket_item.delivery NOT LIKE 'xplora-delivery:v1:%' THEN
      RAISE EXCEPTION 'El lote contiene descriptores de ticket inválidos.' USING ERRCODE = 'P0001';
    END IF;
    BEGIN
      descriptor := substring(ticket_item.delivery FROM length('xplora-delivery:v1:') + 1)::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'El lote contiene descriptores de ticket inválidos.' USING ERRCODE = 'P0001';
    END;
    IF jsonb_typeof(descriptor) <> 'object' THEN
      RAISE EXCEPTION 'El lote contiene descriptores de ticket inválidos.' USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*) INTO key_count FROM jsonb_object_keys(descriptor);
    IF key_count <> 9 OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(descriptor) AS keys(key)
      WHERE key NOT IN (
        'type', 'provider', 'eventSlug', 'eventTitle', 'publicId', 'version',
        'format', 'imageSha256', 'qrFingerprint'
      )
    ) OR descriptor->>'type' IS DISTINCT FROM 'qr'
       OR descriptor->>'provider' IS DISTINCT FROM 'cloudinary'
       OR NOT coalesce((descriptor->>'eventSlug') ~ '^[a-z0-9]+(-[a-z0-9]+)*$', false)
       OR NOT coalesce(length(descriptor->>'eventTitle') BETWEEN 1 AND 160, false)
       OR btrim(descriptor->>'eventTitle') IS DISTINCT FROM descriptor->>'eventTitle'
       OR descriptor->>'format' IS DISTINCT FROM 'png'
       OR NOT coalesce((descriptor->>'imageSha256') ~ '^[0-9a-f]{64}$', false)
       OR descriptor->>'qrFingerprint' IS DISTINCT FROM ticket_item.fingerprint
       OR descriptor->>'publicId' IS DISTINCT FROM
          'xplora-points/tickets/' || (descriptor->>'eventSlug') || '/' || (descriptor->>'imageSha256') THEN
      RAISE EXCEPTION 'El lote contiene descriptores de ticket inválidos.' USING ERRCODE = 'P0001';
    END IF;
    IF jsonb_typeof(descriptor->'version') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'El lote contiene descriptores de ticket inválidos.' USING ERRCODE = 'P0001';
    END IF;
    BEGIN
      IF (descriptor->>'version')::numeric <= 0
         OR (descriptor->>'version')::numeric > 9007199254740991
         OR (descriptor->>'version')::numeric <> trunc((descriptor->>'version')::numeric) THEN
        RAISE EXCEPTION 'El lote contiene descriptores de ticket inválidos.' USING ERRCODE = 'P0001';
      END IF;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'El lote contiene descriptores de ticket inválidos.' USING ERRCODE = 'P0001';
    END;
  END LOOP;

  INSERT INTO xp_inventory(reward_id, delivery, fingerprint)
  SELECT p_reward, imported.delivery, imported.fingerprint
  FROM jsonb_to_recordset(p_items) AS imported(delivery text, fingerprint text);
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN jsonb_build_object('inserted', inserted_count);
END;
$$;

REVOKE ALL ON FUNCTION public.xp_import_ticket_inventory(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.xp_import_ticket_inventory(uuid,jsonb) TO service_role;

-- Estado durable de entrega por email. Resend conserva idempotency keys por tiempo
-- limitado; esta tabla evita reenvíos al reproducir el mismo request_id días después.
CREATE TABLE IF NOT EXISTS public.xp_redemption_emails (
  redemption_id uuid PRIMARY KEY REFERENCES public.xp_redemptions(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  ambiguous_at timestamptz,
  sent_at timestamptz,
  provider_id text
);
-- Compatibilidad si una revisión anterior de esta migración ya fue aplicada.
ALTER TABLE public.xp_redemption_emails
  ADD COLUMN IF NOT EXISTS ambiguous_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_id text;
ALTER TABLE public.xp_redemption_emails
  DROP CONSTRAINT IF EXISTS xp_redemption_emails_provider_id_check,
  DROP CONSTRAINT IF EXISTS xp_redemption_emails_terminal_state_check;
ALTER TABLE public.xp_redemption_emails
  ADD CONSTRAINT xp_redemption_emails_provider_id_check
    CHECK (provider_id IS NULL OR (length(provider_id) BETWEEN 1 AND 255 AND sent_at IS NOT NULL)),
  ADD CONSTRAINT xp_redemption_emails_terminal_state_check
    CHECK (sent_at IS NULL OR ambiguous_at IS NULL);
ALTER TABLE public.xp_redemption_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xp_redemption_emails FROM anon, authenticated;
GRANT ALL ON public.xp_redemption_emails TO service_role;

CREATE OR REPLACE FUNCTION public.xp_claim_redemption_email(p_redemption uuid, p_member uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  state xp_redemption_emails;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM xp_redemptions WHERE id = p_redemption AND member_id = p_member
  ) THEN
    RAISE EXCEPTION 'El canje no existe.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO xp_redemption_emails(redemption_id)
  VALUES (p_redemption)
  ON CONFLICT DO NOTHING
  RETURNING * INTO state;
  IF FOUND THEN RETURN 'send'; END IF;

  SELECT * INTO state FROM xp_redemption_emails WHERE redemption_id = p_redemption;
  IF state.sent_at IS NOT NULL THEN RETURN 'sent'; END IF;
  IF state.ambiguous_at IS NOT NULL THEN RETURN 'ambiguous'; END IF;
  -- No recuperamos claims por tiempo: una caída pudo ocurrir después de que el
  -- proveedor aceptara el correo. Sólo un rechazo definitivo puede liberarlo.
  RETURN 'busy';
END;
$$;

CREATE OR REPLACE FUNCTION public.xp_mark_redemption_email_ambiguous(p_redemption uuid, p_member uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE xp_redemption_emails e
  SET ambiguous_at = coalesce(e.ambiguous_at, now())
  WHERE e.redemption_id = p_redemption
    AND e.sent_at IS NULL
    AND EXISTS (
      SELECT 1 FROM xp_redemptions r
      WHERE r.id = e.redemption_id AND r.member_id = p_member
    );
  IF FOUND THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM xp_redemption_emails e
    JOIN xp_redemptions r ON r.id = e.redemption_id
    WHERE e.redemption_id = p_redemption AND r.member_id = p_member AND e.sent_at IS NOT NULL
  ) THEN RETURN false; END IF;
  RAISE EXCEPTION 'El email del canje no fue reservado.' USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.xp_finish_redemption_email(
  p_redemption uuid,
  p_member uuid,
  p_provider_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_provider_id IS NOT NULL AND
     (length(p_provider_id) NOT BETWEEN 1 AND 255 OR btrim(p_provider_id) IS DISTINCT FROM p_provider_id) THEN
    RAISE EXCEPTION 'El identificador del proveedor es inválido.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE xp_redemption_emails e
  SET sent_at = coalesce(e.sent_at, now()),
      ambiguous_at = NULL,
      provider_id = coalesce(e.provider_id, p_provider_id)
  WHERE e.redemption_id = p_redemption
    AND EXISTS (
      SELECT 1 FROM xp_redemptions r
      WHERE r.id = e.redemption_id AND r.member_id = p_member
    )
    AND (e.provider_id IS NULL OR p_provider_id IS NULL OR e.provider_id = p_provider_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El email del canje no fue reservado.' USING ERRCODE = 'P0001';
  END IF;
  RETURN true;
END;
$$;

-- Wrapper para procesos anteriores durante un rolling deploy.
CREATE OR REPLACE FUNCTION public.xp_finish_redemption_email(p_redemption uuid, p_member uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.xp_finish_redemption_email(p_redemption, p_member, NULL::text)
$$;

CREATE OR REPLACE FUNCTION public.xp_release_redemption_email(p_redemption uuid, p_member uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM xp_redemption_emails e
  WHERE e.redemption_id = p_redemption
    AND e.sent_at IS NULL
    AND e.ambiguous_at IS NULL
    AND EXISTS (
      SELECT 1 FROM xp_redemptions r
      WHERE r.id = e.redemption_id AND r.member_id = p_member
    );
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.xp_claim_redemption_email(uuid,uuid),
  public.xp_finish_redemption_email(uuid,uuid),
  public.xp_finish_redemption_email(uuid,uuid,text),
  public.xp_mark_redemption_email_ambiguous(uuid,uuid),
  public.xp_release_redemption_email(uuid,uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.xp_claim_redemption_email(uuid,uuid),
  public.xp_finish_redemption_email(uuid,uuid),
  public.xp_finish_redemption_email(uuid,uuid,text),
  public.xp_mark_redemption_email_ambiguous(uuid,uuid),
  public.xp_release_redemption_email(uuid,uuid)
TO service_role;
