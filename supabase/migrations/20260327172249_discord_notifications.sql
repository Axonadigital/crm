-- Migration: Discord notification triggers
-- Created: 2026-03-27
-- Description: Sends Discord webhook notifications when key CRM events occur
--   (deal stage changes, new companies, quote status changes).
--   Uses pg_net extension (already enabled) for async HTTP POST.
--   Discord webhook URL is stored in Supabase Vault.

-- ============================================================================
-- 1. Core helper: send a Discord embed via webhook
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_discord(
  title text,
  description text,
  color integer DEFAULT 3447003,  -- Discord blue
  footer text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  webhook_url text;
  payload jsonb;
  embed jsonb;
BEGIN
  -- Read webhook URL from Supabase Vault
  SELECT decrypted_secret INTO webhook_url
  FROM vault.decrypted_secrets
  WHERE name = 'discord_webhook_url'
  LIMIT 1;

  -- Silently skip if no webhook is configured
  IF webhook_url IS NULL OR webhook_url = '' THEN
    RETURN;
  END IF;

  embed := jsonb_build_object(
    'title', title,
    'description', description,
    'color', color,
    'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  IF footer IS NOT NULL THEN
    embed := embed || jsonb_build_object('footer', jsonb_build_object('text', footer));
  END IF;

  payload := jsonb_build_object(
    'embeds', jsonb_build_array(embed)
  );

  PERFORM net.http_post(
    url     := webhook_url,
    body    := payload,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
END;
$$;

-- ============================================================================
-- 2. Trigger function: Deal stage changed
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_discord_deal_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  company_name text;
  deal_title text;
  deal_amount text;
  embed_color integer;
  description text;
BEGIN
  -- Only fire when stage actually changes
  IF OLD.stage IS NOT DISTINCT FROM NEW.stage THEN
    RETURN NEW;
  END IF;

  -- Look up company name
  SELECT name INTO company_name
  FROM public.companies
  WHERE id = NEW.company_id;

  deal_title := NEW.name;
  deal_amount := CASE
    WHEN NEW.amount IS NOT NULL THEN NEW.amount::text || ' SEK'
    ELSE 'Ej angivet'
  END;

  -- Color based on stage direction
  embed_color := CASE
    WHEN NEW.stage = 'won'  THEN 5763719   -- Green
    WHEN NEW.stage = 'lost' THEN 15548997  -- Red
    ELSE 16776960                           -- Yellow
  END;

  description := '**Deal:** ' || deal_title
    || E'\n**Foretag:** ' || COALESCE(company_name, 'Okant')
    || E'\n**Stage:** ' || COALESCE(OLD.stage, '-') || ' -> ' || NEW.stage
    || E'\n**Belopp:** ' || deal_amount;

  PERFORM public.notify_discord(
    title       := 'Deal stage andrad',
    description := description,
    color       := embed_color
  );

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. Trigger function: New company created
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_discord_new_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  description text;
BEGIN
  description := '**Foretag:** ' || NEW.name
    || E'\n**Kalla:** ' || COALESCE(NEW.source, '-')
    || E'\n**Lead status:** ' || COALESCE(NEW.lead_status, 'ny')
    || E'\n**Bransch:** ' || COALESCE(NEW.industry, '-')
    || E'\n**Hemsida:** ' || COALESCE(NEW.website, '-');

  PERFORM public.notify_discord(
    title       := 'Nytt foretag tillagt',
    description := description,
    color       := 3066993  -- Teal
  );

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 4. Trigger function: Quote status changed
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_discord_quote_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  company_name text;
  description text;
  embed_color integer;
  status_label text;
BEGIN
  -- Only fire when status actually changes
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Look up company name
  SELECT name INTO company_name
  FROM public.companies
  WHERE id = NEW.company_id;

  status_label := CASE NEW.status
    WHEN 'draft'     THEN 'Utkast'
    WHEN 'generated' THEN 'Genererad'
    WHEN 'sent'      THEN 'Skickad'
    WHEN 'viewed'    THEN 'Visad'
    WHEN 'signed'    THEN 'Signerad'
    WHEN 'declined'  THEN 'Avbojd'
    WHEN 'expired'   THEN 'Utgangen'
    ELSE NEW.status
  END;

  embed_color := CASE NEW.status
    WHEN 'signed'   THEN 5763719   -- Green
    WHEN 'declined' THEN 15548997  -- Red
    WHEN 'sent'     THEN 3447003   -- Blue
    WHEN 'viewed'   THEN 16776960  -- Yellow
    ELSE 9807270                   -- Gray
  END;

  description := '**Offert:** ' || NEW.title
    || E'\n**Foretag:** ' || COALESCE(company_name, 'Okant')
    || E'\n**Status:** ' || COALESCE(OLD.status, '-') || ' -> ' || status_label
    || E'\n**Belopp:** ' || COALESCE(NEW.total_amount::text, '0') || ' ' || COALESCE(NEW.currency, 'SEK');

  PERFORM public.notify_discord(
    title       := 'Offertstatus andrad',
    description := description,
    color       := embed_color
  );

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 5. Create the triggers
-- ============================================================================

-- Deal stage change trigger
CREATE TRIGGER on_deal_stage_change_notify_discord
  AFTER UPDATE ON public.deals
  FOR EACH ROW
  WHEN (OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.notify_discord_deal_stage_change();

-- New company trigger
CREATE TRIGGER on_company_created_notify_discord
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_discord_new_company();

-- Quote status change trigger
CREATE TRIGGER on_quote_status_change_notify_discord
  AFTER UPDATE ON public.quotes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_discord_quote_status_change();
