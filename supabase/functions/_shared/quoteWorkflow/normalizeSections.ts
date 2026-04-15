/**
 * Section normalization for the orchestrated proposal flow.
 *
 * Phase 1 extraction — lifted verbatim from the inline defaults block in
 * `orchestrate_proposal/index.ts`. Applies default content (problem cards,
 * process steps, support cards, tech items, founders, section titles) to
 * any field missing from the AI-generated output.
 *
 * This helper must reproduce the exact same object shape as the legacy
 * inline code. The workflow baseline tests do not cover this transform
 * yet (its output only feeds the PDF renderer), but the enriched keys
 * are read by premium section builders and by the public quote viewer,
 * so drift here will be visible downstream.
 *
 * generate_quote_text does NOT currently use this helper — it stores the
 * raw parsed sections. Phase 1 preserves that split. Future phases may
 * converge both callers behind a single normalization stage.
 */

export interface NormalizeSectionsContext {
  /** True when the deal/quote is already for a multi-page website, so the
   *  upsell "Flersidig hemsida" upgrade card should be hidden. */
  isMultiPage: boolean;
  /** Recurring payment pass-through from the deal. */
  recurringAmount?: number | null;
  recurringInterval?: string | null;
}

/**
 * Merge parsed AI sections with default content for the orchestrated
 * proposal flow. Returns null when sections is null (no drift from the
 * legacy branch in orchestrate_proposal).
 */
export function enrichSectionsForOrchestration(
  sections: Record<string, unknown> | null,
  context: NormalizeSectionsContext,
): Record<string, unknown> | null {
  if (!sections) return null;

  const src = sections as Record<string, unknown>;

  const defaultProblemCards = [
    {
      number: "01",
      title: "Svårt att bli hittad",
      text: "Utan en hemsida syns ni inte när potentiella kunder söker efter era tjänster online. Konkurrenter med en webbplats fångar dessa förfrågningar.",
    },
    {
      number: "02",
      title: "Svårt att visa vad ni gör",
      text: "Utan en samlad plats att visa era tjänster, kompetens och kontaktuppgifter blir det svårare för kunder att bedöma och lita på er.",
    },
    {
      number: "03",
      title: "Förlorade förfrågningar",
      text: "Varje dag söker potentiella kunder online. Utan en webbplats går dessa förfrågningar till konkurrenter som syns.",
    },
  ];

  const defaultPackageIncludes = [
    "Skräddarsydd design",
    "Mobilanpassat",
    "SEO-optimerad struktur",
    "Kontaktformulär",
    "SSL-certifikat",
  ];

  const defaultUpgradePackage = context.isMultiPage
    ? null
    : {
        title: "Flersidig hemsida",
        description:
          "Vill ni ha mer utrymme att presentera era tjänster, projekt och ert team? Uppgradera till en flersidig hemsida med dedikerade undersidor.",
        price: "Offert på begäran",
        includes: [
          "Upp till 5 undersidor",
          "Dedikerad tjänstesida",
          "Om oss-sida med teamet",
          "Referensprojekt-sida",
          "Blogg eller nyhetssektion",
        ],
        benefits: [
          "Mer utrymme att berätta er historia",
          "Bättre SEO med fler indexerbara sidor",
          "Professionellare intryck för större kunder",
        ],
      };

  return {
    ...src,
    problem_cards: src.problem_cards ?? defaultProblemCards,
    package_includes: src.package_includes ?? defaultPackageIncludes,
    upgrade_package:
      "upgrade_package" in src ? src.upgrade_package : defaultUpgradePackage,
    process_steps: src.process_steps ?? [
      {
        number: "01",
        title: "Signering & uppstart",
        text: "Ni godkänner offerten. Vi samlar in material — logga, texter, bilder — och påbörjar designarbetet.",
      },
      {
        number: "02",
        title: "Demoversion klar",
        text: "Vi presenterar en komplett demoversion av er hemsida som ni kan granska och ge feedback på.",
      },
      {
        number: "03",
        title: "Korrigeringar",
        text: "Vi justerar efter era önskemål. Upp till två korrigeringsrundor ingår i priset.",
      },
      {
        number: "04",
        title: "Lansering",
        text: "Vi publicerar hemsidan, kopplar domänen och säkerställer att allt fungerar. Ni äger allt.",
      },
    ],
    support_cards: src.support_cards ?? [
      {
        icon: "check-circle",
        title: "Innan lansering",
        text: "Upp till två korrigeringsrundor ingår i priset efter att demoversionen presenterats. Vi finslipar tills ni är nöjda.",
      },
      {
        icon: "edit",
        title: "Egna ändringar",
        text: "Hemsidan byggs i Builder.io — ni kan själva göra enklare justeringar av texter och bilder utan att behöva kontakta oss.",
      },
      {
        icon: "headphones",
        title: "Support efter lansering",
        text: "Behöver ni hjälp med ändringar efter lansering? Vi finns tillgängliga på timdebitering — 1 500 kr/h exkl. moms.",
      },
      {
        icon: "shield",
        title: "Full äganderätt",
        text: "Vid leverans äger ni hemsidan helt. Inga inlåsningseffekter, inga löpande avgifter från vårt håll.",
      },
    ],
    tech_items: src.tech_items ?? [
      {
        icon: "smartphone",
        title: "Mobilanpassat",
        text: "Perfekt på alla enheter",
      },
      {
        icon: "search",
        title: "SEO-optimerat",
        text: "Syns på Google lokalt",
      },
      {
        icon: "zap",
        title: "Snabb laddtid",
        text: "Optimerad prestanda",
      },
      {
        icon: "lock",
        title: "SSL-krypterad",
        text: "Säker anslutning",
      },
    ],
    founders: src.founders ?? [
      {
        initials: "RJ",
        name: "Rasmus Jönsson",
        role: "Medgrundare & Teknisk ansvarig",
        description:
          "Ansvarar för teknik och implementation. Fokuserar på robusta lösningar och att varje leverans ger mätbar effekt.",
      },
      {
        initials: "IP",
        name: "Isak Persson",
        role: "Medgrundare & Affärsutveckling",
        description:
          "Ansvarar för affärsutveckling och uppföljning. Varje lösning ska ha ett tydligt syfte och ett resultat ni kan följa.",
      },
    ],
    problem_section_title: src.problem_section_title ?? null,
    package_section_title:
      src.package_section_title ?? "Välj det som passar er",
    package_section_text:
      src.package_section_text ??
      "Paketet nedan är skräddarsytt för er verksamhet och era behov.",
    reference_section_title:
      src.reference_section_title ?? "Hemsidor vi har byggt",
    reference_section_text:
      src.reference_section_text ??
      "Här är ett urval av webbplatser vi levererat — både ensidiga och flersidiga lösningar för företag i liknande branscher.",
    reference_projects: src.reference_projects ?? null,
    process_section_title:
      src.process_section_title ?? "Från signering till lanserad hemsida",
    process_section_text:
      src.process_section_text ??
      "En tydlig process där ni alltid vet vad som händer härnäst.",
    support_section_title:
      src.support_section_title ?? "Vad som gäller efter lansering",
    tech_section_title:
      src.tech_section_title ?? "Byggt för att synas och prestera",
    about_section_title: src.about_section_title ?? "Vilka är Axona Digital?",
    about_section_text:
      src.about_section_text ??
      "Vi är en digital byrå i Östersund som hjälper svenska företag med hemsidor, e-handel och AI-lösningar. Varje leverans ska ge mätbar effekt — inte bara se bra ut.",
    price_summary_bullets: src.price_summary_bullets ?? null,
    recurring_amount: context.recurringAmount ?? null,
    recurring_interval: context.recurringInterval ?? null,
  };
}
