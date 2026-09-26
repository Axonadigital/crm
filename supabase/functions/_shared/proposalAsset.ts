// Förslagsagenten: ren logik för vad som ska byggas för en enrollment i
// outreach-flödet, och hur. Renderingen sker på VPS:en (render-service
// /proposal); uppladdning och bokföring i build_proposal_assets/index.ts.
//
// Varför en egen modul: reglerna för vilka familjer som får en bild, vad som
// står under telefonerna och när en människa ska ta över är testbara utan
// databas och webbläsare.

import { FAMILIES, type KrokFamily, measuredValue } from "./krokCopy.ts";
import { shortCompanyName } from "./companyName.ts";
import { websiteHost } from "./templateVars.ts";

/** Efter så många misslyckade byggen lämnas leveransen till en människa. */
export const MAX_BUILD_ATTEMPTS = 3;
/** Högst så många byggen per körning — varje tar 30–90 s hos renderaren. */
export const MAX_BUILDS_PER_RUN = 2;
/** Bilden ska in i ett mejl. Gmail klipper stora mejl vid ~100 kB HTML men
 *  länkade bilder får vara större; över 900 kB börjar det kännas i mobilen. */
export const MAX_ASSET_BYTES = 900_000;
export const ASSET_BUCKET = "scanner-screenshots";

/** Familjer där steg 2 bär en bild, ur krokCopy — inte en egen lista. */
export function familiesNeedingAsset(): KrokFamily[] {
  return (Object.keys(FAMILIES) as KrokFamily[]).filter((f) => FAMILIES[f].bild);
}

/** Skissläge: sidan finns inte eller visar en platshållare, så ingen "före". */
export function proposalMode(family: string | null): "before_after" | "sketch" {
  return family === "parked" || family === "no-site" ? "sketch" : "before_after";
}

export interface ProposalCompany {
  name?: string | null;
  website?: string | null;
  phone_number?: string | null;
  city?: string | null;
  address?: string | null;
}

export interface ProposalRequest {
  url?: string;
  mode: "before_after" | "sketch";
  facts: { name: string; phone: string; city: string; address: string };
  subtitleNow: string;
  subtitleAfter: string;
}

/**
 * Texten under "Nu"-telefonen: samma mätvärde som mejl ett citerade, i samma
 * ord. Saknas värdet sägs bara vad bilden är — aldrig en siffra vi inte har.
 */
export function subtitleNow(family: string | null, sajt: string, findingTitle: string | null): string {
  const varde = findingTitle ? measuredValue(findingTitle) : null;
  switch (family) {
    case "slow-mobile":
      return varde
        ? `${sajt} i mobilen i dag, Googles mobilmätning ${varde} av 100`
        : `${sajt} i mobilen i dag`;
    case "poor-crux":
      return `${sajt} i mobilen i dag, upplevs som långsam enligt Googles besökardata`;
    case "not-mobile":
      return `${sajt} i telefonen i dag, i datorstorlek`;
    default:
      return `${sajt} i mobilen i dag`;
  }
}

export function subtitleAfter(family: string | null, hasSite: boolean): string {
  if (!hasSite || family === "parked" || family === "no-site") {
    return "En förstasida med vad ni gör, var, och hur man når er";
  }
  if (family === "not-mobile") return "Samma innehåll, anpassat för telefonen";
  return "Er logga, era foton och era texter på en snabb sida byggd för telefonen";
}

/** Begäran till renderaren, byggd enbart på det CRM:et vet om företaget. */
export function proposalRequestFor(
  family: string | null,
  company: ProposalCompany | null,
  findingTitle: string | null,
): ProposalRequest {
  const mode = proposalMode(family);
  const website = (company?.website ?? "").trim();
  const host = websiteHost(website);
  const name = shortCompanyName(company?.name) || (company?.name ?? "").trim();
  const facts = {
    name,
    phone: (company?.phone_number ?? "").trim(),
    city: (company?.city ?? "").trim(),
    address: (company?.address ?? "").trim(),
  };
  const url = website && !/^https?:\/\//i.test(website) ? `https://${website}` : website;
  return {
    ...(mode === "before_after" && url ? { url } : {}),
    mode: mode === "before_after" && !url ? "sketch" : mode,
    facts,
    subtitleNow: subtitleNow(family, host || name, findingTitle),
    subtitleAfter: subtitleAfter(family, Boolean(url) && mode === "before_after"),
  };
}

/** Sökvägen i bucketen. Tidsstämpeln gör en omkörning till en ny fil. */
export function assetPath(enrollmentId: number, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15);
  return `forslag/${enrollmentId}-${stamp}.jpg`;
}

export function assetPublicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${ASSET_BUCKET}/${path}`;
}

/** Basadressen till renderaren: RENDER_SERVICE_URL får peka på /render. */
export function proposalEndpoint(renderServiceUrl: string): string {
  return `${renderServiceUrl.trim().replace(/\/$/, "").replace(/\/render$/, "")}/proposal`;
}

/**
 * Vem tar leveransen? Byggd bild ⇒ klart. Tre misslyckanden ⇒ människa
 * (uppgiften från motorn ligger kvar). Annars agenten.
 */
export function assetOwner(enrollment: { asset_url?: string | null; asset_attempts?: number | null }): "done" | "human" | "agent" {
  if ((enrollment.asset_url ?? "").trim()) return "done";
  if ((enrollment.asset_attempts ?? 0) >= MAX_BUILD_ATTEMPTS) return "human";
  return "agent";
}

/** Texten som stänger produktionsuppgiften när agenten byggt bilden. */
export function taskDoneNote(url: string, facts: { logo?: boolean; photos?: number; services?: string[] }): string {
  const parts = [
    facts.logo ? "deras logga" : "utan logga (hittades inte på sidan)",
    `${facts.photos ?? 0} foton`,
    `${facts.services?.length ?? 0} tjänster från sidan`,
  ];
  return `Byggd av förslagsagenten: ${url} (${parts.join(", ")}).`;
}
