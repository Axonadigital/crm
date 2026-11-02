-- Migration: klippbanken i Filmstudion (Mission Control)
-- Created: 2026-11-02
-- Description: Gratis arkivklipp (Mixkit, fri licens) där en telefon, dator
--              eller platta har grön skärm, provade med skärmersättningen
--              (content-video/scripts/klippbank.py). Studion visar dem under
--              Klipp, och en film med filmisk öppning pekar på ett klipp via
--              regi.oppning.klipp i mc_studio_filmer, så filmtabellen ändras
--              inte. Raderna skrivs av content-video/scripts/klipp_till_mc.py
--              (service role); provfilmen och affischen ligger i bucketen
--              studio under klipp/<id>/. Bara en ny tabell, inget befintligt
--              ändras.

create table if not exists public.mc_studio_klipp (
  id text primary key,
  titel text not null,
  typ text not null check (typ in ('telefon', 'dator', 'platta')),
  liggande boolean not null default false,
  fri_fran numeric,
  fri_till numeric,
  passar text,
  notch text,
  sida text,
  licens text not null default 'videoFree',
  ordning integer,
  beslut text not null default 'godkand',
  matt jsonb not null default '{}'::jsonb,
  video text,
  bild text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mc_studio_klipp_fri_ordning check (fri_fran is null or fri_till is null or fri_fran < fri_till)
);

comment on table public.mc_studio_klipp is
  'Klippbanken: arkivklipp med grön skärm som håller för skärmersättning. fri_fran/fri_till = sekunderna där skärmen syns hel; video/bild = sökvägar i bucketen studio.';

create or replace trigger mc_studio_klipp_updated_at
  before update on public.mc_studio_klipp
  for each row execute function public.mc_studio_touch_updated_at();

revoke all on table public.mc_studio_klipp from anon;
grant select, insert, update, delete on table public.mc_studio_klipp to authenticated;
grant all on table public.mc_studio_klipp to service_role;

alter table public.mc_studio_klipp enable row level security;

create policy mc_studio_klipp_select on public.mc_studio_klipp
  for select to authenticated using ((select public.mc_is_team_member()));
create policy mc_studio_klipp_insert on public.mc_studio_klipp
  for insert to authenticated with check ((select public.mc_is_team_member()));
create policy mc_studio_klipp_update on public.mc_studio_klipp
  for update to authenticated
  using ((select public.mc_is_team_member()))
  with check ((select public.mc_is_team_member()));
