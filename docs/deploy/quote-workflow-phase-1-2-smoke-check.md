# Quote Workflow Refactor — Production Smoke Checklist

**Scope:** Post-deploy verification for the Phase 1 (`quote_pipeline_steps`
observability) + Phase 2 (`createSigningSubmission` centralization) refactor
of the quote workflow pipeline.

**When to run:** Immediately after `/safe-deploy` completes for the bundle
below, BEFORE closing the deploy window or switching to other work.

**Production project ref:** `hgyusrlrzdahucljvqsz`

**Bundle under test (on main):**
- Migration `20260415090000_quote_pipeline_steps.sql`
- Edge functions: `orchestrate_proposal`, `generate_quote_text`,
  `send_quote_for_signing`, `approve_proposal`

**Unchanged but touching the pipeline (no deploy needed):**
- `generate_quote_pdf`, `docuseal_webhook`, `serve_quote`

---

## 0. Pre-deploy gates (do NOT skip)

- [ ] **Backup confirmed** for `hgyusrlrzdahucljvqsz` within the last hour
  - Dump: `npx supabase db dump --linked -f backup_crm_$(date +%Y%m%d_%H%M).sql`
  - Verify file exists and is non-empty (`ls -lh backup_crm_*.sql`)
- [ ] `npm run test:workflow -- --run` — expects **18/18 green**
- [ ] `npm run test:unit:functions -- --run` — expects **132/132 green**
- [ ] `npm run typecheck` — expects exit 0
- [ ] Git status is clean and main is pushed to origin
- [ ] You are the only person deploying right now (no parallel team deploys)

**If any of the above fails, STOP and resolve before proceeding.**

---

## 1. Migration verification

After `/safe-deploy` reports migration applied:

- [ ] Open Supabase dashboard → Table editor → verify `quote_pipeline_steps`
  exists in the `public` schema
- [ ] Verify columns: `id`, `quote_id`, `step_name`, `status`, `started_at`,
  `completed_at`, `duration_ms`, `error_message`, `error_details`, `metadata`
- [ ] Verify indexes exist:
  - `idx_quote_pipeline_steps_quote_id`
  - `idx_quote_pipeline_steps_quote_step_started`
- [ ] Verify RLS is enabled: `SELECT rowsecurity FROM pg_tables WHERE tablename = 'quote_pipeline_steps';` → `t`
- [ ] Verify table is empty at start (no rows yet)

**Rollback trigger:** If the migration did not apply or the table has
unexpected columns, revert the merge commit immediately and redeploy.

---

## 2. Edge function deploy verification

- [ ] Supabase dashboard → Edge Functions → confirm all four functions have
  an updated `Last deployed` timestamp (within the last 10 minutes):
  - `orchestrate_proposal`
  - `generate_quote_text`
  - `send_quote_for_signing`
  - `approve_proposal`
- [ ] Check function logs for each one: no startup errors, no module import
  failures, no "Deno.env.get is not a function" or similar seam errors

---

## 3. Orchestration path (automatic proposal generation)

**Setup:** Create a dedicated test deal in production.

- [ ] Create a test company (name: `SMOKE TEST — <today's date>`)
- [ ] Attach a test contact with a real **your-own-address** email
  (use `rasmus.joonsson+smoke@gmail.com` or similar — do NOT use customer
  emails)
- [ ] Create a deal on the test company, category = `webb-engangssida` (or
  any web-ish category), amount > 0
- [ ] Ensure there is either a meeting analysis OR a company description so
  validation passes
- [ ] **Move deal stage to `generating-proposal`**

**Verify:**

- [ ] Within 60 seconds, a new quote row exists linked to the test deal
- [ ] `quotes.status` transitions from `draft` → `generated`
- [ ] `quotes.generated_text` is populated (non-empty)
- [ ] `quotes.generated_sections` is populated (non-null, has `summary_pitch`
  key)
- [ ] `quotes.pdf_url` is populated
- [ ] **Pipeline observability check:**
  `SELECT step_name, status, duration_ms, error_message FROM quote_pipeline_steps WHERE quote_id = <test quote id> ORDER BY started_at;`
  expected rows (at least):
    - `generate_text` status=`success`
    - `normalize_sections` status=`success`
- [ ] Discord channel receives "Ny offert redo for granskning" embed with
  link buttons:
    - **Forhandsgranska** → `CRM_PUBLIC_URL/quote.html?id=<quote_id>`
    - **Granska och skicka i CRM** → `CRM_PUBLIC_URL/#/quotes/<quote_id>/show`

  (Webhook fallback path: buttons are absent and the URLs appear as text
  links at the bottom of the embed description instead. This is expected
  for webhooks.)
- [ ] **Note:** there is no "Approve" button in the embed today — the
  approval-token signing path (`approve_proposal`) is not exposed from
  Discord in the current production UI. See section 5 for how to test it.
- [ ] `orchestrate_proposal` logs show no unhandled errors
- [ ] Deal stage did NOT get reverted to `opportunity` (validation passed)

**Rollback trigger:** If the quote is created but `generated_sections` is
null, OR the pipeline rows are never written, OR Discord embed never arrives,
revert immediately. Those indicate the refactored AI path or pipelineLogger
is broken in a way the tests did not catch.

---

## 4. Manual signing path (CRM → DocuSeal)

**Reuse the same test quote from step 3.**

- [ ] Open the quote in CRM (`/#/quotes/<id>/show`)
- [ ] Verify preview, AI text and PDF look correct
- [ ] Click **Send for signing** in the CRM UI
- [ ] Wait for the toast notification "Quote sent for signing" (info-level)
  — the CRM does NOT open a dialog or show the signing URL inline. The
  page auto-refreshes via `refresh()` and the quote record below the
  action buttons should then show the populated signing fields.

**Verify (primary assertions via DB, not UI):**

- [ ] `quotes.status` transitions `generated` → `sent`
- [ ] `quotes.sent_at` is set to the timestamp of the action
- [ ] `quotes.docuseal_submission_id` is populated (string, non-empty)
- [ ] `quotes.docuseal_signing_url` contains `/s/` + a slug
- [ ] `quotes.approved_at` is **NULL** (manual path must not set this)
- [ ] **Pipeline observability:** new row for `step_name=docuseal_submit`
  with `status=success`, `metadata->>'trigger' = 'crm_manual'`
- [ ] DocuSeal dashboard shows exactly ONE new submission for the quote
- [ ] Your test email inbox receives the signing invitation with the
  "Granska och signera offert" button (manual flow template)
- [ ] No errors in `send_quote_for_signing` logs

**Rollback trigger:** If a DocuSeal submission is created but status stays
`generated`, OR `approved_at` gets set via the manual path, OR two submissions
appear, revert immediately.

---

## 5. Approval signing path (`approve_proposal` — internal verification)

**IMPORTANT — read this before running section 5:**

The `approve_proposal` edge function is NOT currently reachable from any
production UI. The Discord embed from section 3 does not include an
Approve button (only Forhandsgranska and Granska och skicka i CRM), and
no frontend code references `approval_token` or `approve_proposal`. The
function exists as a code path that we want to keep working because it
sets `approved_at` and moves the deal stage, but smoke-testing it
requires manually constructing the URL with a token pulled from the DB.

If you are time-constrained and nothing else in the bundle has touched
approval-path-only code, you can **skip section 5** and run it as a
separate internal test after the primary deploy is stable. The section
does not block the deploy if the other sections pass.

**Setup:** Create a SECOND test deal (same pattern as section 3) so the
first test quote (from section 4) is preserved for the idempotence check
in section 6.

- [ ] Repeat section 3 to get a new quote with `status = generated`
- [ ] Fetch its approval token from the DB:
  ```sql
  SELECT id, quote_number, status, approval_token
  FROM quotes
  WHERE id = <new test quote id>;
  ```
- [ ] Construct the approval URL by hand:
  ```
  https://hgyusrlrzdahucljvqsz.supabase.co/functions/v1/approve_proposal?token=<approval_token>
  ```
- [ ] Open the URL in a private browser window (it is a GET endpoint that
  renders an HTML status page directly)

**Verify:**

- [ ] The browser shows the "Offert skickad for e-signering!" success HTML page
- [ ] `quotes.status = sent`
- [ ] `quotes.sent_at` is populated
- [ ] **`quotes.approved_at` IS populated** (this is what differentiates the
  approval path)
- [ ] `quotes.docuseal_submission_id` is populated
- [ ] `quotes.docuseal_signing_url` is populated
- [ ] `deals.stage` transitioned to `proposal-sent`
- [ ] **Pipeline observability:** `docuseal_submit` row with
  `metadata->>'trigger' = 'discord_approval'`
- [ ] DocuSeal dashboard shows exactly ONE new submission for this quote
- [ ] Your test email inbox receives the approval-flow signing invitation
  (note: the HTML template is different from the manual path — that is
  intentional, phase 3 will unify them)
- [ ] `email_sends` table has a new row for this quote with
  `metadata->>'source' = 'docuseal_signing'`
- [ ] Discord receives "Offert godkand och skickad for e-signering!" embed

**Rollback trigger:** If `approved_at` is NOT set on the approval path, OR
the deal stage does not advance, OR two submissions are created in DocuSeal,
revert immediately.

---

## 6. Idempotence check (re-send protection)

**Reuse the quote from section 4 (manual path, already status=sent).**

Before starting this section, note down these three values from the DB:

```sql
SELECT docuseal_submission_id, docuseal_signing_url, sent_at
FROM quotes WHERE id = <section 4 quote id>;
```

Keep them on screen — they are the "before" snapshot.

- [ ] Re-open the same quote in CRM
- [ ] Click **Send for signing** a SECOND time
- [ ] Toast "Quote sent for signing" appears (success path — NOT 502)

**Verify (primary assertions via DB + DocuSeal dashboard):**

The source of truth that idempotence worked is the DB state and the
DocuSeal dashboard. The helper logs nothing when it reuses a submission,
so logs alone cannot prove reuse — that is why we inspect state directly.

- [ ] Re-query the quote row:
  ```sql
  SELECT docuseal_submission_id, docuseal_signing_url, sent_at
  FROM quotes WHERE id = <same id>;
  ```
  - [ ] `docuseal_submission_id` is **byte-identical** to the "before"
    snapshot above
  - [ ] `docuseal_signing_url` is **byte-identical** to the "before" snapshot
  - [ ] `sent_at` is **unchanged** (idempotence guard returns early without
    writing a new timestamp — if this changed, the guard did not hit)
- [ ] DocuSeal dashboard still shows exactly **ONE** submission for this
  quote. No duplicate submission appeared. This is the strongest signal
  that the guard worked.
- [ ] Pipeline observability: there IS a new row in `quote_pipeline_steps`
  for `step_name = docuseal_submit` (the `withPipelineStep` wrapper runs
  regardless of whether the inner helper short-circuited). Row count
  should have increased by 1:
  ```sql
  SELECT COUNT(*) FROM quote_pipeline_steps
  WHERE quote_id = <id> AND step_name = 'docuseal_submit';
  ```

**Rollback trigger:** If the DocuSeal dashboard shows a SECOND submission
for this quote, OR `docuseal_submission_id` changed, OR `sent_at` moved
forward — revert immediately. The idempotence guard has failed and every
re-send from CRM will create duplicate customer emails.

---

## 7. Regression spot-checks

Touch adjacent functionality to confirm nothing unrelated broke:

- [ ] Open an **existing** customer quote (from before the refactor) in CRM
  and confirm it still renders correctly
- [ ] Open `quote.html?id=<existing>` in a private browser window — public
  viewer still works, no leaked write token visible in page source
- [ ] Call `generate_quote_text` manually from the CRM quote page
  (Generate text button) — should work and produce new `generated_sections`
- [ ] DocuSeal webhook: if any test submission is completed by signing it
  in DocuSeal, verify `docuseal_webhook` still updates `quotes.status = signed`
  and `deals.stage = won`
- [ ] Verify existing production quotes with `status = sent` were NOT
  touched by the migration:
  `SELECT COUNT(*) FROM quotes WHERE status IN ('sent','viewed','signed');`
  → same count as before deploy

---

## 8. Rollback decision matrix

If ANY of these are observed, **revert the merge commit and redeploy the
previous state immediately:**

| Symptom | Likely cause | Rollback severity |
|---|---|---|
| `quote_pipeline_steps` table missing or malformed | Migration didn't apply | Critical |
| Duplicate DocuSeal submission on re-send | Idempotence guard broken | Critical |
| `approved_at` set on manual path | Initiator routing broken | Critical |
| Quote stuck at `generated` after send | Status update in helper failing | Critical |
| Discord embed missing after generating-proposal | `orchestrate_proposal` broke | Critical |
| `generated_sections` returning null for valid AI output | Regex extraction broke | Critical |
| Existing quotes can no longer be opened | Public viewer regression | High |
| Public viewer exposes write token | Token strip regression | High (security) |
| `quote_pipeline_steps` not logging any rows | `withPipelineStep` broken | Medium (observability only) |

**Revert procedure:**
```bash
git checkout main
git revert 018ffcc a725551   # Phase 2 and Phase 1 commits
git push origin main
# Then /safe-deploy to re-deploy the previous function versions
# Migration revert: DROP TABLE IF EXISTS quote_pipeline_steps; (safe, no data loss elsewhere)
```

After a revert, run this checklist again on the reverted state to confirm
production is back in a known-good state.

---

## 9. Clean up

After all sections pass:

- [ ] Delete the test deals and test quotes created in sections 3–6
  (keeps production data clean)
- [ ] Delete the test company `SMOKE TEST — <date>`
- [ ] Archive or delete test DocuSeal submissions (if the signing wasn't
  completed — completed ones can stay for audit)
- [ ] Close the deploy window with a short note in the session log
- [ ] Move to "post-deploy soak" mode: monitor `orchestrate_proposal`,
  `send_quote_for_signing`, `approve_proposal` logs for the next 60 minutes
  in case real customer traffic hits an edge case the synthetic tests missed

---

## 10. What this checklist does NOT cover (by design)

- Email template wording differences between manual and approval paths
  (phase 3 will unify these — not a regression)
- DocuSeal webhook idempotence (no changes in this bundle to webhook code)
- Resend email delivery latency (outside our control)
- Schema validation of AI output (phase 3 scope)
- Write-token separation (phase 5 scope)

If any of these areas need verification, run them as their own separate
smoke checks — do not block the phase 1+2 deploy on them.
