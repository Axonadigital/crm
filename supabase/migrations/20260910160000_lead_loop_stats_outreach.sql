-- Hela flödet i EN funktion, från skrapat bolag till bokat möte.
--
-- lead_loop_stats() slutade vid "skickat". Utfallet — svar, nej, studs, möte —
-- fanns i tre andra tabeller som ingen vy läste, så Mission Control kunde visa
-- att motorn levde men inte om den fungerade.
--
-- Att allt ligger i en RPC är avsiktligt och viktigt: sidan, Isak och varje
-- agent läser exakt samma siffror från samma ögonblick. Två vyer som räknar
-- var för sig blir olika, och då börjar folk lita på fel siffra.
--
-- Nytt: 'outreach' (utfallet i sammandrag), 'sends' (varje enskilt utskick med
-- sitt utfall) och 'inbound' (den senaste inkommande posten i klartext).

CREATE OR REPLACE FUNCTION public.lead_loop_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
WITH bounds AS (
  SELECT ((now() AT TIME ZONE 'Europe/Stockholm')::date) AT TIME ZONE 'Europe/Stockholm' AS day_start,
         now() - interval '7 days' AS week_start,
         now() - interval '30 days' AS month_start
),
latest AS (
  SELECT ls.company_id, ls.total_score, ls.scanned_at,
         (COALESCE(c.email, '') <> '' OR EXISTS (
            SELECT 1
            FROM public.contacts ct,
                 jsonb_array_elements(COALESCE(ct.email_jsonb, '[]'::jsonb)) el
            WHERE ct.company_id = c.id AND COALESCE(el->>'email', '') <> ''
         )) AS has_email
  FROM public.company_latest_scan ls
  JOIN public.companies c ON c.id = ls.company_id
  WHERE ls.scanned_at > now() - interval '60 days'
),
-- Bara den kalla utkorgen. email_sends innehåller även offerter,
-- månadsrapporter och skannerrapporter, och de hör inte hemma i den här
-- tratten. enrollment_id sätts bara av process_sequences.
outreach_sends AS (
  SELECT es.*
  FROM public.email_sends es
  WHERE es.metadata ? 'enrollment_id'
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'settings', jsonb_build_object(
    'sequences',   (SELECT value FROM public.mc_settings WHERE key = 'sequences'),
    'lead_refill', (SELECT value FROM public.mc_settings WHERE key = 'lead_refill')
  ),
  'refill', jsonb_build_object(
    'new_today', (SELECT count(*) FROM public.companies c, bounds b
                  WHERE c.source = 'google_maps' AND c.created_at >= b.day_start),
    'new_7d',    (SELECT count(*) FROM public.companies c, bounds b
                  WHERE c.source = 'google_maps' AND c.created_at >= b.week_start),
    'new_with_email_7d', (SELECT count(*) FROM public.companies c, bounds b
                  WHERE c.source = 'google_maps' AND c.created_at >= b.week_start
                    AND COALESCE(c.email, '') <> ''),
    'profiles_active',    (SELECT count(*) FROM public.search_profiles WHERE is_active),
    'profiles_total',     (SELECT count(*) FROM public.search_profiles),
    'profiles_never_run', (SELECT count(*) FROM public.search_profiles WHERE is_active AND last_run_at IS NULL),
    'last_profiles', (
      SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.last_run_at DESC), '[]'::jsonb)
      FROM (SELECT name, last_run_at, last_run_results
            FROM public.search_profiles
            WHERE last_run_at IS NOT NULL
            ORDER BY last_run_at DESC LIMIT 6) p)
  ),
  'scanner', jsonb_build_object(
    'scanned_today', (SELECT count(*) FROM public.scanner_scans s, bounds b WHERE s.created_at >= b.day_start),
    'scanned_7d',    (SELECT count(*) FROM public.scanner_scans s, bounds b WHERE s.created_at >= b.week_start),
    'queue', (SELECT count(*) FROM public.companies c
              WHERE COALESCE(c.website, '') <> ''
                AND NOT EXISTS (SELECT 1 FROM public.scanner_scans s WHERE s.company_id = c.id)),
    'under_50',            (SELECT count(*) FROM latest WHERE total_score < 50),
    'under_50_with_email', (SELECT count(*) FROM latest WHERE total_score < 50 AND has_email),
    'no_website',          (SELECT count(*) FROM latest WHERE total_score = 0)
  ),
  'enroll', jsonb_build_object(
    'enrolled_today', (SELECT count(*) FROM public.sequence_enrollments e, bounds b WHERE e.enrolled_at >= b.day_start),
    'enrolled_7d',    (SELECT count(*) FROM public.sequence_enrollments e, bounds b WHERE e.enrolled_at >= b.week_start),
    'active',         (SELECT count(*) FROM public.sequence_enrollments WHERE status = 'active'),
    'no_contact_7d',  (SELECT count(*) FROM public.sequence_run_log l, bounds b
                       WHERE l.outcome = 'skipped_no_contact' AND l.created_at >= b.week_start),
    'suppressed_7d',  (SELECT count(*) FROM public.sequence_run_log l, bounds b
                       WHERE l.outcome = 'skipped_suppressed' AND l.created_at >= b.week_start)
  ),
  'sequences', jsonb_build_object(
    'sent_today',    (SELECT count(*) FROM public.sequence_run_log l, bounds b WHERE l.outcome = 'sent' AND l.created_at >= b.day_start),
    'sent_7d',       (SELECT count(*) FROM public.sequence_run_log l, bounds b WHERE l.outcome = 'sent' AND l.created_at >= b.week_start),
    'dry_run_today', (SELECT count(*) FROM public.sequence_run_log l, bounds b WHERE l.outcome = 'dry_run' AND l.created_at >= b.day_start),
    'dry_run_7d',    (SELECT count(*) FROM public.sequence_run_log l, bounds b WHERE l.outcome = 'dry_run' AND l.created_at >= b.week_start),
    'failed_7d',     (SELECT count(*) FROM public.sequence_run_log l, bounds b WHERE l.outcome = 'failed' AND l.created_at >= b.week_start),
    'duplicates_7d', (SELECT count(*) FROM public.sequence_run_log l, bounds b WHERE l.outcome = 'skipped_duplicate' AND l.created_at >= b.week_start),
    'list', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'status', s.status, 'trigger_config', s.trigger_config,
        'steps', (SELECT count(*) FROM public.sequence_steps st WHERE st.sequence_id = s.id),
        'enrolled', (SELECT count(*) FROM public.sequence_enrollments e WHERE e.sequence_id = s.id)
      ) ORDER BY s.id), '[]'::jsonb)
      FROM public.sequences s WHERE s.trigger_type = 'scan_result')
  ),

  -- Utfallet av utkorgen. Nämnaren är alltid antal skickade under samma
  -- fönster, så procenten går att jämföra mellan veckor.
  'outreach', jsonb_build_object(
    'sent_7d',      (SELECT count(*) FROM outreach_sends es, bounds b WHERE es.sent_at >= b.week_start),
    'sent_30d',     (SELECT count(*) FROM outreach_sends es, bounds b WHERE es.sent_at >= b.month_start),
    'replied_7d',   (SELECT count(*) FROM outreach_sends es, bounds b WHERE es.replied_at >= b.week_start),
    'replied_30d',  (SELECT count(*) FROM outreach_sends es, bounds b WHERE es.replied_at >= b.month_start),
    'bounced_7d',   (SELECT count(*) FROM outreach_sends es, bounds b WHERE es.bounced_at >= b.week_start),
    'bounced_30d',  (SELECT count(*) FROM outreach_sends es, bounds b WHERE es.bounced_at >= b.month_start),
    'said_no_30d',  (SELECT count(*) FROM public.outreach_inbound i, bounds b
                     WHERE i.sentiment = 'negative' AND i.created_at >= b.month_start),
    'auto_30d',     (SELECT count(*) FROM public.outreach_inbound i, bounds b
                     WHERE i.kind = 'auto_reply' AND i.created_at >= b.month_start),
    'awaiting',     (SELECT count(*) FROM outreach_sends es
                     WHERE es.status = 'sent' AND es.replied_at IS NULL AND es.bounced_at IS NULL),
    'meetings_30d', (SELECT count(*) FROM public.sequence_run_log l, bounds b
                     WHERE l.outcome = 'stopped_meeting_booked' AND l.created_at >= b.month_start),
    'suppressed_total', (SELECT count(*) FROM public.outreach_suppressions)
  ),

  -- Varje enskilt utskick med sitt utfall. Det här är vyn Rasmus efterfrågade:
  -- inte bara "30 skickade" utan vilka trettio, och vad som hände med var och en.
  'sends', (
    SELECT COALESCE(jsonb_agg(to_jsonb(z) ORDER BY z.sort_at DESC), '[]'::jsonb)
    FROM (
      SELECT es.id,
             COALESCE(es.sent_at, es.created_at) AS sort_at,
             es.sent_at, es.to_email, es.subject, es.status,
             es.replied_at, es.bounced_at, es.gmail_thread_id, es.thread_checked_at,
             es.company_id, c.name AS company_name,
             (es.metadata->>'sequence_step')::int AS step,
             sq.name AS sequence_name,
             (es.metadata->>'enrollment_id')::bigint AS enrollment_id,
             e.status AS enrollment_status,
             (SELECT i.sentiment FROM public.outreach_inbound i
              WHERE i.email_send_id = es.id ORDER BY i.id DESC LIMIT 1) AS sentiment,
             (SELECT i.snippet FROM public.outreach_inbound i
              WHERE i.email_send_id = es.id ORDER BY i.id DESC LIMIT 1) AS reply_snippet
      FROM outreach_sends es
      LEFT JOIN public.companies c ON c.id = es.company_id
      LEFT JOIN public.sequence_enrollments e ON e.id = (es.metadata->>'enrollment_id')::bigint
      LEFT JOIN public.sequences sq ON sq.id = e.sequence_id
      ORDER BY COALESCE(es.sent_at, es.created_at) DESC
      LIMIT 40
    ) z),

  -- Inkommande post i klartext. Utan den blir "3 svar" en siffra ingen kan agera på.
  'inbound', (
    SELECT COALESCE(jsonb_agg(to_jsonb(w) ORDER BY w.created_at DESC), '[]'::jsonb)
    FROM (
      SELECT i.id, i.created_at, i.received_at, i.kind, i.sentiment,
             i.from_email, i.subject, left(i.snippet, 400) AS snippet,
             i.company_id, c.name AS company_name, i.email_send_id
      FROM public.outreach_inbound i
      LEFT JOIN public.companies c ON c.id = i.company_id
      ORDER BY i.created_at DESC LIMIT 20
    ) w),

  'runs', (
    SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    FROM (SELECT DISTINCT ON (agent_id) agent_id, id, status, started_at, finished_at, summary, error
          FROM public.mc_runs
          WHERE agent_id IN ('lead-refill', 'lead-scanner', 'enroll-engine', 'sequence-engine', 'reply-reader')
          ORDER BY agent_id, started_at DESC) r),
  'heartbeats', (
    SELECT COALESCE(jsonb_agg(to_jsonb(h)), '[]'::jsonb)
    FROM (SELECT DISTINCT ON (job) job, status, started_at, finished_at, message
          FROM public.mc_job_heartbeats
          WHERE job IN ('process-sequences', 'enroll-from-scans', 'poll-gmail-replies')
          ORDER BY job, started_at DESC) h),
  'log', (
    SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
    FROM (SELECT l.id, l.created_at, l.step, l.action_type, l.outcome, l.reasons, l.company_id,
                 c.name AS company_name, s.name AS sequence_name,
                 l.detail->>'subject' AS subject, l.detail->>'to' AS to_email,
                 l.detail->>'would' AS would
          FROM public.sequence_run_log l
          LEFT JOIN public.companies c ON c.id = l.company_id
          LEFT JOIN public.sequences s ON s.id = l.sequence_id
          ORDER BY l.created_at DESC LIMIT 30) x),
  'recent_leads', (
    SELECT COALESCE(jsonb_agg(to_jsonb(y)), '[]'::jsonb)
    FROM (SELECT c.id, c.name, c.city, c.industry, c.created_at, c.website,
                 COALESCE(c.email, '') <> '' AS has_email,
                 ls.total_score, ls.report_slug
          FROM public.companies c
          LEFT JOIN public.company_latest_scan ls ON ls.company_id = c.id
          WHERE c.source = 'google_maps'
          ORDER BY c.created_at DESC LIMIT 12) y)
);
$$;
