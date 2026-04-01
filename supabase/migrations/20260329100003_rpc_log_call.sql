-- Migration: RPC log_call_and_schedule_followup
-- Created: 2026-03-29
-- Description: Atomic function that creates a call log, updates company status/tracking,
--              and optionally creates a follow-up task. Replaces the two-step frontend flow
--              that was vulnerable to race conditions.

CREATE OR REPLACE FUNCTION log_call_and_schedule_followup(
  p_company_id bigint,
  p_contact_id bigint DEFAULT NULL,
  p_call_outcome text DEFAULT 'no_answer',
  p_notes text DEFAULT NULL,
  p_call_duration_seconds integer DEFAULT NULL,
  p_followup_date text DEFAULT NULL,
  p_followup_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid;
  v_sales_id bigint;
  v_call_log_id bigint;
  v_task_id bigint;
  v_new_lead_status text;
  v_current_lead_status text;
  v_followup_ts timestamp with time zone;
BEGIN
  -- Get current user from auth context
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve sales_id from the sales table
  SELECT id INTO v_sales_id
  FROM public.sales
  WHERE user_id = v_user_id;

  -- Parse followup_date if provided
  IF p_followup_date IS NOT NULL AND p_followup_date != '' THEN
    v_followup_ts := p_followup_date::timestamp with time zone;
  END IF;

  -- ==========================================================================
  -- 1. Create call_log entry
  -- ==========================================================================
  INSERT INTO public.call_logs (
    company_id, contact_id, user_id, call_outcome,
    notes, call_duration_seconds, followup_date, followup_note
  ) VALUES (
    p_company_id, p_contact_id, v_user_id, p_call_outcome,
    p_notes, p_call_duration_seconds, v_followup_ts, p_followup_note
  )
  RETURNING id INTO v_call_log_id;

  -- ==========================================================================
  -- 2. Determine new lead_status based on outcome
  -- ==========================================================================
  SELECT lead_status INTO v_current_lead_status
  FROM public.companies
  WHERE id = p_company_id;

  -- Outcome → lead_status mapping (matches existing frontend logic in CallQueue.tsx)
  CASE p_call_outcome
    WHEN 'interested' THEN v_new_lead_status := 'interested';
    WHEN 'not_interested' THEN v_new_lead_status := 'not_interested';
    WHEN 'meeting_booked' THEN v_new_lead_status := 'meeting_booked';
    WHEN 'callback_requested' THEN v_new_lead_status := 'callback_requested';
    WHEN 'spoke_decision_maker' THEN v_new_lead_status := 'contacted';
    WHEN 'spoke_gatekeeper' THEN v_new_lead_status := 'contacted';
    WHEN 'send_info' THEN v_new_lead_status := 'contacted';
    ELSE
      -- no_answer, busy, wrong_number → keep existing status
      v_new_lead_status := v_current_lead_status;
  END CASE;

  -- ==========================================================================
  -- 3. Update company: status, touch tracking, next action
  -- ==========================================================================
  UPDATE public.companies
  SET
    lead_status = v_new_lead_status,
    last_touch_at = now(),
    last_touch_type = 'call',
    next_followup_date = COALESCE(v_followup_ts, next_followup_date),
    next_action_at = CASE
      WHEN v_followup_ts IS NOT NULL THEN v_followup_ts
      ELSE next_action_at
    END,
    next_action_type = CASE
      WHEN v_followup_ts IS NOT NULL THEN 'follow_up'
      ELSE next_action_type
    END,
    next_action_note = CASE
      WHEN v_followup_ts IS NOT NULL AND p_followup_note IS NOT NULL THEN p_followup_note
      ELSE next_action_note
    END,
    -- Auto-set pipeline_state if not already set
    pipeline_state = CASE
      WHEN pipeline_state IS NULL AND v_new_lead_status = 'meeting_booked' THEN 'meeting_booked'
      WHEN pipeline_state IS NULL AND v_new_lead_status IN ('interested', 'callback_requested', 'contacted') THEN 'contacted'
      WHEN pipeline_state IS NULL AND v_new_lead_status = 'not_interested' THEN 'lost'
      ELSE pipeline_state
    END
  WHERE id = p_company_id;

  -- ==========================================================================
  -- 4. Optionally create follow-up task (only if contact_id provided, since tasks.contact_id is NOT NULL)
  -- ==========================================================================
  IF v_followup_ts IS NOT NULL AND p_contact_id IS NOT NULL THEN
    INSERT INTO public.tasks (
      contact_id, type, text, due_date, sales_id
    ) VALUES (
      p_contact_id,
      'follow_up',
      COALESCE(p_followup_note, 'Uppföljning efter samtal'),
      v_followup_ts,
      v_sales_id
    )
    RETURNING id INTO v_task_id;
  END IF;

  -- ==========================================================================
  -- 5. Return result
  -- ==========================================================================
  RETURN jsonb_build_object(
    'call_log_id', v_call_log_id,
    'task_id', v_task_id,
    'new_lead_status', v_new_lead_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION log_call_and_schedule_followup(bigint, bigint, text, text, integer, text, text) TO authenticated;
