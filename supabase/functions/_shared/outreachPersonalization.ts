import { rankFindings } from "./scanFindings.ts";
import { isThirdPartySite } from "./emailDiscovery.ts";

interface BusinessCopy {
  goal: string;
  outline: string;
  example: string;
}

const BUSINESS: Record<string, BusinessCopy> = {
  bygg: {
    goal: "göra det enkelt att se tidigare projekt och be om en offert",
    outline:
      "ett avslutat projekt, vilka jobb ni tar och en tydlig offertförfrågan",
    example:
      "en enkel vy där tid, material och godkända ändringar samlas per jobb inför faktureringen",
  },
  vvs_el: {
    goal: "göra det enkelt att hitta rätt tjänst och skicka en serviceförfrågan",
    outline:
      "vilka arbeten ni utför, var ni arbetar och en kort serviceförfrågan",
    example:
      "ett flöde från serviceförfrågan till arbetsorder och fakturaunderlag, med tid och material på samma jobb",
  },
  maleri_golv: {
    goal: "göra det enkelt att se referensjobb och be om en offert",
    outline:
      "bilder från referensjobb, vilka arbeten ni tar och en kort offertförfrågan",
    example:
      "en offertvy där ytor, material och arbetsmoment följer med från kalkylen till det accepterade jobbet",
  },
  transport: {
    goal: "göra det enkelt att beskriva ett transportbehov och begära pris",
    outline:
      "vilka uppdrag ni tar och en förfrågan med sträcka, datum och omfattning",
    example:
      "en uppdragsvy där beställning, status och underlag följer med hela vägen till fakturering",
  },
  fastighet: {
    goal: "göra det enkelt att förstå ert erbjudande och hitta rätt kontakt",
    outline:
      "ert erbjudande, exempel på uppdrag eller objekt och en tydlig kontaktväg",
    example:
      "en översikt där ärenden, ansvarig och nästa åtgärd samlas per objekt",
  },
  tandvard: {
    goal: "göra det enkelt att hitta rätt behandling och ta kontakt med mottagningen",
    outline:
      "behandlingar, praktisk information inför besöket och vägen till bokning",
    example:
      "en administrativ översikt över lediga tider och uppföljningar som behöver göras, utifrån ert befintliga bokningssystem",
  },
  salong: {
    goal: "göra det enkelt att välja behandling och komma vidare till bokningen",
    outline: "behandlingar, priser och en tydlig väg till er bokning",
    example:
      "ett flöde för sena avbokningar och återbesök som utgår från det bokningssystem ni redan använder",
  },
  restaurang: {
    goal: "göra det enkelt att hitta meny, öppettider och kontaktuppgifter",
    outline: "meny, öppettider och en tydlig kontaktväg",
    example:
      "en samlad rutin för schemaändringar och godkända arbetstider inför löneunderlaget",
  },
};

/** Fynd som säger att sidan saknas — de kan inte vara en observation OM sidan. */
const NOT_A_WEBSITE_FINDINGS = new Set(["no-site", "no-real-website"]);

const GENERIC = {
  goal: "göra det enkelt att förstå ert erbjudande och kontakta er",
  outline: "ert erbjudande, ett konkret exempel och en tydlig kontaktväg",
};

function singleLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** Only describe findings actually present; absent evidence leaves required variables unset. */
export function outreachPersonalization(input: {
  companyName?: unknown;
  websiteHost?: unknown;
  segment?: unknown;
  findings?: unknown;
}): Record<string, string> {
  const name = singleLine(input.companyName);
  const host = singleLine(input.websiteHost);
  const business = BUSINESS[singleLine(input.segment)];
  const relevant = business ?? GENERIC;
  const vars: Record<string, string> = {
    website_goal: relevant.goal,
    website_outline: relevant.outline,
  };
  if (name) {
    vars.prospect_name = name;
    // A missing URL or a directory listing does not prove the company has no website.
    vars.website_question = `Har ${name} en egen hemsida som ni vill hänvisa nya kunder till?`;
  }
  if (business) vars.systems_example = business.example;

  const seen = new Set<string>();
  const findings = rankFindings(input.findings).filter((finding) => {
    const title = singleLine(finding.title);
    const key = title.toLocaleLowerCase("sv-SE");
    if (title.length > 180 || seen.has(key)) return false;
    // "Ingen Google Business-profil hittades" är ett riktigt fynd, men det
    // handlar inte om hemsidan. Mejlet säger "i vårt test av dindoman.se"
    // och erbjuder ett ändringsförslag för sidan — då måste observationen
    // komma från sidan, annars hänger meningarna inte ihop.
    if (finding.axis === "local") return false;
    // Motsäger premissen: går inte att observera på en sida som inte finns.
    if (NOT_A_WEBSITE_FINDINGS.has(finding.id)) return false;
    seen.add(key);
    return true;
  });
  const top = findings[0];
  // En katalogsajt är inte kundens hemsida. Står merinfo.se i website-fältet
  // har vi inte testat NÅGOT som tillhör dem, och att skriva ut domänen i
  // brödtexten avslöjar mejlet som automatiskt. Hellre inget mejl.
  if (top && host && !isThirdPartySite(host)) {
    vars.website_observation = `I vårt automatiska test av ${host} flaggades: "${singleLine(top.title)}".`;
    const second = findings[1];
    vars.website_followup = second
      ? `Testet flaggade också: "${singleLine(second.title)}". Jag kan samla de två punkterna i en kort åtgärdslista.`
      : "Jag kan skicka testresultatet och ett konkret förslag på vad ni eller er webbleverantör kan kontrollera först.";
  }
  return vars;
}
