-- Migration: krokarnas "varför" och "visuellt" (Filmstudion)
-- Created: 2026-11-02
-- Description: Krokbanken i Filmstudion-artifacten hade två fält som inte fick
--              någon kolumn i 20261102022121: varför kroken fungerar och hur
--              den ser ut i bild. Regi-arket och nattriagen behöver båda när en
--              krok väljs. Bara tillägg: två nullbara textkolumner, inget
--              befintligt ändras. Tabellens grants och RLS gäller även dem.

alter table public.mc_studio_krokar
  add column if not exists varfor text,
  add column if not exists visuellt text;

comment on column public.mc_studio_krokar.varfor is
  'Varför kroken fungerar (psykologin bakom den).';
comment on column public.mc_studio_krokar.visuellt is
  'Hur kroken ser ut i bild: rutor, storlekar, rörelse och tider.';
