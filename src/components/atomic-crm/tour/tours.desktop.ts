import { clickThenAdvance } from "./tourActions";
import type { TourDefinition } from "./types";

/**
 * Desktop tours. Every step targets a `data-tour="…"` anchor. Sidebar nav items
 * carry `data-tour="nav-…"` anchors (added in AppSidebar) rather than relying on
 * `a[href="…"]`, because react-admin mounts the router with a basename so the
 * rendered href is not the literal `to` path. Deep tours target page widgets.
 */

const overview: TourDefinition = {
  id: "overview",
  label: "Stor rundtur",
  hint: "Gå igenom alla delar av CRMet",
  group: "Kom igång",
  route: "/",
  steps: [
    {
      element: '[data-slot="sidebar"]',
      popover: {
        title: "Välkommen till Axona CRM 👋",
        description:
          "Den här rundturen visar alla delar av systemet. Menyn till vänster är navet — den är alltid synlig. Klicka <b>Nästa</b> så går vi igenom den del för del.",
        side: "right",
        align: "start",
      },
    },
    {
      element: '[data-tour="nav-dashboard"]',
      popover: {
        title: "Översikt · Dashboard",
        description:
          "Startsidan med nyckeltal: intäkter, pipeline, pengar att hämta, dagens uppgifter och möten. Din dagliga temperaturmätare.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-customer-radar"]',
      popover: {
        title: "Översikt · Kundradar",
        description:
          "Överblick över alla kunders synlighet och prestanda — vilka som presterar och var pipelinen läcker.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-call-queue"]',
      popover: {
        title: "Översikt · Ringlista",
        description:
          "Din prioriterade samtalslista. Här ringer du igenom leads och loggar utfallet direkt.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-calendar"]',
      popover: {
        title: "Översikt · Kalender",
        description:
          "Möten och kalenderhändelser kopplade till kontakter och deals.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-email-stats"]',
      popover: {
        title: "Översikt · Email-statistik",
        description:
          "Öppnings-, klick- och svarsfrekvens per vecka, kanal och mall. Se vad som funkar i utskicken.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-contacts"]',
      popover: {
        title: "Sälj · Kontakter",
        description:
          "Alla personer du har en relation med. Importera, exportera (vCard), slå ihop dubletter och följ uppgifter per kontakt.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-companies"]',
      popover: {
        title: "Sälj · Företag",
        description:
          "Företagen bakom kontakterna — med samtalslogg, fakturor, kunddetaljer och lead-verktyg (sök & Google Maps).",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-deals"]',
      popover: {
        title: "Sälj · Deals",
        description:
          "Säljpipelinen som en Kanban-tavla. Dra affärer mellan steg — från ny till vunnen.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-quotes"]',
      popover: {
        title: "Sälj · Offerter",
        description:
          "Skapa och skicka offerter. Kopplas till deals och kan signeras digitalt.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-invoices"]',
      popover: {
        title: "Sälj · Fakturor",
        description:
          "Fakturor från Fortnox med status (betald/obetald/förfallen).",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-economy"]',
      popover: {
        title: "Sälj · Ekonomi",
        description:
          "Resultat per månad, kostnad per konto, återkommande intäkter och obetalda leverantörsfakturor — hämtat från bokföringen.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-liquidity"]',
      popover: {
        title: "Sälj · Likviditet",
        description:
          "Återkommande intäkter mot återkommande kostnader — din runrate och kassaflödesöversikt.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-subscriptions"]',
      popover: {
        title: "Sälj · Abonnemang",
        description:
          "Manuellt abonnemangsregister som stäms av mot bokföringen så inga återkommande intäkter/kostnader missas.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-customer-coverage"]',
      popover: {
        title: "Sälj · Kundtäckning",
        description:
          "Vilka kunder som täcks av vilka tjänster — hitta luckor och merförsäljning. Här ser du också vad som är fakturerat, vad som är obetalt och vilka fakturor som ligger i Fortnox per kund.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-lead-import-sources"]',
      popover: {
        title: "Inflöde · Leadimport",
        description:
          "Källor för nya leads och historik över importkörningar. Så fylls toppen av tratten på.",
        side: "right",
      },
    },
    {
      element: '[data-tour="topbar-actions"]',
      popover: {
        title: "Toppfältet",
        description:
          "Här byter du ljust/mörkt tema, uppdaterar datan och når din profil, teammedlemmar, inställningar, mallar och import via användarmenyn.",
        side: "bottom",
        align: "end",
      },
    },
    {
      element: '[data-tour="tour-launcher"]',
      popover: {
        title: "Starta om när du vill",
        description:
          "Härifrån startar du rundturen igen eller kör en <b>djupguide</b> för en specifik sida (Dashboard, Deals, Kontakter …). Då är vi klara — välkommen tillbaka! 🎉",
        side: "right",
        align: "end",
      },
    },
  ],
};

const dashboard: TourDefinition = {
  id: "dashboard",
  label: "Djupguide · Dashboard",
  group: "Sälj",
  hint: "Vad varje widget visar",
  route: "/",
  steps: [
    {
      element: '[data-tour="dashboard-kpi"]',
      popover: {
        title: "Nyckeltal",
        description:
          "Snabb sammanfattning av verksamhetens viktigaste siffror just nu.",
      },
    },
    {
      element: '[data-tour="dashboard-financial"]',
      popover: {
        title: "Finansiella nyckeltal",
        description: "Ekonomisiffror hämtade direkt från Fortnox-bokföringen.",
      },
    },
    {
      element: '[data-tour="dashboard-revenue"]',
      popover: {
        title: "Intäktstrend",
        description: "Intäkter per månad — se trenden över tid.",
      },
    },
    {
      element: '[data-tour="dashboard-pipeline"]',
      popover: {
        title: "Pipeline-fördelning",
        description: "Hur affärerna fördelar sig över säljstegen.",
      },
    },
    {
      element: '[data-tour="dashboard-money"]',
      popover: {
        title: "Pengar att hämta",
        description:
          "Utestående belopp du kan fakturera eller driva in — låt inget ligga kvar.",
        side: "left",
      },
    },
    {
      element: '[data-tour="dashboard-tasks"]',
      popover: {
        title: "Dagens uppgifter",
        description: "Dina att-göra-punkter så inget faller mellan stolarna.",
        side: "left",
      },
    },
  ],
};

const deals: TourDefinition = {
  id: "deals",
  label: "Djupguide · Deals",
  group: "Sälj",
  hint: "Så funkar Kanban-tavlan",
  route: "/deals",
  steps: [
    {
      element: '[data-tour="deals-board"]',
      popover: {
        title: "Kanban-tavlan",
        description:
          "Varje kolumn är ett steg i säljprocessen. Dra ett kort åt höger när affären går framåt.",
      },
    },
    {
      element: '[data-tour="deals-board"] > *:first-child',
      popover: {
        title: "Ett säljsteg",
        description:
          "Alla affärer i det här steget, med summa högst upp. Dra & släpp för att flytta.",
      },
    },
    {
      element: '[data-tour="deals-create"]',
      popover: {
        title: "Ny affär",
        description: "Skapa en ny deal — den hamnar i första steget.",
        side: "left",
      },
    },
  ],
};

const contacts: TourDefinition = {
  id: "contacts",
  label: "Djupguide · Kontakter",
  group: "Sälj",
  hint: "Lista, import & export",
  route: "/contacts",
  steps: [
    {
      element: '[data-tour="contacts-list"]',
      popover: {
        title: "Kontaktlistan",
        description:
          "Alla kontakter med filter och sök. Klicka på en rad för att öppna kontaktkortet.",
      },
    },
    {
      element: '[data-tour="contacts-actions"]',
      popover: {
        title: "Importera & exportera",
        description:
          "Importera kontakter från CSV eller exportera som vCard. Här kan du också slå ihop dubletter.",
        side: "bottom",
        align: "end",
      },
    },
  ],
};

const companies: TourDefinition = {
  id: "companies",
  label: "Djupguide · Företag",
  group: "Sälj",
  hint: "Lead-verktyg & kundvy",
  route: "/companies",
  steps: [
    {
      element: '[data-tour="companies-list"]',
      popover: {
        title: "Företagslistan",
        description:
          "Alla företag. Klicka på ett kort för samtalslogg, kontakter, fakturor och kunddetaljer.",
      },
    },
    {
      element: '[data-tour="companies-leadtools"]',
      popover: {
        title: "Lead-verktyg",
        description:
          "Hitta nya företag via sökprofiler och Google Maps direkt härifrån.",
        side: "bottom",
        align: "end",
      },
    },
    {
      popover: {
        title: "Scanna hemsida — rapporten som öppnar samtalet",
        description:
          "Öppna ett företag med hemsida och klicka <b>Scanna hemsida</b> i högerspalten (Enrichment-sektionen). Sajten betygsätts 0–100 på sex områden och en delbar, säljfärdig rapport öppnas — ha den i handen vid första samtalet. Tumregel: <b>Scanna hemsida</b> = utifrån-analys av <i>prospekt</i> före affären. <b>Kundfliken</b> = djupanalysen och månadsrapporten för <i>vunna kunder</i>, med deras riktiga Google-data (Search Console &amp; Business-profil).",
      },
    },
  ],
};

const economy: TourDefinition = {
  id: "economy",
  label: "Djupguide · Ekonomi",
  group: "Ekonomi & fakturering",
  hint: "Bokföring & återkommande",
  route: "/economy",
  steps: [
    {
      element: '[data-tour="economy-page"]',
      popover: {
        title: "Ekonomi",
        description:
          "Allt ekonomiskt på ett ställe, hämtat från Fortnox: resultat per månad, kostnad per konto, återkommande intäkter/kostnader och obetalda leverantörsfakturor.",
      },
    },
  ],
};

/**
 * Kundtäckning is where the whole billing chain lands, so both the what's-new
 * tour and the deep guide live on that page. The row with the real Fortnox
 * invoices is collapsed by default — `clickThenAdvance` opens it so the tour
 * demonstrates the feature instead of describing it.
 */
const whatsNewFortnox: TourDefinition = {
  id: "whats-new-fortnox",
  label: "Nytt: fakturering mot Fortnox",
  group: "Kom igång",
  hint: "Det som tillkommit sedan sist",
  route: "/customer-coverage",
  steps: [
    {
      element: '[data-tour="coverage-kpi"]',
      popover: {
        title: "Nytt: fakturera direkt från CRM:et 🎉",
        description:
          "Hela kedjan går nu härifrån: en <b>vunnen affär</b> lägger upp kunden och skapar fakturan i Fortnox, återkommande avtal startas med ett klick, och betalningarna kommer tillbaka hit. Vi tar de fyra viktigaste sakerna — det tar en minut.",
      },
    },
    {
      element: '[data-tour="coverage-unpaid-kpi"]',
      popover: {
        title: "1. Obetalt är inte samma sak som ofakturerat",
        description:
          "<b>Obetalt</b> = fakturan är skickad, pengarna har inte kommit. Blir kortet rött har någon kund en <b>förfallen</b> faktura — då är det påminnelse som gäller, inte en ny faktura.",
      },
    },
    {
      element: '[data-tour="coverage-remaining-kpi"]',
      popover: {
        title: "2. Kvar att fakturera är pengar du inte bett om än",
        description:
          "Det här är motsatsen: affärer som är vunna men där fakturan inte är skapad. Två olika problem, två olika åtgärder — därför två kolumner.",
      },
    },
    {
      element: '[data-tour="coverage-expand"]',
      popover: {
        title: "3. Nu ser du de riktiga fakturorna",
        description:
          "Pilen fäller ut kundens affärer <i>och</i> fakturorna som ligger i Fortnox. Tryck <b>Nästa</b> så öppnar vi den åt dig.",
        onNextClick: clickThenAdvance(
          '[data-tour="coverage-expand"]',
          '[data-tour="coverage-invoices"]',
        ),
      },
    },
    {
      element: '[data-tour="coverage-invoices"]',
      popover: {
        title: "Samma siffror som i Fortnox",
        description:
          "Fakturanummer, datum, förfallodatum och vad som är kvar att betala — hämtat från Fortnox, inte gissat. Du behöver inte längre växla till Fakturor-fliken för att kolla om något gått ut.",
      },
    },
    {
      popover: {
        title: "4. Två nya knappar på en vunnen affär",
        description:
          "Öppna en affär i steget <b>Vunnen</b> så finns <b>Skapa faktura i Fortnox</b> och <b>Lägg upp återkommande</b> i knappraden. Klicka på frågetecknet <b>?</b> bredvid dem för en guide som går igenom exakt vad varje knapp gör — inklusive delbetalningar och varför avtalet läggs upp pausat.",
      },
    },
    {
      element: '[data-tour="nav-liquidity"]',
      popover: {
        title: "Följden syns i Likviditet och Abonnemang",
        description:
          "Återkommande intäkter mot återkommande kostnader ger runraten. <b>Abonnemang</b> är registret över vad ni själva betalar för, avstämt mot bokföringen.",
        side: "right",
      },
    },
    {
      element: '[data-tour="tour-launcher"]',
      popover: {
        title: "Alla guider finns här",
        description:
          "Under <b>Rundtur & hjälp</b> ligger djupguider för Kundtäckning, Fakturor, Abonnemang, Likviditet och Fortnox-kopplingen. Kör dem när du behöver — de tar en halv minut var. Klart! 🎉",
        side: "right",
        align: "end",
      },
    },
  ],
};

const customerCoverage: TourDefinition = {
  id: "customer-coverage",
  label: "Djupguide · Kundtäckning",
  group: "Ekonomi & fakturering",
  hint: "Vad varje kolumn betyder",
  route: "/customer-coverage",
  steps: [
    {
      element: '[data-tour="coverage-kpi"]',
      popover: {
        title: "Läget för alla kunder",
        description:
          "Varje kund med en vunnen affär, vad som är uppsatt i Fortnox och vad som återstår. Sidan sorterar sig själv så det som behöver åtgärdas hamnar överst.",
      },
    },
    {
      element: '[data-tour="coverage-unpaid-kpi"]',
      popover: {
        title: "Obetalt",
        description:
          "Fakturerat men inte betalt, över alla år. Rött kort betyder att minst en faktura passerat förfallodatum.",
      },
    },
    {
      element: '[data-tour="coverage-remaining-kpi"]',
      popover: {
        title: "Kvar att fakturera",
        description:
          "Vad som återstår att fakturera i år: återstående abonnemangsmånader, engångsbelopp utan faktura och kvarvarande delbetalningar.",
      },
    },
    {
      element: '[data-tour="coverage-col-unpaid"]',
      popover: {
        title: "Obetalt per kund",
        description:
          "Håll musen över siffran för att se hur mycket av den som är förfallen. Är den noll har kunden betalat allt som gått ut.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="coverage-col-remaining"]',
      popover: {
        title: "Kvar att fakturera per kund",
        description:
          "Står det <b>0 kr</b> här men kunden ändå har ett belopp under Obetalt så är allt fakturerat — då väntar du på betalning, du ska inte skicka mer.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="coverage-col-status"]',
      popover: {
        title: "Status",
        description:
          "<b>Fakturerad</b> = allt som skulle faktureras är fakturerat. <b>Ingen faktura</b> = kunden har aldrig fakturerats. En röd <b>Förfallen</b>-bricka läggs till oavsett status när en faktura passerat förfallodatum.",
        side: "bottom",
      },
    },
    {
      element: '[data-tour="coverage-col-contract"]',
      popover: {
        title: "Avtal",
        description:
          "Bock = kunden har en återkommande fakturering upplagd i Fortnox, så fakturan skapas automatiskt varje period. Kryss = du fakturerar manuellt varje gång. Streck = kunden har inget återkommande belopp.",
        side: "bottom",
        align: "end",
      },
    },
    {
      element: '[data-tour="coverage-expand"]',
      popover: {
        title: "Fäll ut för detaljerna",
        description:
          "Pilen visar kundens affärer rad för rad och fakturorna i Fortnox. Tryck <b>Nästa</b> så öppnar vi den.",
        onNextClick: clickThenAdvance(
          '[data-tour="coverage-expand"]',
          '[data-tour="coverage-invoices"]',
        ),
      },
    },
    {
      element: '[data-tour="coverage-invoices"]',
      popover: {
        title: "Fakturor i Fortnox",
        description:
          "Exakt samma lista som på kundkortets Fakturor-flik — samma datakälla, så vyerna kan aldrig säga emot varandra. Har en faktura aldrig gått ut via Fortnox dyker en <b>Skicka</b>-knapp upp här.",
      },
    },
  ],
};

/**
 * Contextual: the buttons only render on a won deal, so this tour is started
 * from the help button in the deal's action row rather than the launcher.
 */
const dealBilling: TourDefinition = {
  id: "deal-billing",
  label: "Fakturera den här affären",
  hint: "Engång, delbetalning och återkommande",
  contextual: true,
  steps: [
    {
      element: '[data-tour="deal-actions"]',
      popover: {
        title: "Härifrån fakturerar du",
        description:
          "Knapparna dyker upp när affären står i steget <b>Vunnen</b> och har ett belopp. Innan dess finns inget att fakturera.",
        side: "bottom",
        align: "end",
      },
    },
    {
      element: '[data-tour="deal-invoice"]',
      popover: {
        title: "Skapa faktura i Fortnox",
        description:
          "Skapar ett <b>fakturautkast</b> på affärens engångsbelopp. Saknas kunden i Fortnox läggs den upp automatiskt med uppgifterna från företagskortet — du behöver inte förbereda något. Utkastet granskar och skickar du i Fortnox.",
        side: "bottom",
      },
    },
    {
      popover: {
        title: "Delbetalningar",
        description:
          "Sätt <b>Faktureringstyp: Delbetalning</b> på affären och ange antal delar, så byter knappen namn till <b>Skapa delfaktura 2/3</b> och räknar upp för varje faktura du skapar. Sista delen justeras på öret så summan alltid går ihop med affärens belopp.",
      },
    },
    {
      element: '[data-tour="deal-recurring"]',
      popover: {
        title: "Lägg upp återkommande",
        description:
          "Finns bara när affären har ett <b>återkommande belopp</b>. Lägger upp en automatisk fakturering i Fortnox med rätt intervall — månad, kvartal eller år.",
        side: "bottom",
      },
    },
    {
      popover: {
        title: "Två steg med flit",
        description:
          "Avtalet läggs upp <b>pausat</b>. Ingenting faktureras förrän du klickar <b>Aktivera</b>. Däremellan kan du öppna avtalet i Fortnox och kontrollera belopp, moms och startdatum — Fortnox har inget riktigt utkastläge för återkommande, så det här är vår säkerhetsspärr.",
      },
    },
    {
      element: '[data-tour="deal-next-invoice"]',
      popover: {
        title: "Fakturerad t.o.m. styr startdatumet",
        description:
          "Är kunden redan fakturerad en bit fram i tiden startar avtalet dagen efter — inte från avtalets ursprungliga startdatum. Det är så du slipper dubbelfakturera en kund du hunnit fakturera manuellt.",
      },
    },
  ],
};

const invoices: TourDefinition = {
  id: "invoices",
  label: "Djupguide · Fakturor",
  group: "Ekonomi & fakturering",
  hint: "Spegling, filter och status",
  route: "/invoices",
  steps: [
    {
      element: '[data-tour="invoices-kpi"]',
      popover: {
        title: "Alla fakturor från Fortnox",
        description:
          "Sidan är en spegling — Fortnox är sanningen, det här är kopian CRM:et räknar på. Beloppen visas inklusive moms med ex moms som undertext, eftersom det är ex moms som räknas som intäkt.",
      },
    },
    {
      element: '[data-tour="invoices-sync"]',
      popover: {
        title: "Synka nu",
        description:
          "Synken går automatiskt var femtonde minut. Knappen är för när du precis skapat något i Fortnox och inte vill vänta.",
        side: "left",
      },
    },
    {
      element: '[data-tour="invoices-filters"]',
      popover: {
        title: "Filtren",
        description:
          "<b>Ej skickade</b> är den viktigaste: fakturor som finns i Fortnox men aldrig gått ut till kunden. De blir aldrig betalda av sig själva.",
      },
    },
    {
      element: '[data-tour="invoices-table"]',
      popover: {
        title: "Kvar att betala",
        description:
          "Kolumnen visar vad som återstår på varje faktura — delbetalningar och krediteringar är redan avräknade. Summan av den kolumnen är exakt det som står under Obetalt i Kundtäckning.",
      },
    },
  ],
};

const liquidity: TourDefinition = {
  id: "liquidity",
  label: "Djupguide · Likviditet",
  group: "Ekonomi & fakturering",
  hint: "Runrate in mot ut",
  route: "/liquidity",
  steps: [
    {
      element: '[data-tour="liquidity-kpi"]',
      popover: {
        title: "Runrate",
        description:
          "Återkommande intäkter minus återkommande kostnader. Det här är pengarna som kommer in respektive går ut varje månad utan att någon gör något — grunden att stå på när ni tar beslut.",
      },
    },
    {
      element: '[data-tour="liquidity-income"]',
      popover: {
        title: "Återkommande intäkter",
        description:
          "Vunna avtalskunder och deras månadsbelopp. Saknas en kund här har affären inget återkommande belopp ifyllt.",
      },
    },
    {
      element: '[data-tour="liquidity-costs"]',
      popover: {
        title: "Återkommande kostnader",
        description:
          "Kommer från abonnemangsregistret. Ligger ett abonnemang inte i registret saknas det här — och då är runraten för optimistisk.",
        side: "left",
      },
    },
  ],
};

const subscriptions: TourDefinition = {
  id: "subscriptions",
  label: "Djupguide · Abonnemang",
  group: "Ekonomi & fakturering",
  hint: "Registret och avstämningen",
  route: "/subscriptions",
  steps: [
    {
      element: '[data-tour="subscriptions-kpi"]',
      popover: {
        title: "Vad ni betalar för",
        description:
          "Registret är manuellt — Fortnox vet vad som dragits, men inte vad det <i>skulle</i> kosta. Genom att skriva in det jämförs deklarerat mot bokfört och avvikelser syns direkt.",
      },
    },
    {
      element: '[data-tour="subscriptions-table"]',
      popover: {
        title: "Aktiva abonnemang",
        description:
          "Ett abonnemang per rad med kostnad, intervall och vad bokföringen faktiskt visar. Skiljer sig siffrorna har priset höjts utan att någon sagt något.",
      },
    },
    {
      element: '[data-tour="subscriptions-add"]',
      popover: {
        title: "Lägg till",
        description:
          "Nytt verktyg tecknat? Skriv in det direkt så syns kostnaden i runraten samma dag i stället för att dyka upp som en överraskning i bokslutet.",
        side: "left",
      },
    },
    {
      element: '[data-tour="subscriptions-unregistered"]',
      popover: {
        title: "Ej i registret",
        description:
          "Leverantörer som dras löpande i bokföringen men saknas i listan ovan. Den här sektionen visas bara när det finns något att åtgärda — är den borta är allt avstämt.",
      },
    },
  ],
};

const fortnoxSetup: TourDefinition = {
  id: "fortnox-setup",
  label: "Djupguide · Fortnox-koppling",
  group: "Ekonomi & fakturering",
  hint: "Skarp miljö och testmiljö",
  route: "/settings",
  steps: [
    {
      element: '[data-tour="settings-fortnox"]',
      popover: {
        title: "Den skarpa kopplingen",
        description:
          "Kopplas en gång via Fortnox och förnyar sig sedan själv som <b>servicekonto</b> — ingen behöver logga in igen. Står det att kopplingen inte är permanent behöver den göras om, annars slutar den fungera inom 45 dagar.",
      },
    },
    {
      element: '[data-tour="settings-fortnox-sandbox"]',
      popover: {
        title: "Testmiljön",
        description:
          "Ett separat testföretag hos Fortnox, kopplat vid sidan av det skarpa. Synkarna läser <b>alltid</b> skarp miljö, så inget testdata kan hamna i Kundtäckning eller Likviditet.",
      },
    },
    {
      element: '[data-tour="settings-fortnox-test"]',
      popover: {
        title: "Testkör avtalsflödet",
        description:
          "Kör exakt samma två steg som på en affär, fast mot testföretaget. Affären i CRM:et rörs inte — inget sparas på den, så du kan testa hur många gånger du vill.",
      },
    },
    {
      element: '[data-tour="settings-fortnox-test-steps"]',
      popover: {
        title: "Skapa och aktivera",
        description:
          "<b>1. Skapa pausat avtal</b> lägger upp avtalet utan att fakturera. <b>2. Aktivera</b> startar det. Kör igenom en gång så ser du precis vad som händer i Fortnox innan du gör det skarpt.",
      },
    },
  ],
};

export const DESKTOP_TOURS: TourDefinition[] = [
  overview,
  whatsNewFortnox,
  dashboard,
  deals,
  contacts,
  companies,
  customerCoverage,
  invoices,
  economy,
  liquidity,
  subscriptions,
  fortnoxSetup,
  dealBilling,
];
