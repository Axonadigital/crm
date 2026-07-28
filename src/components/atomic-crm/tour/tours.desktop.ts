import type { TourDefinition } from "./types";

/**
 * Desktop tours. The overview tour rides on the always-visible left sidebar
 * (`a[href="…"]` links are stable, no page instrumentation needed). The deep
 * tours target `data-tour="…"` anchors added to each page's key widgets.
 */

const overview: TourDefinition = {
  id: "overview",
  label: "Stor rundtur",
  hint: "Gå igenom alla delar av CRMet",
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
      element: 'a[href="/"]',
      popover: {
        title: "Översikt · Dashboard",
        description:
          "Startsidan med nyckeltal: intäkter, pipeline, pengar att hämta, dagens uppgifter och möten. Din dagliga temperaturmätare.",
        side: "right",
      },
    },
    {
      element: 'a[href="/customer-radar"]',
      popover: {
        title: "Översikt · Kundradar",
        description:
          "Överblick över alla kunders synlighet och prestanda — vilka som presterar och var pipelinen läcker.",
        side: "right",
      },
    },
    {
      element: 'a[href="/call-queue"]',
      popover: {
        title: "Översikt · Ringlista",
        description:
          "Din prioriterade samtalslista. Här ringer du igenom leads och loggar utfallet direkt.",
        side: "right",
      },
    },
    {
      element: 'a[href="/calendar"]',
      popover: {
        title: "Översikt · Kalender",
        description:
          "Möten och kalenderhändelser kopplade till kontakter och deals.",
        side: "right",
      },
    },
    {
      element: 'a[href="/email-stats"]',
      popover: {
        title: "Översikt · Email-statistik",
        description:
          "Öppnings-, klick- och svarsfrekvens per vecka, kanal och mall. Se vad som funkar i utskicken.",
        side: "right",
      },
    },
    {
      element: 'a[href="/contacts"]',
      popover: {
        title: "Sälj · Kontakter",
        description:
          "Alla personer du har en relation med. Importera, exportera (vCard), slå ihop dubletter och följ uppgifter per kontakt.",
        side: "right",
      },
    },
    {
      element: 'a[href="/companies"]',
      popover: {
        title: "Sälj · Företag",
        description:
          "Företagen bakom kontakterna — med samtalslogg, fakturor, kunddetaljer och lead-verktyg (sök & Google Maps).",
        side: "right",
      },
    },
    {
      element: 'a[href="/deals"]',
      popover: {
        title: "Sälj · Deals",
        description:
          "Säljpipelinen som en Kanban-tavla. Dra affärer mellan steg — från ny till vunnen.",
        side: "right",
      },
    },
    {
      element: 'a[href="/quotes"]',
      popover: {
        title: "Sälj · Offerter",
        description:
          "Skapa och skicka offerter. Kopplas till deals och kan signeras digitalt.",
        side: "right",
      },
    },
    {
      element: 'a[href="/invoices"]',
      popover: {
        title: "Sälj · Fakturor",
        description:
          "Fakturor från Fortnox med status (betald/obetald/förfallen).",
        side: "right",
      },
    },
    {
      element: 'a[href="/economy"]',
      popover: {
        title: "Sälj · Ekonomi",
        description:
          "Resultat per månad, kostnad per konto, återkommande intäkter och obetalda leverantörsfakturor — hämtat från bokföringen.",
        side: "right",
      },
    },
    {
      element: 'a[href="/liquidity"]',
      popover: {
        title: "Sälj · Likviditet",
        description:
          "Återkommande intäkter mot återkommande kostnader — din runrate och kassaflödesöversikt.",
        side: "right",
      },
    },
    {
      element: 'a[href="/subscriptions"]',
      popover: {
        title: "Sälj · Abonnemang",
        description:
          "Manuellt abonnemangsregister som stäms av mot bokföringen så inga återkommande intäkter/kostnader missas.",
        side: "right",
      },
    },
    {
      element: 'a[href="/customer-coverage"]',
      popover: {
        title: "Sälj · Kundtäckning",
        description:
          "Vilka kunder som täcks av vilka tjänster — hitta luckor och merförsäljning.",
        side: "right",
      },
    },
    {
      element: 'a[href="/lead_import_sources"]',
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
  ],
};

const economy: TourDefinition = {
  id: "economy",
  label: "Djupguide · Ekonomi",
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

export const DESKTOP_TOURS: TourDefinition[] = [
  overview,
  dashboard,
  deals,
  contacts,
  companies,
  economy,
];
