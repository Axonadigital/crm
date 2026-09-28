# Legacy Quote PDF Cleanup — Runbook

**Purpose:** After the write_token separation hotfix is deployed, regenerate
the public HTML artifacts for every active pre-hotfix quote so that every
object reachable via `quotes.pdf_url` is sanitized (no real
`QUOTE_WRITE_TOKEN` leaks through Supabase Storage).

**When to run:** Once, directly after the hotfix is live in production and
the post-deploy smoke check passes. This is a required follow-up to the
hotfix — Codex's second review approved the merge on the condition that
this cleanup is tracked and executed. Do not consider the hotfix fully
closed until this runbook has been completed.

**Scope:** Targeted, not a full backfill. Only quotes whose public URL
could still be opened by a customer.

**Production project ref:** `hgyusrlrzdahucljvqsz`

---

## Background

The hotfix changed `generate_quote_pdf` to upload a sanitized variant
(`publicHtml`) to Supabase Storage while keeping the editable variant
(`editableHtml`) only in `quotes.html_content`. New quotes generated
after the hotfix are safe — their `pdf_url` points to a sanitized blob.

Quotes that existed in production before the hotfix are a different
story:

- Their `quotes.html_content` value carries the real write_token in its
  `window.QUOTE_WRITE_TOKEN="..."` assignment. `serve_quote` strips this
  on the way out (defense in depth), so access through that path is safe.
- Their Storage-hosted HTML (the thing `pdf_url` points to) is NOT
  sanitized. Anyone with the URL can open it directly from Supabase
  Storage, bypassing `serve_quote` entirely, and extract the write token.

That is the residual leak this runbook closes.

---

## Step 1: Identify the target set

Run this SQL against production. The output is the list of quotes whose
Storage artifacts still need to be regenerated:

```sql
SELECT id, quote_number, status, sent_at, pdf_url
FROM quotes
WHERE status IN ('generated', 'sent', 'viewed')
  AND sent_at < '<HOTFIX_DEPLOY_TIMESTAMPTZ>'::timestamptz
  AND pdf_url IS NOT NULL
ORDER BY sent_at DESC;
```

Substitute `<HOTFIX_DEPLOY_TIMESTAMPTZ>` with the ISO-8601 timestamp of
the hotfix edge-function deploy (check Supabase dashboard → Edge
Functions → Deployments history for `generate_quote_pdf`).

**Expected:** a small list (the 6 active sent/viewed quotes we saw at
pre-deploy time, minus any that were signed/declined/expired in the
interval).

**Export the id list:**

```sql
\copy (
  SELECT id FROM quotes
  WHERE status IN ('generated', 'sent', 'viewed')
    AND sent_at < '<HOTFIX_DEPLOY_TIMESTAMPTZ>'::timestamptz
    AND pdf_url IS NOT NULL
) TO 'legacy_quote_ids.csv' CSV;
```

Or copy the id column manually into a text file — whatever is easier.

---

## Step 2: Regenerate each quote's HTML

For every id in the list, call `generate_quote_pdf` via the edge function
endpoint. This:

- Reads `quotes.write_token` (populated by the hotfix migration for every
  row)
- Re-renders the HTML with the tokenized editor script
- Builds `publicHtml = stripWriteTokenFromHtml(editableHtml)` internally
- Uploads `publicHtml` to Storage (new filename with `Date.now()`)
- Updates `quotes.pdf_url` to point at the sanitized blob
- Updates `quotes.html_content` with the editable variant (unchanged
  behavior from before the hotfix, still safe because `serve_quote`
  strips on read)

Regenerate via curl using the service role (same role the CRM uses):

```bash
export SUPABASE_SERVICE_ROLE_KEY='...'

for id in $(cat legacy_quote_ids.csv); do
  echo "Regenerating quote $id..."
  curl -X POST \
    "https://hgyusrlrzdahucljvqsz.supabase.co/functions/v1/generate_quote_pdf" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"quote_id\": $id}"
  echo
  sleep 2
done
```

The `sleep 2` between calls is there to keep the edge function load
smooth — not a hard requirement, but the whole cleanup should take a
handful of minutes for the expected <10 quotes.

**If any call fails:** capture the response, stop the loop, fix the
underlying issue (likely a stale quote with missing contact or company
data), and restart from the failed id.

---

## Step 3: Verify each regenerated quote

After the loop finishes, run this SQL to confirm every targeted quote
now points at a fresh Storage filename:

```sql
SELECT
  id,
  quote_number,
  pdf_url,
  -- pdf_url filenames embed Date.now() as milliseconds; anything after
  -- the hotfix deploy timestamp is guaranteed to be a new sanitized blob.
  SUBSTRING(pdf_url FROM '.*quote_\d+_(\d+)\.html') AS upload_ms
FROM quotes
WHERE id = ANY(ARRAY[<id1>, <id2>, ...]);
```

Expected: every `upload_ms` is greater than the hotfix deploy timestamp
(converted to milliseconds). If any row still has an older timestamp,
its Storage artifact was NOT regenerated — re-run step 2 for that id.

**Spot-check the actual Storage payload for one quote** by fetching it
directly:

```bash
curl -s "<pdf_url from row 1>" | grep -o 'QUOTE_WRITE_TOKEN[^;]*'
```

Expected output: `QUOTE_WRITE_TOKEN = ""`

If the output contains any non-empty value (a UUID or anything that
looks like a token), the blob is NOT sanitized. Investigate before
continuing — the hotfix's artifact split might have regressed.

---

## Step 4: (Optional) Clean up orphan old Storage objects

The regeneration uploads a new filename (`quote_<id>_<new_ts>.html`)
rather than overwriting the old one. The old pre-hotfix objects still
sit in the `attachments` bucket but are no longer referenced by any
`pdf_url`.

You can leave them (they are harmless — nothing links to them and the
URLs are not guessable without the timestamp) or delete them for
hygiene:

```sql
-- Identify pre-hotfix Storage objects for the cleaned quotes.
-- Run this AFTER step 2 completes successfully.
SELECT name
FROM storage.objects
WHERE bucket_id = 'attachments'
  AND name LIKE 'quote\_%'
  AND created_at < '<HOTFIX_DEPLOY_TIMESTAMPTZ>'::timestamptz;
```

Delete one at a time through the Supabase dashboard (Storage →
attachments → delete), or leave in place. Codex flagged this as
"optional" in the approval — skip if you are time-pressed.

---

## Rollback

This cleanup is additive and idempotent. Re-running regenerates the
Storage blob and updates `pdf_url` again. There is no state to roll
back — the worst case is that a quote's Storage blob gets regenerated
twice, which is harmless.

The only risky step is step 4 (deleting old Storage objects). If you
delete the wrong object, nothing breaks until a customer opens an email
with an old link — and those old links are precisely the ones we want
to neutralize. Still, back up the relevant object(s) via the dashboard
Download button before deleting if you are unsure.

---

## Definition of done

- [ ] Target set identified via step 1 SQL
- [ ] Every quote in the set regenerated via step 2 loop
- [ ] Step 3 verification shows every targeted quote now has a
  post-hotfix Storage artifact
- [ ] Spot-check of at least one regenerated blob confirms empty
  `QUOTE_WRITE_TOKEN` value
- [ ] (Optional) Step 4 cleanup executed or explicitly skipped
- [ ] Note added to the deploy session log: "legacy pdf_url cleanup
  complete, N quotes regenerated"

Once all boxes are checked, the quote-edit-token-leak hotfix is fully
closed.
