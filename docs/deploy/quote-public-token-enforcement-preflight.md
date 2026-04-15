# Public Quote Token Enforcement — Preflight & Rollout Procedure

**Purpose:** Safely flip the `QUOTE_PUBLIC_TOKEN_ENFORCEMENT` env flag from
`off` to `on` in production, closing the IDOR vulnerability on
`/functions/v1/serve_quote?id=<quote_id>` without breaking any active
customer-facing quote link.

**When to use:** Only when all four conditions below are true. If any is
false, **do not flip the flag** — wait, regenerate old links first, or
re-issue the affected quotes.

**Production project ref:** `hgyusrlrzdahucljvqsz`

---

## Background

The hotfix (commit introducing `write_token` column and serve_quote
feature flag) shipped the following in production:

- Editor credentials (`QUOTE_WRITE_TOKEN`) are stripped from every
  public HTML response unconditionally. Customers can no longer see the
  "Redigera offert" button. This is the non-negotiable fix and it is
  already active.
- Tokenless access to `serve_quote` is still allowed by default so that
  quotes whose URLs were emailed to customers before the hotfix keep
  working. This is the IDOR surface that the feature flag closes.
- New quotes generated after the hotfix are emitted with tokenized URLs
  (`quote.html?id=<id>&token=<approval_token>`), so once all old
  tokenless links are retired we can flip the flag safely.

---

## Preconditions for enabling enforcement

### 1. No legacy tokenless customer link is still active

The hotfix that introduced tokenized URLs was deployed in the commit
that adds this preflight doc. Every quote whose public URL was emailed
BEFORE that commit's deploy timestamp is a "legacy tokenless" quote and
will 403 the moment the flag flips. Every quote sent AFTER has
`&token=<approval_token>` baked into its URL and will keep working.

The correct check is therefore to identify only the legacy group —
not every active quote — so the preflight does not block forever on
new tokenized traffic.

Run this SQL against production, substituting
`<HOTFIX_DEPLOY_TIMESTAMPTZ>` with the ISO-8601 timestamp of the hotfix
deploy (check the Supabase dashboard → Edge Functions → Deployments
history for `send_quote_for_signing` — use its deploy timestamp):

```sql
SELECT id, quote_number, status, valid_until, sent_at, created_at
FROM quotes
WHERE status IN ('generated', 'sent', 'viewed')
  AND sent_at < '<HOTFIX_DEPLOY_TIMESTAMPTZ>'::timestamptz
  AND (
    valid_until IS NULL
    OR valid_until >= current_date
  )
ORDER BY sent_at DESC;
```

**Expected result for safe flip:** zero rows.

Why `sent_at` is the right cutoff: the hotfix changes URL generation in
`send_quote_for_signing` (manual path) and `approve_proposal` (approval
path). Both write `sent_at = now()` when they create the DocuSeal
submission and tokenize the URL in the same transaction. So `sent_at`
is the canonical timestamp of when the customer received the link, and
anything sent at-or-after the hotfix deploy is guaranteed tokenized.
Quotes in `generated` status with `sent_at IS NULL` are drafts that
nobody has received a link for yet — they are safe for the flip
regardless. The `sent_at < cutoff` filter naturally excludes them
because the comparison is false when `sent_at` is NULL.

If any rows are returned, each represents a customer who may still
open a pre-hotfix tokenless link in their inbox. Do one of the following
for each row before continuing:

- Wait until `valid_until` passes (quote expires, status moves to
  `expired`)
- Wait until the customer signs (status moves to `signed`) or declines
- Re-send the quote via `send_quote_for_signing` so a new tokenized URL
  is issued (the old link then serves the same content but will stop
  working once the flag flips — the customer gets a fresh email with
  the new `&token=` URL)

**Sanity check — count the post-hotfix tokenized quotes too:**

```sql
SELECT COUNT(*) AS tokenized_active_quotes
FROM quotes
WHERE status IN ('generated', 'sent', 'viewed')
  AND sent_at >= '<HOTFIX_DEPLOY_TIMESTAMPTZ>'::timestamptz;
```

This number should be non-zero if the hotfix has been in production
for long enough that any new proposals have been sent. If it is zero
AND preflight #1 is zero, the system has been idle since the hotfix —
the flip is still safe, but double-check your timestamp.

### 2. No active approval links in Discord or other channels

```sql
SELECT id, quote_number, approval_token IS NOT NULL AS has_token, approved_at
FROM quotes
WHERE approval_token IS NOT NULL
  AND approved_at IS NULL
  AND status IN ('draft', 'generated')
ORDER BY created_at DESC;
```

**Expected result for safe flip:** zero rows, OR you have explicitly
confirmed with whoever triggered the Discord notification that the
Approve link can be discarded. Discord-exposed links include the
approval_token as `&token=` so they will still work after the flip —
this check is a sanity check that no orphan pending quotes are sitting
around that a user might suddenly try to approve.

### 3. Frontend generates tokenized public URLs everywhere

Grep the frontend for any place that builds `quote.html?id=<id>`
without a token:

```bash
grep -rn "quote.html?id=" src/
```

Every match must either:
- Include `&token=` immediately after `id`
- Be a pattern that runs server-side (e.g. inside an edge function)
  where we already append the token

If a UI surface constructs a tokenless URL, fix it **before** the flip.
Otherwise users will see 403 pages as soon as the flag goes live.

### 4. Rollback plan rehearsed

Before the flip:
- [ ] Know the exact Supabase dashboard location to toggle the env var
  back to `off` if something breaks
  (Dashboard → Project settings → Edge Functions → Secrets →
  `QUOTE_PUBLIC_TOKEN_ENFORCEMENT`)
- [ ] Have a browser window open to `quote.html?id=<id>&token=<token>`
  for an already-sent test quote so you can verify the flip worked
- [ ] Have a second browser window with `quote.html?id=<id>` (tokenless)
  so you can verify the 403 path is active

---

## Rollout steps

Only after all four preconditions pass:

1. Supabase dashboard → Project settings → Edge Functions → Secrets
2. Add or edit `QUOTE_PUBLIC_TOKEN_ENFORCEMENT` and set value to `on`
3. The change takes effect on the next invocation (no redeploy needed —
   `serve_quote` reads the env on each request via `Deno.env.get`)
4. Run the verification below within 2 minutes

## Verification after flip

- [ ] Tokenized URL returns 200 and renders HTML
  ```
  curl -s "https://hgyusrlrzdahucljvqsz.supabase.co/functions/v1/serve_quote?id=<known_id>&token=<valid_approval_token>" | jq .quote_number
  ```
- [ ] Tokenless URL returns 403
  ```
  curl -s -o /dev/null -w "%{http_code}\n" "https://hgyusrlrzdahucljvqsz.supabase.co/functions/v1/serve_quote?id=<known_id>"
  ```
  → expect `403`
- [ ] Wrong token returns 403
  ```
  curl -s -o /dev/null -w "%{http_code}\n" "https://hgyusrlrzdahucljvqsz.supabase.co/functions/v1/serve_quote?id=<known_id>&token=wrong"
  ```
  → expect `403`
- [ ] `serve_quote` logs for the last 2 minutes contain no surprise 500s

If any of these fails, **immediately flip the flag back to `off`** and
investigate with full context before retrying.

## Rollback

If the flip caused unexpected 403s for real customers:

1. Supabase dashboard → Edge Functions → Secrets → set
   `QUOTE_PUBLIC_TOKEN_ENFORCEMENT=off` (or delete the secret entirely)
2. Wait up to 30 seconds for propagation
3. Re-run the tokenless curl check — expect `200` again
4. Write a short incident note including: which customer links broke,
   why they didn't have tokens, what needs to happen before retrying
