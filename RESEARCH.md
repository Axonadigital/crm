# RESEARCH.md – CRM-analys

## Iteration 1: Funktionsanalys (2026-04-06)

### Fokus: Feature-gap mot HubSpot Free / Pipedrive Essential

Atomic CRM har redan en imponerande funktionsmängd — kontakter, företag, deals med kanban, offert-automation med AI, sekvenser, mötesanalys, och e-signering. Men det finns tydliga gap mot marknadens CRM-verktyg som kan göra systemet svårare att använda i dagligt säljarbete.

---

### Gap 1: Saknar dedikerad rapportering/analytics-sida

**Vad:** Det finns ingen separat rapporteringssida. All analytics är inbäddad i dashboarden som KPI-kort och diagram. Användare kan inte välja datumintervall, filtrera per säljare, eller exportera rapporter.

**Varför det spelar roll:** HubSpot Free har "Reports" med standardrapporter (deal pipeline, activities, productivity). Pipedrive Essential har "Insights" med drag-and-drop rapportbyggare. Säljchefer behöver kunna svara på: "Hur gick mars vs februari?" eller "Vem har flest stängda deals detta kvartal?" — det går inte idag.

**Komplexitet:** MEDEL. Frontend-sida med datumfilter + säljfilter + ompaketerade DB-vyer. Inga nya tabeller behövs.

---

### Gap 2: Ingen deal-aktivitetsloggning (stage changes, emails, samtal)

**Vad:** Activity log loggar bara skapande-händelser (contact created, deal created, note created). Det saknar: deal stage-ändringar, skickade emails, mottagna emails, avslutade tasks, redigeringar.

**Varför det spelar roll:** Både HubSpot och Pipedrive har en komplett tidslinje per deal/kontakt som visar varje interaktion. Utan detta tappar säljare kontext vid handoff mellan kollegor och kan inte se dealens fulla historia.

**Komplexitet:** MEDEL-HÖG. Kräver DB-trigger på deals (stage change), integration med email_sends-tabellen, och utökning av activity_log-vyn. Frontend behöver nya ActivityLog-komponenter.

---

### Gap 3: Ingen pipeline-sannolikhet eller viktad forecast

**Vad:** Deals har inget probability-fält. Forecast/pipeline value visar bara summan av alla deals — ingen viktning baserat på stage eller manuell sannolikhet.

**Varför det spelar roll:** Pipedrive visar "weighted value" per stage (t.ex. Proposal = 60%, Negotiation = 80%). HubSpot visar "Weighted amount" i forecast-vyn. Utan detta är pipeline-siffran vilseledande — en deal i "opportunity" räknas lika tungt som en i "negotiation".

**Komplexitet:** LÅG-MEDEL. Nytt fält `probability` på deals + stage-default-mappning i settings. Frontend: visa viktad summa i dashboard KPI + funneldiagram.

---

### Gap 4: Ingen bulk-åtgärder på kontakter/deals

**Vad:** Det finns ingen möjlighet att välja flera kontakter/deals och utföra gemensamma åtgärder (tagga, tilldela, radera, enrolla i sekvens).

**Varför det spelar roll:** HubSpot har bulk actions på alla listor (edit, delete, enroll in workflow, assign owner). Pipedrive har bulk edit. När säljare importerar 200 leads och vill tagga alla som "Mässan 2026" måste det göras en i taget idag.

**Komplexitet:** MEDEL. React-admin/shadcn-admin-kit har BulkActionButtons-mönster. Kräver UI-selektering + batch-API-anrop.

---

### Gap 5: Inget öppen/klick-tracking för skickade emails

**Vad:** `email_sends`-tabellen lagrar skickade email och `resend_events` edge function tar emot leveranshändelser (bounce, open, click). Men det finns ingen UI som visar öppningsgrad, klick eller bounce-status per email/kontakt.

**Varför det spelar roll:** HubSpot visar "Opened" / "Clicked" direkt i kontaktens tidslinje. Pipedrive har email tracking built-in. Säljare behöver veta: "Öppnade kunden min offert-email?" för att tajma uppföljning.

**Komplexitet:** LÅG. Data samlas redan in. Behöver bara: (1) frontend-komponent som visar email-events per kontakt/deal, (2) statusindikator i email-historiken.

---

### Gap 6: Tags bara på kontakter — inte företag eller deals

**Vad:** Tagg-systemet fungerar bara på contacts. Företag och deals kan inte taggas.

**Varför det spelar roll:** Pipedrive och HubSpot har universella labels/tags. Säljare vill kunna filtrera deals som "High priority" eller företag som "Partner".

**Komplexitet:** LÅG. Utöka tag-relationen till companies och deals (junction tables). Återanvänd TagChip/TagDialog-komponenterna.

---

### Gap 7: Saknar kontakt-/deal-duplikatdetektering

**Vad:** Contact merge finns men kräver manuell sökning. Import detekterar inte duplikater. Det finns ingen automatisk varning "Denna kontakt kanske redan finns".

**Varför det spelar roll:** HubSpot detekterar duplikater vid import och visar "possible duplicates"-lista. Pipedrive varnar vid skapande. Duplicerade kontakter skapar förvirring och delade historiker.

**Komplexitet:** MEDEL. Fuzzy matching på name + email vid import och create. UI-varning + merge-förslag.

---

### Gap 8: Sekvenser saknar branch-logik och automatiska triggers

**Vad:** Sekvenser är linjära (steg 1 → 2 → 3). Trigger-typer `new_lead` och `segment_change` är definierade men verkar inte fullt implementerade. Ingen villkorsbaserad förgrening (t.ex. "om email öppnades → steg A, annars → steg B").

**Varför det spelar roll:** HubSpot Workflows har if/then branching. Pipedrive har Automations med villkor. Linjära sekvenser räcker för enkel outreach men inte för sofistikerade nurturing-flöden.

**Komplexitet:** HÖG. Kräver ny datamodell (trädstruktur istället för lista), villkorsmotor, och visualiseringskomponent.

---

### Gap 9: Inga roller/behörigheter utöver admin/icke-admin

**Vad:** Två behörighetsnivåer: admin och vanlig användare. Alla inloggade kan se och redigera all data (RLS-policies är breda).

**Varför det spelar roll:** Pipedrive har visibility groups och permission sets. HubSpot har teams med hierarkisk åtkomst. I ett växande team (5+ säljare) behövs: "Sara ser bara sina deals" eller "Juniorer kan inte radera företag".

**Komplexitet:** HÖG. Kräver RBAC-modell, team-tabell, uppdaterade RLS-policies, och UI för behörighetshantering.

---

### Gap 10: Saknar Web Forms / Lead Capture

**Vad:** Ingen möjlighet att bädda in ett formulär på en hemsida som automatiskt skapar kontakter/leads i CRM:et.

**Varför det spelar roll:** HubSpot Free erbjuder embeddable forms som skapar kontakter direkt. Pipedrive har Web Forms add-on. Lead capture utan manuell inmatning är grundläggande för inbound marketing.

**Komplexitet:** MEDEL. Edge function som tar emot form-POST, skapar kontakt, optional trigger sekvens. Frontend: formulärgenerator i settings + embed-kod.

---

### Sammanfattning: Prioriterad gap-lista

| # | Gap | HubSpot? | Pipedrive? | Komplexitet | Affärsvärde |
|---|-----|----------|------------|-------------|-------------|
| 5 | Email open/click UI | Ja | Ja | LÅG | HÖGT |
| 6 | Tags på företag/deals | Ja | Ja | LÅG | MEDEL |
| 3 | Pipeline-sannolikhet | Ja | Ja | LÅG-MEDEL | HÖGT |
| 7 | Duplikatdetektering | Ja | Ja | MEDEL | HÖGT |
| 1 | Rapporteringssida | Ja | Ja | MEDEL | HÖGT |
| 4 | Bulk-åtgärder | Ja | Ja | MEDEL | HÖGT |
| 10 | Web Forms | Ja | Add-on | MEDEL | HÖGT |
| 2 | Full aktivitetslogg | Ja | Ja | MEDEL-HÖG | HÖGT |
| 8 | Sekvens-branching | Ja | Ja | HÖG | MEDEL |
| 9 | RBAC/Team-behörigheter | Ja | Ja | HÖG | MEDEL-HÖGT |

---

## Iteration 2: Användarupplevelse / UX (2026-04-06)

### Fokus: Konkreta UX-problem som påverkar dagligt säljarbete

Genomgång av frontend-komponenter i `src/components/atomic-crm/` med fokus på formulär, navigering, mobil, tomma tillstånd, och farliga åtgärder.

---

### UX 1: Deal-formulärets stängningsdatum defaultar till idag

**Vad:** `DealInputs.tsx:91` sätter `expected_closing_date` till `new Date()`. Nya deals skapas med stängningsdatum idag — omedelbart "förfallna".

**Varför:** Säljare måste manuellt ändra datum på varje ny deal. Pipeline-vyn ger en missvisande bild av tidslinjen. Standard i HubSpot/Pipedrive är +30 dagar.

**Komplexitet:** LÅG. Ändra default till `Date.now() + 14 dagar`.

> *Not: Redan identifierat i iteration 1 som FÖRSLAG. Bekräftas här med filreferens.*

---

### UX 2: Task due_date defaultar till idag — uppgifter direkt förfallna

**Vad:** `TaskCreateSheet.tsx:75` sätter `due_date: new Date().toISOString()`. Nya tasks skapas som redan förfallna.

**Varför:** Samma problem som deals. Varje ny task kräver manuell datumjustering. Uppgiftslistor fylls med röda "förfallen"-indikatorer.

**Komplexitet:** LÅG. Default till +3 arbetsdagar.

> *Not: Redan identifierat som FÖRSLAG. Bekräftas här.*

---

### UX 3: Obligatoriska fält saknar visuell markering

**Vad:** `form.tsx:80-95` — `FormLabel`-komponenten visar aldrig asterisk (*) eller "Required"-text. Användare upptäcker krav först vid submit.

**Varför:** Bryter mot WCAG 3.3.2 (Labels or Instructions) och skapar frustration. Användare fyller i halva formuläret, submittar, och får felmeddelande.

**Komplexitet:** LÅG. Lägg till `{required && <span className="text-destructive">*</span>}` i FormLabel.

---

### UX 4: Formulär visar inga realtidsfel (helperText={false})

**Vad:** `DealInputs.tsx` och andra formulär sätter `helperText={false}` på fält, vilket stänger av valideringsmeddelanden helt.

**Varför:** Utan inline-validering ser användare inga fel förrän de klickar "Spara". Dålig UX-praxis som ökar felfrekvensen.

**Komplexitet:** LÅG-MEDEL. Ta bort `helperText={false}` och se till att valideringsregler ger tydliga svenska/engelska meddelanden.

---

### UX 5: Task-radering utan bekräftelsedialog

**Vad:** `Task.tsx:204` — "Delete"-knappen i dropdown tar bort tasken direkt. Bara en undo-notis visas.

**Varför:** Accidentell radering är enkelt — ett felklick i dropdown. Om användaren navigerar bort försvinner undo-möjligheten.

**Komplexitet:** LÅG. Lägg till `AlertDialog` (redan finns i Shadcn UI) före deleteringen.

---

### UX 6: Deal-arkivering utan bekräftelse

**Vad:** `DealShow.tsx:203-227` — "Archive"-knappen utför åtgärden direkt utan dialog.

**Varför:** Arkivering tar bort dealen från aktiv pipeline. Användare kan göra detta av misstag, särskilt på mobil med små knappar.

**Komplexitet:** LÅG. Samma `AlertDialog`-mönster som UX 5.

> *Not: Redan identifierat som FÖRSLAG. Bekräftas med filreferens.*

---

### UX 7: DealCard i Kanban saknar stängningsdatum och ägare

**Vad:** `DealCard.tsx:57-95` visar bara företagsnamn, dealnamn, belopp och kategori. Saknar:
- Expected closing date (avgörande för pipeline-hantering)
- Deal owner (vem ansvarar?)
- Förfallen-indikator

**Varför:** Säljare måste klicka in på varje deal för att se urgency. Pipeline-vyn ger inte tillräckligt med information för snabba beslut.

**Komplexitet:** LÅG. Lägg till datum + ägarinitial i DealCard. Röd/gul highlight om förfallen/snart förfallen.

> *Not: Redan identifierat som FÖRSLAG. Bekräftas med filreferens.*

---

### UX 8: Tomma listor ger ingen vägledning

**Vad:** `ListNoResults.tsx:18-44` visar "No results found" eller "No results with current filters." utan CTA-knappar.

**Varför:** Nya användare som öppnar CRM:et för första gången ser tomma listor utan instruktioner. Ingen "Skapa din första kontakt"-knapp. Minskar onboarding-konvertering.

**Komplexitet:** LÅG. Lägg till kontextuell CTA: "Importera kontakter" eller "Skapa ny deal".

---

### UX 9: Kanban-brädet saknar tangentbordsnavigering

**Vad:** `DealListContent.tsx` använder `@hello-pangea/dnd` utan ARIA-labels eller keyboard-stöd för drag-drop.

**Varför:** Bryter mot WCAG 2.1 AA. Tangentbordsanvändare och skärmläsare kan inte flytta deals mellan stages.

**Komplexitet:** MEDEL. `@hello-pangea/dnd` har inbyggt keyboard-stöd men kräver korrekt ARIA-konfiguration.

---

### UX 10: CompanyAside helt dold på mobil utan indikation

**Vad:** `CompanyAside.tsx:60` — `className="hidden sm:block"` döljer sidopanelen helt på mobil. Samma i `ContactAside.tsx:37`.

**Varför:** Mobila användare missar kontaktdetaljer, lead status, enrichment-data och raderingsknappen. Ingen tab, swipe eller knapp avslöjar att informationen finns.

**Komplexitet:** MEDEL. Lägg till expanderbar panel eller tabs för mobilvy.

> *Not: CompanyShow mobil-tabs redan identifierat som FÖRSLAG. Kontaktsidan har samma problem.*

---

### UX 11: Listor visar blank sida under laddning

**Vad:** `DealList.tsx:73-85` — `if (isPending) return null;` returnerar ingenting under datahämtning.

**Varför:** Användare ser en tom sida utan indikation att data laddas. Osäkerhet: "Är appen trasig eller laddar den?"

**Komplexitet:** LÅG. Lägg till skeleton loader eller `<Spinner />` i pending-state.

---

### UX 12: Inga breadcrumbs på detaljsidor (desktop)

**Vad:** `DealShow.tsx`, `CompanyShow.tsx`, `ContactShow.tsx` saknar breadcrumb-navigering. Mobil har tillbaka-knapp men desktop saknar kontextnavigering.

**Varför:** Användare navigerar till en deal → kontakt → företag och tappar bort sig. Ingen visuell hierarki visar var de befinner sig.

**Komplexitet:** LÅG-MEDEL. Shadcn har en `Breadcrumb`-komponent. Behöver integration med React Router.

---

### Sammanfattning: Prioriterad UX-lista

| # | Problem | Var | Svårighetsgrad | Allvarlighet |
|---|---------|-----|----------------|-------------|
| 5 | Task-radering utan bekräftelse | Task.tsx:204 | LÅG | HÖG |
| 6 | Deal-arkivering utan bekräftelse | DealShow.tsx:203 | LÅG | HÖG |
| 3 | Obligatoriska fält utan markering | form.tsx:80 | LÅG | HÖG |
| 11 | Blank sida under laddning | DealList.tsx:73 | LÅG | HÖG |
| 1 | Deal-datum default idag | DealInputs.tsx:91 | LÅG | MEDEL |
| 2 | Task-datum default idag | TaskCreateSheet.tsx:75 | LÅG | MEDEL |
| 7 | DealCard saknar datum/ägare | DealCard.tsx:57 | LÅG | MEDEL |
| 8 | Tomma listor utan CTA | ListNoResults.tsx:18 | LÅG | MEDEL |
| 4 | Ingen realtids-validering | DealInputs.tsx | LÅG-MEDEL | MEDEL |
| 12 | Saknar breadcrumbs | *Show.tsx | LÅG-MEDEL | MEDEL |
| 10 | Mobil aside dold utan info | CompanyAside.tsx:60 | MEDEL | MEDEL |
| 9 | Kanban utan tangentbord | DealListContent.tsx | MEDEL | MEDEL |

---

## Iteration 3: Datamodell (2026-04-06)

### Fokus: Schema-hälsa, saknade index, inkonsekvenser och teknisk skuld

Genomgång av alla 40+ migrationer med fokus på tabellstruktur, relationsdesign, indexering, vyer och RLS-policies.

---

### DM 1: Companies-tabellen har blivit en "God Object" (50+ kolumner)

**Vad:** `companies`-tabellen har växt från 20 kolumner (init_db) till 50+ via 8 migrationer. Den innehåller nu: grunddata, lead-tracking, enrichment, social media, operationella fält, datakvalitet, scoring och pipeline-state. Varje ny feature lägger till kolumner direkt på companies.

**Varför:** God Objects är ett anti-pattern som gör tabellen svår att underhålla, dyr att SELECT * från (särskilt via `companies_summary`-vyn), och ökar risken för migreringskonflikt. `companies_summary`-vyn måste uppdateras manuellt varje gång en kolumn läggs till — detta har redan missats i flera migrationer (se DM 6).

**Komplexitet:** HÖG. Kräver refaktorering till relaterade tabeller:
- `company_enrichment` (lead_score, enrichment_data, enriched_at, segment, website_score, facebook_url, instagram_url, has_facebook, has_instagram)
- `company_operations` (owner_sales_id, last_touch_at, last_touch_type, next_action_at, next_action_type, next_action_note, pipeline_state, priority_score)

---

### DM 2: Tre överlappande ägarskapskolumner på companies

**Vad:** `companies` har tre kolumner för ägande:
1. `sales_id` — original FK till sales (init_db)
2. `assigned_to` — bigint utan FK-constraint (add_lead_tracking_columns)
3. `owner_sales_id` — FK till sales (add_operational_fields)

Kommentaren i migrationen säger: *"Explicit ownership (separate from existing sales_id which may serve other purposes)"*.

**Varför:** Tre kolumner med liknande syfte skapar förvirring. Vilken ska frontend använda? Vilken kontrollerar RLS i framtiden? `assigned_to` saknar dessutom FK-constraint och valideras aldrig.

**Komplexitet:** MEDEL. Kräver beslut om vilken kolumn som är "den rätta", migration av data, och deprecation av övriga.

> *Not: Redan identifierat i iteration 1 som FÖRSLAG. Bekräftas här med migreringsreferenser.*

---

### DM 3: deals.contact_ids är bigint[] istället för junction table

**Vad:** `deals.contact_ids` lagrar kontakt-IDs som en PostgreSQL-array (`bigint[]`). Det finns ingen junction table `deal_contacts`.

**Varför:** Arrays kan inte JOINas effektivt — frågor som "Vilka deals är kontakt X inblandad i?" kräver `@>` operatorn eller `unnest()`, vilket inte kan använda B-tree index. Det finns ett GIN-index (`idx_deals_contact_ids`), men GIN-index stödjer inte range queries eller ordering. Dessutom finns ingen referensintegritet — en raderad kontakt lämnar kvar sitt ID i arrayen utan felmeddelande.

**Komplexitet:** HÖG. Kräver:
1. Ny junction table `deal_contacts(deal_id, contact_id)` med FK constraints
2. Migration av existerande array-data
3. Uppdatering av frontend och data provider
4. Bakåtkompatibilitet under övergång

---

### DM 4: contacts.tags (bigint[]) vs companies.tags (text[]) — inkonsekvent tagg-modell

**Vad:** 
- `contacts.tags` är `bigint[]` som refererar till `tags`-tabellens ID:n
- `companies.tags` är `text[]` som lagrar tag-namn som strängar

**Varför:** Två helt olika tagg-implementationer i samma databas. `contacts.tags` kräver en JOIN till `tags`-tabellen för att visa taggnamn. `companies.tags` saknar normalisering — om ett taggnamn ändras i `tags`-tabellen uppdateras inte companies.

**Komplexitet:** MEDEL. Konsolidera till en modell. Rekommendation: använd junction tables (`contact_tags`, `company_tags`) med FK till `tags`.

---

### DM 5: activity_log-vyn saknar 5 tabeller

**Vad:** `activity_log`-vyn (migration 20260314120000) inkluderar bara 5 event-typer: company.created, contact.created, contactNote.created, deal.created, dealNote.created. Den saknar:
1. `quotes` (offert skapad/skickad/signerad)
2. `call_logs` (samtal loggade)
3. `calendar_events` (möten bokade)
4. `email_sends` (email skickade/öppnade)
5. `meeting_transcriptions` (transkriptioner inlagda)

**Varför:** Activity log-sidan visar en ofullständig bild av kundinteraktioner. En säljare som ringer 5 samtal och skickar 3 email ser inget av det i aktivitetsflödet.

**Komplexitet:** MEDEL. Utöka UNION ALL med 5 nya SELECT-satser. Kräver nya JSON-kolumner i vyn (quote, call_log, calendar_event, email_send, transcription).

> *Not: Redan identifierat i iteration 1 som FÖRSLAG. Bekräftas här med fullständig lista.*

---

### DM 6: companies_summary-vyn har återskapats 5 gånger — fragilt mönster

**Vad:** `companies_summary` har DROP + CREATE:ats i 5 olika migrationer:
1. init_db (20240730)
2. enrichment_scoring (20260328)
3. security_and_integrity_fixes (20260328)
4. update_companies_summary_view (20260329)
5. add_email_to_companies_summary (20260401)

Varje migration listar alla kolumner explicit. När en kolumn läggs till i companies men inte i vyn syns den inte för frontend.

**Varför:** Det är bara en tidsfråga innan en ny kolumn missas. Varje ny feature-migration som ändrar companies måste komma ihåg att uppdatera vyn. Det finns inget automatiskt test som verifierar detta.

**Komplexitet:** LÅG-MEDEL. Refaktorera vyn att använda `c.*` istället för explicit kolumnlista (som init_db:s version gör). Alternativt: skapa ett CI-test som jämför companies-kolumner mot companies_summary-kolumner.

---

### DM 7: contacts_summary saknar security_invoker

**Vad:** `contacts_summary`-vyn (migration 20260307120000) saknar `WITH (security_invoker=on)`. `companies_summary` har det. 

**Varför:** Utan `security_invoker=on` körs vyn med skaparens rättigheter, inte den inloggade användarens. Om RLS-policies skärps i framtiden (t.ex. "säljare ser bara sina kontakter") kommer `contacts_summary` att kringgå dem.

**Komplexitet:** LÅG. Lägg till `WITH (security_invoker=on)` vid återskapande av vyn.

---

### DM 8: Bred RLS — alla kan radera allt på kärndata

**Vad:** RLS-policies på `companies`, `contacts`, `deals`, `contactNotes`, `dealNotes` och `tasks` tillåter alla `authenticated`-användare att radera alla rader (`USING (true)`). Nyare tabeller som `call_logs` och `quotes` har ägarbaserade policies.

**Varför:** I ett team med 5+ säljare kan vem som helst radera alla företag, alla deals, alla kontakter. Inga audit trails. Ett felklick (eller en bugg i bulk-operationer) kan tömma hela CRM:et.

**Komplexitet:** HÖG. Kräver: (1) beslut om ägarskapsmodell, (2) migration av RLS-policies, (3) admin-override-logik, (4) grundlig testning.

> *Not: Redan identifierat i iteration 1 som FÖRSLAG. Fördjupas här med scope.*

---

### DM 9: Saknade index på frekvent filtrerade kolumner

**Vad:** Flera kolumner som filtreras i UI saknar index:
1. `deals.stage` — Kanban-brädet filtrerar per stage. Inget index.
2. `deals.expected_closing_date` — Sorteras i pipeline-vy. Inget index.
3. `deals.archived_at` — Filtreras (WHERE archived_at IS NULL). Inget index.
4. `contacts.company_id` — Redan fixat i activity_log-migrationen, men...
5. `calendar_events.company_id` — Saknar index (bara contact_id, sales_id, starts_at har index).
6. `email_sends.to_email` — Söks vid bounce/open webhook. Inget index.
7. `contacts.status` — Filtreras i listor. Inget index.

**Varför:** Utan index gör PostgreSQL sekventiella skanningar (seq scan) på dessa kolumner. Med <1000 rader märks det knappt, men vid 10 000+ kontakter/deals blir det en märkbar fördröjning.

**Komplexitet:** LÅG. Enkel migration med CREATE INDEX IF NOT EXISTS.

> *Not: deals.stage + deals.updated_at redan identifierat som FÖRSLAG. Utökas här med fler.*

---

### DM 10: ON DELETE CASCADE kan radera kunddata i kedja

**Vad:** `contacts.company_id` har `ON DELETE CASCADE`. `deals.company_id` har `ON DELETE CASCADE`. Det innebär: radera ett företag → alla dess kontakter och deals raderas automatiskt. Dessutom: `contactNotes.contact_id` och `dealNotes.deal_id` har CASCADE → raderar alla anteckningar.

En enda DELETE på companies kan trigga kedjeradering av 100+ rader utan varning.

**Varför:** I ett CRM är data extremt värdefullt. HubSpot och Pipedrive tillåter aldrig kaskadradering — de kräver att associerade objekt hanteras först. Att radera ett företag borde antingen (a) blockeras om det har kontakter/deals, eller (b) nollställa company_id (SET NULL).

**Komplexitet:** MEDEL. Ändra FK-constraints från CASCADE till RESTRICT eller SET NULL. Kräver migrering och uppdatering av frontend-radering som förväntar sig CASCADE.

---

### DM 11: quote_number_seq nollställs aldrig per år

**Vad:** `generate_quote_number()` använder `nextval('quote_number_seq')` med årspreffix (YYYY-0001, YYYY-0002). Men sekvensen är global och nollställs aldrig. Offert 2026-0001 följs av 2027-0002 (inte 2027-0001).

**Varför:** Kunder förväntar sig årsvisa offertnummer (2027-0001 vid nytt år). Den nuvarande implementationen ger ökande nummer oavsett år.

**Komplexitet:** LÅG-MEDEL. Ersätt sekvens med MAX(quote_number) + 1 per år, eller skapa en scheduled function som nollställer sekvensen 1 januari.

> *Not: Redan identifierat som FÖRSLAG. Bekräftas med implementation-detalj.*

---

### DM 12: Saknad updated_at på contacts

**Vad:** `contacts`-tabellen saknar `created_at` och `updated_at`-kolumner. `first_seen` används ibland som proxy för created_at, men det kan vara NULL. Alla andra tabeller (companies, deals, quotes, email_templates, sequences) har båda.

**Varför:** Omöjligt att svara på: "Vilka kontakter har uppdaterats senast?" eller "Synka kontakter ändrade efter timestamp X". Grundläggande för audit trail, API-synkronisering och rapportering.

**Komplexitet:** LÅG. `ALTER TABLE contacts ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN updated_at timestamptz DEFAULT now()` + trigger.

> *Not: Redan identifierat som FÖRSLAG. Bekräftas.*

---

### Sammanfattning: Prioriterad datamodell-lista

| # | Problem | Risk | Komplexitet | Prioritet |
|---|---------|------|-------------|-----------|
| 7 | contacts_summary saknar security_invoker | SÄKERHET | LÅG | KRITISK |
| 9 | Saknade index (deals.stage m.fl.) | PRESTANDA | LÅG | HÖG |
| 12 | Kontakter saknar created_at/updated_at | DATAKVALITET | LÅG | HÖG |
| 6 | companies_summary fragilt mönster (5 återskapanden) | UNDERHÅLL | LÅG-MEDEL | HÖG |
| 11 | quote_number_seq per-år | AFFÄRSLOGIK | LÅG-MEDEL | MEDEL |
| 10 | CASCADE-radering raderar hela kundkedjan | DATASÄKERHET | MEDEL | HÖG |
| 5 | activity_log saknar 5 tabeller | FUNKTIONALITET | MEDEL | HÖG |
| 2 | Tre ägarskapskolumner | FÖRVIRRING | MEDEL | MEDEL |
| 4 | Inkonsekvent tagg-modell (bigint[] vs text[]) | DATAINTEGRITET | MEDEL | MEDEL |
| 8 | Bred RLS — alla kan radera allt | SÄKERHET | HÖG | KRITISK |
| 3 | deals.contact_ids array istf. junction table | INTEGRITET | HÖG | MEDEL |
| 1 | Companies God Object (50+ kolumner) | UNDERHÅLL | HÖG | LÅG (långsikt) |
