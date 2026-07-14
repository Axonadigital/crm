-- Fortnox integration, phase 1: credential storage for the service account.
--
-- Why a table and not Vault: the access token rotates hourly and the tenant id
-- is written by an edge function at connect time. Vault is for secrets we set
-- by hand (the Client-Secret stays there, via Supabase function secrets).
--
-- Security model: RLS is enabled and NO policies are created. That makes these
-- tables unreachable for `anon` and `authenticated` — only the service role
-- (i.e. edge functions) can touch them. The CRM reads connection status through
-- the fortnox_connect function, never directly.

create table if not exists public.integration_tokens (
  provider text primary key,
  tenant_id text,
  access_token text,
  access_token_expires_at timestamptz,
  refresh_token text,
  scopes text,
  token_claims jsonb,
  connected_at timestamptz,
  connected_by bigint references public.sales (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.integration_tokens is
  'OAuth credentials for external integrations (Fortnox). Service-role only: RLS on, no policies.';
comment on column public.integration_tokens.tenant_id is
  'Fortnox tenant id. When set, tokens are minted with grant_type=client_credentials (no expiry, no user). When null we fall back to refresh_token rotation.';
comment on column public.integration_tokens.token_claims is
  'Decoded JWT claims from the last access token. Kept so we can see which claim carries the tenant id if Fortnox renames it.';

alter table public.integration_tokens enable row level security;

-- One-time-use CSRF state for the authorization redirect.
create table if not exists public.integration_oauth_states (
  state text primary key,
  provider text not null,
  created_by bigint references public.sales (id) on delete set null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

comment on table public.integration_oauth_states is
  'Single-use OAuth state parameters. Service-role only: RLS on, no policies.';

alter table public.integration_oauth_states enable row level security;

create index if not exists integration_oauth_states_created_at_idx
  on public.integration_oauth_states (created_at);
