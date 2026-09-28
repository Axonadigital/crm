---
name: safe-deploy
description: Pre-deployment safety checklist for pushing changes to production. Reviews all pending migrations for destructive operations, verifies backup status, and requires explicit user confirmation before proceeding. MUST be used before any production deploy.
---

# Safe Deploy Checklist

This skill ensures no production data is lost when deploying changes. Run this BEFORE every `supabase db push` or production deployment.

## Step 1: Identify New Migrations

Run `supabase migration list` to compare local vs remote migrations. Identify all migrations that have NOT been applied to production yet.

For each new migration file in `supabase/migrations/`:
- Read the full SQL content
- List every operation in the migration

## Step 2: Classify Operations (CRITICAL)

Flag every operation as SAFE or DANGEROUS:

**SAFE operations** (no data loss risk):
- `CREATE TABLE` (new table)
- `ADD COLUMN` (new column with or without default)
- `CREATE INDEX`
- `CREATE VIEW` / `CREATE OR REPLACE VIEW`
- `CREATE FUNCTION` / `CREATE OR REPLACE FUNCTION`
- `CREATE TRIGGER`
- `CREATE POLICY`
- `INSERT INTO` (adding data)
- `GRANT` / `REVOKE`

**DANGEROUS operations** (potential data loss):
- `DROP TABLE`
- `DROP COLUMN`
- `ALTER COLUMN TYPE` (may lose data if conversion fails)
- `TRUNCATE`
- `DELETE FROM` (without very specific WHERE)
- `DROP VIEW` (if other things depend on it)
- `DROP FUNCTION`
- `UPDATE ... SET` on existing data (overwrites values)
- `db reset` (NEVER on production)

## Step 3: Report to User

Present a clear summary:

```
## Deployment Safety Report

### New migrations to apply:
- 20260327_xxx_name.sql — [SAFE/DANGEROUS]
  - ADD COLUMN contacts.nickname TEXT ✅
  - DROP COLUMN contacts.old_phone ❌ DANGEROUS

### Risk assessment: [LOW / MEDIUM / HIGH / CRITICAL]

### Required actions before deploy:
- [ ] Backup taken (pg_dump or Supabase dashboard)
- [ ] All DANGEROUS operations reviewed and approved
- [ ] Tested locally with `supabase db reset` + `migration up`
```

## Step 4: Require Explicit Confirmation

If ANY dangerous operations are found:
1. Explain exactly what data will be lost
2. Suggest safer alternatives if possible (e.g., rename instead of drop, soft delete instead of hard delete)
3. **STOP and ask for explicit confirmation** — do NOT proceed without a clear "ja" or "yes" from the user

If only safe operations:
1. Still show the report
2. Ask: "Inga destruktiva operationer hittades. Vill du fortsätta med deploy?"

## Step 5: Backup Verification

Before ANY production push, ask:
- "Har du tagit en backup av produktionsdatabasen? (pg_dump eller via Supabase Dashboard > Database > Backups)"
- Do NOT proceed until user confirms backup is done

## Step 6: Deploy

Only after all confirmations:
1. Run `supabase db push` (or guide user to do it)
2. Verify migration applied successfully
3. Suggest a quick smoke test of affected features

## Safer Alternatives to Suggest

When a dangerous operation is found, suggest these alternatives:

| Dangerous | Safer Alternative |
|-----------|-------------------|
| `DROP COLUMN x` | Add `deprecated_at` column, stop using in code, drop later |
| `DROP TABLE x` | Rename to `_archive_x`, drop after verification period |
| `DELETE FROM x` | Add `deleted_at` timestamp, filter in queries |
| `ALTER COLUMN TYPE` | Add new column, migrate data, then swap |
| `TRUNCATE x` | Almost never needed — explain why or use DELETE with WHERE |
