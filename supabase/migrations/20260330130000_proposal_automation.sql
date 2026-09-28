-- Migration: Proposal automation system
-- Created: 2026-03-30
-- Description: Auto-trigger proposal generation when deal stage changes to
--   "generating-proposal". Validates data, creates quote, generates text + PDF,
--   posts to Discord for approval. Approval triggers email send + deal stage update.
--
--   Uses pg_net to call edge functions asynchronously from DB triggers.

-- ============================================================================
-- 1. Trigger function: Deal moved to "generating-proposal"
--    Calls the orchestrate_proposal edge function via pg_net
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trigger_proposal_generation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  edge_function_url text;
  service_role_key text;
  payload jsonb;
BEGIN
  -- Only fire when stage changes TO "generating-proposal"
  IF NEW.stage IS DISTINCT FROM 'generating-proposal' THEN
    RETURN NEW;
  END IF;

  -- Build the edge function URL from env
  edge_function_url := current_setting('app.settings.supabase_url', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    -- Try the vault for the URL
    SELECT decrypted_secret INTO edge_function_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url'
    LIMIT 1;
  END IF;

  -- Get service role key from vault
  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  -- Silently skip if config is missing (don't block deal updates)
  IF edge_function_url IS NULL OR service_role_key IS NULL THEN
    RAISE WARNING 'proposal_automation: missing supabase_url or service_role_key in vault — skipping auto-proposal';
    RETURN NEW;
  END IF;

  payload := jsonb_build_object(
    'deal_id', NEW.id,
    'company_id', NEW.company_id,
    'sales_id', NEW.sales_id,
    'deal_name', NEW.name,
    'deal_amount', NEW.amount,
    'deal_category', NEW.category
  );

  -- Fire-and-forget HTTP call to the edge function
  PERFORM net.http_post(
    url     := edge_function_url || '/functions/v1/orchestrate_proposal',
    body    := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    timeout_milliseconds := 10000
  );

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. Create the trigger on deals table
-- ============================================================================
DROP TRIGGER IF EXISTS on_deal_generating_proposal ON public.deals;

CREATE TRIGGER on_deal_generating_proposal
  AFTER UPDATE ON public.deals
  FOR EACH ROW
  WHEN (OLD.stage IS DISTINCT FROM NEW.stage AND NEW.stage = 'generating-proposal')
  EXECUTE FUNCTION public.trigger_proposal_generation();

-- ============================================================================
-- 3. Add proposal_approval_token to quotes for secure approval links
-- ============================================================================
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS approval_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

-- Index for fast lookup by approval token
CREATE INDEX IF NOT EXISTS idx_quotes_approval_token ON public.quotes(approval_token);

-- ============================================================================
-- 4. Update Discord notification for generating-proposal stage
--    (already handled by existing trigger, this just adds a label)
-- ============================================================================
-- No changes needed — the existing deal stage trigger already fires for all
-- stage changes. The orchestrate_proposal function will post its own
-- richer Discord message with approve/edit buttons.

-- ============================================================================
-- 5. Helper RPC: Read discord webhook URL from vault (for edge functions)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_discord_webhook_url()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  url text;
BEGIN
  SELECT decrypted_secret INTO url
  FROM vault.decrypted_secrets
  WHERE name = 'discord_webhook_url'
  LIMIT 1;
  RETURN url;
END;
$$;

-- Only allow service_role to call this (edge functions use service role key)
REVOKE ALL ON FUNCTION public.get_discord_webhook_url() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_discord_webhook_url() FROM anon;
REVOKE ALL ON FUNCTION public.get_discord_webhook_url() FROM authenticated;
