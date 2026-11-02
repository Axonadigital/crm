-- Migration: Filmstudion + upptäcktsinkorgen (Mission Control)
-- Created: 2026-11-02
-- Description: Flyttar Filmstudions data (beställda filmer, referensvideor,
--              krokar, granskningskommentarer, mätvärden) från artifact-db:n
--              till CRM-databasen så att Mission Control, VPS-runnern och
--              content-motorn läser samma källa. mc_upptackt är nattjobbets
--              inkorg för saves, bevakningar och nyheter som ska triageras.
--              En film kan använda flera referenser (en per roll) och flera
--              krokar, därför kopplingstabeller i stället för en enda FK, så
--              att båda riktningarna går att fråga (film -> referenser,
--              referens -> filmer) och resultat kan knytas till vald krok.
--              Plus en privat bucket "studio" för renderingar och stillbilder.
-- Additiv: skapar bara nya tabeller, funktioner, triggers, policies och en
-- bucket. Inga DROP, inga ALTER av befintliga tabeller eller constraints.
--
-- Behörighet: samma teammodell som MC:s proxy (mission-control/lib/team.ts):
-- aktivt konto i public.sales (disabled = false). Strängare än övriga mc_*-
-- tabellers "to authenticated using (true)" eftersom innehållet är opublicerat
-- kundmaterial och "inloggad" inte är samma sak som "i teamet" (enable_signup
-- är påslaget i config.toml, och prodläget är inte låst i repot).
-- MC skriver i dag med service role, som går förbi RLS; policyerna är skyddet
-- om en klient någon gång läser direkt med användarens JWT.
-- Radering: inga DELETE-policyer på entitetstabellerna (mjuk radering via
-- status/beslut, samma princip som customer_details och mc_approvals).
-- Kopplingsraderna (film <-> referens/krok) får tas bort av teamet, eftersom
-- att koppla loss en referens är en redigering av filmen, inte dataförlust.

-- ----------------------------------------------------------- 1) hjälpfunktioner

-- Teamkollen som RLS-uttryck. SECURITY DEFINER så att den kan läsa sales oavsett
-- sales egna policyer; fast search_path stänger search_path-kapning.
create or replace function public.mc_is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sales s
    where s.user_id = (select auth.uid())
      and s.disabled is not true
  );
$$;

comment on function public.mc_is_team_member() is
  'Sant om inloggad användare har ett aktivt konto i sales. Samma regel som MC:s proxy (lib/team.ts). Används av mc_studio_*/mc_upptackt-policyerna och studio-bucketen.';

revoke all on function public.mc_is_team_member() from public, anon;
grant execute on function public.mc_is_team_member() to authenticated, service_role;

-- Gemensam updated_at-stämpel för de nya tabellerna (en funktion i stället för
-- en per tabell; mc_*-tabellerna har hittills saknat trigger helt).
create or replace function public.mc_studio_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- --------------------------------------------------------- 2) referensvideor
-- Skapas före filmerna och krokarna, som pekar hit.
create table if not exists public.mc_studio_referenser (
  -- Samma id som Filmstudion och scripts/hamta_referens.py räknar fram ur
  -- länken: ig-<kod>, yt-<id>, tt-<id>, lank-<slug>. Ger gratis dedupe.
  id text primary key
    check (id ~ '^(ig|yt|tt|lank)-'),
  lank text not null,
  plattform text,
  konto text,
  titel text,
  kategori text,
  lanar text,
  varfor text,
  samling text,
  sparad timestamptz,
  status text not null default 'ny'
    check (status in ('ny', 'hamtad', 'matt', 'beatark', 'ogiltig')),
  format text,
  matt jsonb
    check (matt is null or jsonb_typeof(matt) = 'object'),
  video text,
  bild text,
  skapad_av uuid default auth.uid()
    references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mc_studio_referenser is
  'Filmstudion: referensvideor (Instagram-saves, konkurrentreklam, länkar) som filmer bygger på. Status ogiltig = mjukt borttagen.';
comment on column public.mc_studio_referenser.lanar is
  'Vad vi lånar från referensen (grepp, rörelse, struktur).';
comment on column public.mc_studio_referenser.matt is
  'Uppmätt beat-data från film-referens (tider, klipp, tempo).';
comment on column public.mc_studio_referenser.video is
  'Sökväg i storage-bucketen studio, inte publik URL.';
comment on column public.mc_studio_referenser.bild is
  'Sökväg i storage-bucketen studio (stillbild/kontaktark).';

create index if not exists mc_studio_referenser_status_idx
  on public.mc_studio_referenser (status, created_at desc);
create index if not exists mc_studio_referenser_skapad_av_idx
  on public.mc_studio_referenser (skapad_av);

create or replace trigger mc_studio_referenser_updated_at
  before update on public.mc_studio_referenser
  for each row execute function public.mc_studio_touch_updated_at();

-- ------------------------------------------------------------------ 3) filmer
create table if not exists public.mc_studio_filmer (
  -- Slug: k13, fiskarnas-film-a1b2 (Filmstudion gör slug + 4 tecken base36).
  id text primary key
    check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  titel text,
  status text not null default 'ide'
    check (status in ('ide', 'regi', 'andras', 'bygge', 'granskning', 'klar', 'postad')),
  format text,
  langd numeric
    check (langd is null or langd > 0),
  regi jsonb
    check (regi is null or jsonb_typeof(regi) = 'object'),
  video text,
  bild text,
  klippbord text,
  postad jsonb
    check (postad is null or jsonb_typeof(postad) = 'object'),
  postningspaket jsonb
    check (postningspaket is null or jsonb_typeof(postningspaket) = 'object'),
  kund_id uuid,
  skapad_av uuid default auth.uid()
    references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mc_studio_filmer is
  'Filmstudion: en beställd film från idé till postad. film.py bygg är spärrat tills regi.status är godkänd.';
comment on column public.mc_studio_filmer.langd is
  'Längd i sekunder.';
comment on column public.mc_studio_filmer.regi is
  'Regi-arket: {titel, referens{lank,konto,beatark}, syfte{kanal,tittare,mal}, maste_synas[], far_inte_synas[], tar[{grepp,vi}], tar_inte[{grepp,i_stallet,regel}], kapitel[{t,referens,vi,replik}], krokar[{formel,text,bild}], vald_krok, status, godkand{av,tid}, avtryck}.';
comment on column public.mc_studio_filmer.video is
  'Sökväg i storage-bucketen studio (färdig MP4).';
comment on column public.mc_studio_filmer.bild is
  'Sökväg i storage-bucketen studio (omslag/stillbild).';
comment on column public.mc_studio_filmer.klippbord is
  'Länk till Klippbord-artifacten där filmen granskas.';
comment on column public.mc_studio_filmer.postad is
  '{kanal, lank, tid, av} när filmen är ute.';
comment on column public.mc_studio_filmer.postningspaket is
  '{bildtext, hashtags, forsta_kommentar, omslag}.';
comment on column public.mc_studio_filmer.kund_id is
  'Koppling till CRM-kund. Ingen FK: CRM:ets kunder är companies.id/customer_details.id (bigint), inte uuid. Avgörs i en senare migration.';

create index if not exists mc_studio_filmer_status_idx
  on public.mc_studio_filmer (status, updated_at desc);
create index if not exists mc_studio_filmer_kund_idx
  on public.mc_studio_filmer (kund_id) where kund_id is not null;
create index if not exists mc_studio_filmer_skapad_av_idx
  on public.mc_studio_filmer (skapad_av);

create or replace trigger mc_studio_filmer_updated_at
  before update on public.mc_studio_filmer
  for each row execute function public.mc_studio_touch_updated_at();

-- ------------------------------------------------- 4) film <-> referens (n:m)
-- En film kan låna struktur från en video och rörelse från en annan; samma
-- referens kan ha flera roller i samma film, därav roll i primärnyckeln.
create table if not exists public.mc_studio_film_referenser (
  film_id text not null
    references public.mc_studio_filmer (id) on delete cascade,
  referens_id text not null
    references public.mc_studio_referenser (id) on delete cascade,
  roll text not null
    check (roll in ('struktur', 'stil', 'rorelse', 'krok', 'ljud', 'tempo', 'annat')),
  anteckning text,
  kapitel text,
  ordning smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (film_id, referens_id, roll)
);

comment on table public.mc_studio_film_referenser is
  'Vilka referenser en film bygger på och till vad. PK täcker film -> referenser, indexet på referens_id täcker referens -> filmer.';
comment on column public.mc_studio_film_referenser.kapitel is
  'Kapitel/scen i regi-arket där referensen används (null = hela filmen).';

create index if not exists mc_studio_film_referenser_referens_idx
  on public.mc_studio_film_referenser (referens_id);

-- ------------------------------------------------------------------ 5) krokar
create table if not exists public.mc_studio_krokar (
  id text primary key,
  namn text,
  mall text not null,
  formel text,
  typ text,
  kategori text,
  kalla text,
  egen boolean not null default false,
  referens_id text
    references public.mc_studio_referenser (id) on delete set null,
  skapad_av uuid default auth.uid()
    references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mc_studio_krokar is
  'Krokbiblioteket: öppningsformler med mall-text. egen = skriven av oss, annars hämtad från kalla/referens.';

create index if not exists mc_studio_krokar_referens_idx
  on public.mc_studio_krokar (referens_id);
create index if not exists mc_studio_krokar_skapad_av_idx
  on public.mc_studio_krokar (skapad_av);

create or replace trigger mc_studio_krokar_updated_at
  before update on public.mc_studio_krokar
  for each row execute function public.mc_studio_touch_updated_at();

-- ---------------------------------------------------- 6) film <-> krok (n:m)
-- Så att mätvärden senare kan knytas till den krok filmen faktiskt använde.
create table if not exists public.mc_studio_film_krokar (
  film_id text not null
    references public.mc_studio_filmer (id) on delete cascade,
  krok_id text not null
    references public.mc_studio_krokar (id) on delete cascade,
  vald boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (film_id, krok_id)
);

comment on table public.mc_studio_film_krokar is
  'Krokar som prövats för en film; vald = den som gick ut. Grund för resultat per krok.';

create index if not exists mc_studio_film_krokar_krok_idx
  on public.mc_studio_film_krokar (krok_id);

-- ------------------------------------------------------- 7) granskningskommentarer
create table if not exists public.mc_studio_kommentarer (
  id uuid primary key default gen_random_uuid(),
  film_id text not null
    references public.mc_studio_filmer (id) on delete cascade,
  avsnitt text,
  text text not null,
  status text not null default 'ny',
  av uuid default auth.uid()
    references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.mc_studio_kommentarer is
  'Rasmus/Isaks kommentarer på en film (avsnitt = tidskod eller kapitel). Varje ny kommentar blir en rad i felkatalogen samma runda.';

create index if not exists mc_studio_kommentarer_film_idx
  on public.mc_studio_kommentarer (film_id, created_at);
create index if not exists mc_studio_kommentarer_status_idx
  on public.mc_studio_kommentarer (status, created_at desc);
create index if not exists mc_studio_kommentarer_av_idx
  on public.mc_studio_kommentarer (av);

-- -------------------------------------------------------------- 8) mätvärden
create table if not exists public.mc_studio_matvarden (
  id uuid primary key default gen_random_uuid(),
  film_id text not null
    references public.mc_studio_filmer (id) on delete cascade,
  kanal text not null,
  matt_tid timestamptz not null default now(),
  visningar int,
  rackvidd int,
  tittartid_snitt numeric,
  hoppa_over_andel numeric,
  delningar int,
  likes int,
  sparningar int,
  kommentarer int,
  raw jsonb,
  created_at timestamptz not null default now(),
  -- Unik per avläsning: samma mätjobb två gånger skriver inte dubbelt.
  -- Indexet täcker också film_id-uppslag (ledande kolumn).
  unique (film_id, kanal, matt_tid)
);

comment on table public.mc_studio_matvarden is
  'Avläsningar av en postad films siffror per kanal och tidpunkt. Tidsserie, en rad per avläsning.';
comment on column public.mc_studio_matvarden.tittartid_snitt is
  'Genomsnittlig tittartid i sekunder.';
comment on column public.mc_studio_matvarden.hoppa_over_andel is
  'Andel som hoppade över (0–1).';

-- --------------------------------------------------------- 9) upptäcktsinkorg
create table if not exists public.mc_upptackt (
  id uuid primary key default gen_random_uuid(),
  kalla text not null
    check (kalla in ('save', 'bevakning', 'nyhet')),
  -- ig-<kod> eller en URL-hash. Not null så att dedupe faktiskt gäller
  -- (en nullbar unique släpper igenom hur många null-rader som helst).
  extern_id text not null unique,
  lank text,
  plattform text,
  konto text,
  titel text,
  sparad_av text,
  publicerad timestamptz,
  fack text
    check (fack in ('affarside', 'system', 'sakerhet', 'modell_verktyg',
                    'konkurrent_bransch', 'content_ide', 'videoreferens', 'inspiration')),
  relevans smallint
    check (relevans between 1 and 5),
  sammanfattning text,
  varfor_sparad text,
  stjala text,
  outlier numeric,
  outlier_metod text,
  krok jsonb
    check (krok is null or jsonb_typeof(krok) = 'object'),
  format text,
  scenroller jsonb,
  cta text,
  tidlos boolean,
  bast_fore date,
  pelare text,
  lan jsonb
    check (lan is null or jsonb_typeof(lan) = 'object'),
  kluster_id text,
  sett_hos int not null default 1
    check (sett_hos >= 1),
  beslut text not null default 'ny'
    check (beslut in ('ny', 'behall', 'slang')),
  beslut_av uuid
    references auth.users (id) on delete set null,
  beslut_tid timestamptz,
  routad_till text,
  kostnad_usd numeric
    check (kostnad_usd is null or kostnad_usd >= 0),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mc_upptackt is
  'Nattjobbets upptäcktsinkorg: saves, bevakningar och nyheter, triagerade till ett av åtta fack. beslut slang = mjukt borttagen.';
comment on column public.mc_upptackt.krok is
  '{bild, sagt, text, typ}: hur inlägget fångar tittaren de första sekunderna.';
comment on column public.mc_upptackt.lan is
  '{design, rorelse, verktyg[]}: det vi kan låna.';
comment on column public.mc_upptackt.sett_hos is
  'Antal källor/konton där samma sak dykt upp (räknas upp vid dedupe).';
comment on column public.mc_upptackt.routad_till is
  'Vart posten skickades: todo-fil, idéfil, Filmstudion, nattrapport.';

create index if not exists mc_upptackt_beslut_created_idx
  on public.mc_upptackt (beslut, created_at desc);
create index if not exists mc_upptackt_fack_idx
  on public.mc_upptackt (fack);
create index if not exists mc_upptackt_kluster_idx
  on public.mc_upptackt (kluster_id) where kluster_id is not null;
create index if not exists mc_upptackt_beslut_av_idx
  on public.mc_upptackt (beslut_av);

create or replace trigger mc_upptackt_updated_at
  before update on public.mc_upptackt
  for each row execute function public.mc_studio_touch_updated_at();

-- -------------------------------------------------------------- 10) behörigheter
-- Explicita grants i stället för att lita på projektets default privileges.
-- anon får ingenting: inga anon-policyer, och utan grant blir det "permission
-- denied" i stället för en tom lista. RLS avgör resten för authenticated.
revoke all on table
  public.mc_studio_referenser,
  public.mc_studio_filmer,
  public.mc_studio_film_referenser,
  public.mc_studio_krokar,
  public.mc_studio_film_krokar,
  public.mc_studio_kommentarer,
  public.mc_studio_matvarden,
  public.mc_upptackt
from anon;

grant select, insert, update, delete on table
  public.mc_studio_referenser,
  public.mc_studio_filmer,
  public.mc_studio_film_referenser,
  public.mc_studio_krokar,
  public.mc_studio_film_krokar,
  public.mc_studio_kommentarer,
  public.mc_studio_matvarden,
  public.mc_upptackt
to authenticated;

grant all on table
  public.mc_studio_referenser,
  public.mc_studio_filmer,
  public.mc_studio_film_referenser,
  public.mc_studio_krokar,
  public.mc_studio_film_krokar,
  public.mc_studio_kommentarer,
  public.mc_studio_matvarden,
  public.mc_upptackt
to service_role;

-- -------------------------------------------------------------------- 11) RLS
-- (select ...) runt funktionen gör att Postgres räknar den en gång per fråga,
-- inte en gång per rad.
alter table public.mc_studio_referenser enable row level security;
alter table public.mc_studio_filmer enable row level security;
alter table public.mc_studio_film_referenser enable row level security;
alter table public.mc_studio_krokar enable row level security;
alter table public.mc_studio_film_krokar enable row level security;
alter table public.mc_studio_kommentarer enable row level security;
alter table public.mc_studio_matvarden enable row level security;
alter table public.mc_upptackt enable row level security;

-- Referenser
create policy mc_studio_referenser_select on public.mc_studio_referenser
  for select to authenticated using ((select public.mc_is_team_member()));
create policy mc_studio_referenser_insert on public.mc_studio_referenser
  for insert to authenticated with check ((select public.mc_is_team_member()));
create policy mc_studio_referenser_update on public.mc_studio_referenser
  for update to authenticated
  using ((select public.mc_is_team_member()))
  with check ((select public.mc_is_team_member()));

-- Filmer
create policy mc_studio_filmer_select on public.mc_studio_filmer
  for select to authenticated using ((select public.mc_is_team_member()));
create policy mc_studio_filmer_insert on public.mc_studio_filmer
  for insert to authenticated with check ((select public.mc_is_team_member()));
create policy mc_studio_filmer_update on public.mc_studio_filmer
  for update to authenticated
  using ((select public.mc_is_team_member()))
  with check ((select public.mc_is_team_member()));

-- Film <-> referens (radering tillåten: att koppla loss är en redigering)
create policy mc_studio_film_referenser_select on public.mc_studio_film_referenser
  for select to authenticated using ((select public.mc_is_team_member()));
create policy mc_studio_film_referenser_insert on public.mc_studio_film_referenser
  for insert to authenticated with check ((select public.mc_is_team_member()));
create policy mc_studio_film_referenser_update on public.mc_studio_film_referenser
  for update to authenticated
  using ((select public.mc_is_team_member()))
  with check ((select public.mc_is_team_member()));
create policy mc_studio_film_referenser_delete on public.mc_studio_film_referenser
  for delete to authenticated using ((select public.mc_is_team_member()));

-- Krokar
create policy mc_studio_krokar_select on public.mc_studio_krokar
  for select to authenticated using ((select public.mc_is_team_member()));
create policy mc_studio_krokar_insert on public.mc_studio_krokar
  for insert to authenticated with check ((select public.mc_is_team_member()));
create policy mc_studio_krokar_update on public.mc_studio_krokar
  for update to authenticated
  using ((select public.mc_is_team_member()))
  with check ((select public.mc_is_team_member()));

-- Film <-> krok (radering tillåten: att koppla loss är en redigering)
create policy mc_studio_film_krokar_select on public.mc_studio_film_krokar
  for select to authenticated using ((select public.mc_is_team_member()));
create policy mc_studio_film_krokar_insert on public.mc_studio_film_krokar
  for insert to authenticated with check ((select public.mc_is_team_member()));
create policy mc_studio_film_krokar_update on public.mc_studio_film_krokar
  for update to authenticated
  using ((select public.mc_is_team_member()))
  with check ((select public.mc_is_team_member()));
create policy mc_studio_film_krokar_delete on public.mc_studio_film_krokar
  for delete to authenticated using ((select public.mc_is_team_member()));

-- Kommentarer
create policy mc_studio_kommentarer_select on public.mc_studio_kommentarer
  for select to authenticated using ((select public.mc_is_team_member()));
create policy mc_studio_kommentarer_insert on public.mc_studio_kommentarer
  for insert to authenticated with check ((select public.mc_is_team_member()));
create policy mc_studio_kommentarer_update on public.mc_studio_kommentarer
  for update to authenticated
  using ((select public.mc_is_team_member()))
  with check ((select public.mc_is_team_member()));

-- Mätvärden
create policy mc_studio_matvarden_select on public.mc_studio_matvarden
  for select to authenticated using ((select public.mc_is_team_member()));
create policy mc_studio_matvarden_insert on public.mc_studio_matvarden
  for insert to authenticated with check ((select public.mc_is_team_member()));
create policy mc_studio_matvarden_update on public.mc_studio_matvarden
  for update to authenticated
  using ((select public.mc_is_team_member()))
  with check ((select public.mc_is_team_member()));

-- Upptäcktsinkorgen
create policy mc_upptackt_select on public.mc_upptackt
  for select to authenticated using ((select public.mc_is_team_member()));
create policy mc_upptackt_insert on public.mc_upptackt
  for insert to authenticated with check ((select public.mc_is_team_member()));
create policy mc_upptackt_update on public.mc_upptackt
  for update to authenticated
  using ((select public.mc_is_team_member()))
  with check ((select public.mc_is_team_member()));

-- ---------------------------------------------------------------- 12) bucket
-- Privat: opublicerade kundfilmer ska inte ligga på gissningsbara publika URL:er.
-- Läsning sker med signerade URL:er (som monthly-reports-bucketen).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'studio',
  'studio',
  false,
  52428800, -- 50 MB: räcker för en 20–80 s MP4 i 1080p och stoppar råmaterial
  array['video/mp4', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Studio team select" on storage.objects
  for select to authenticated
  using (bucket_id = 'studio' and (select public.mc_is_team_member()));
create policy "Studio team insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'studio' and (select public.mc_is_team_member()));
create policy "Studio team update" on storage.objects
  for update to authenticated
  using (bucket_id = 'studio' and (select public.mc_is_team_member()))
  with check (bucket_id = 'studio' and (select public.mc_is_team_member()));
-- Radering bucket-bred för teamet (samma öppenhet som attachments och
-- feedback-images): gamla renderingar byts ut och ska kunna städas bort.
create policy "Studio team delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'studio' and (select public.mc_is_team_member()));
