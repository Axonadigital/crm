import type { TourDefinition } from "./types";

/**
 * Mobile tours. The mobile layout has no sidebar — navigation lives in a fixed
 * bottom bar with only four primary buttons plus a "Mer" sheet that hides the
 * rest. The overview highlights the bar and points out that the "Mer" button
 * holds the remaining sections, rather than trying to drive through the sheet.
 */

const overview: TourDefinition = {
  id: "overview",
  label: "Stor rundtur",
  hint: "Så hittar du i mobilen",
  route: "/",
  steps: [
    {
      element: '[data-tour="mobile-nav"]',
      popover: {
        title: "Välkommen 👋",
        description:
          "På mobilen navigerar du från fältet längst ner. Vi går igenom knapparna — tryck <b>Nästa</b>.",
        side: "top",
        align: "center",
      },
    },
    {
      element: '[data-tour="mobile-nav-dashboard"]',
      popover: {
        title: "Dashboard",
        description: "Nyckeltal och dagens överblick.",
        side: "top",
      },
    },
    {
      element: '[data-tour="mobile-nav-contacts"]',
      popover: {
        title: "Kontakter",
        description: "Alla personer du har en relation med.",
        side: "top",
      },
    },
    {
      element: '[data-tour="mobile-create"]',
      popover: {
        title: "Skapa nytt",
        description:
          "Plus-knappen skapar kontakt, företag, deal, offert, anteckning eller uppgift.",
        side: "top",
        align: "center",
      },
    },
    {
      element: '[data-tour="mobile-nav-call-queue"]',
      popover: {
        title: "Ringlista",
        description: "Din prioriterade samtalslista.",
        side: "top",
      },
    },
    {
      element: '[data-tour="mobile-more"]',
      popover: {
        title: "Mer",
        description:
          "Resten av CRMet finns här: Företag, Deals, Offerter, Kalender, Kundradar, Leadimport och Inställningar. Då var vi klara! 🎉",
        side: "top",
        align: "end",
      },
    },
  ],
};

export const MOBILE_TOURS: TourDefinition[] = [overview];
