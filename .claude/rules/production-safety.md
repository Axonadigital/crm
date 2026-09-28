# Production Data Safety

> CRITICAL: This rule applies at ALL times when working in this project.

## Automatic Migration Review

Whenever you create, modify, or are asked to push a database migration:

1. **Scan for destructive SQL** — flag any `DROP`, `TRUNCATE`, `DELETE`, `ALTER COLUMN TYPE` operations
2. **If destructive operations found** — STOP immediately, explain the risk, suggest safer alternatives, and require explicit user approval
3. **Never run `supabase db reset` against production** — this is a local-only command
4. **Never run `supabase db push` without first reviewing all pending migrations**

## Before Any Production Deploy

ALWAYS run the `/safe-deploy` skill before pushing to production. This is non-negotiable.

If the user asks to push, deploy, or apply migrations to production:
1. Remind them to run `/safe-deploy` first
2. Do NOT proceed with the push until the checklist is complete

## Migration Writing Rules

When writing new migrations:
- Prefer `ADD COLUMN` over `ALTER COLUMN`
- Prefer renaming over dropping (rename to `_deprecated_<name>`)
- Use `IF EXISTS` / `IF NOT EXISTS` guards
- Add comments explaining WHY changes are made
- Never write `DROP` statements without explicit user request

## Backup Reminders

Before any production-affecting operation, ask:
> "Har du tagit en backup av produktionsdatabasen?"

Do not proceed without confirmation.
