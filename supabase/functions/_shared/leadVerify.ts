// Verifiering av leadets uppgifter före första mejlet.
//
// Bakgrund 2026-09-28, första skarpa timmen: två av fyra utskick var fel.
//  - Bodals VVS fick mejl till "E-postbodalsvvs@gmail.com" (skrapans etikett
//    "E-post" klistrad på adressen) med ämnet "Bodals VVS AB | Rörmokare
//    Östersund utan hemsida?" (Google Maps-titeln som bolagsnamn).
//  - Norderåsens VVS fick "utan hemsida?" fast de har bad-varme.se. En enkel
//    Google-sökning på bolagsnamnet hade hittat den.
// Samma dag hade NHB Elektriska (nhbel.se) och Elservice Brånan
// (elservice-branan.se) fått samma felaktiga påstående: sajten låg på
// mejladressens egen domän.
//
// Regeln: frånvaro av signal är inte frånvaro av saken. Ett påstående om att
// något SAKNAS får bara gå ut när vi aktivt letat och inte hittat det, på
// fyra sätt: fältet i CRM:et, mejldomänens egen sajt, en Google-sökning och
// Jevs bedömning av sökträffarna (jevJudge.ts, sedan 2026-09-28).
// Kan sökningen inte göras stoppas mejlet, det skickas inte "för säkerhets
// skull". Ren logik här; nätverk i process_sequences.

import { confidentNo, confidentYes, type WebsiteJudgement } from "./jevJudge.ts";

/** Etiketter som skrapor klistrar ihop med adressen: "E-postbodalsvvs@…". */
const LABEL_PREFIX = /^(?:e-?post|epost|e-?mail|email|mail|mejl|maila)[:\s.]*(?=[a-z0-9])/i;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

export interface CleanEmail {
  email: string;
  changed: boolean;
}

/**
 * Städar en adress: mellanslag, avslutande punkter och etikettprefix.
 * Prefixet tas bara bort när adressen bara är giltig UTAN det, så att en
 * riktig adress som "mailservice@firma.se" aldrig ändras. null = ogiltig.
 */
export function cleanEmailAddress(raw: string | null | undefined): CleanEmail | null {
  const original = (raw ?? "").trim();
  let email = original.replace(/^mailto:/i, "").replace(/[.,;:]+$/, "").trim();
  if (!email) return null;
  const local = email.split("@")[0] ?? "";
  const stripped = email.replace(LABEL_PREFIX, "");
  // "E-postbodalsvvs@gmail.com": prefixet är versalt eller följt av en gemen
  // utan skiljetecken. Vi kräver att originalet börjar med stor bokstav eller
  // bindestreck-varianten, så "mailservice@" och "emailen@" lämnas i fred.
  if (stripped !== email && /^(?:E|M)/.test(local) && /^[A-Z]/.test(local) && local.length > stripped.split("@")[0].length) {
    email = stripped;
  }
  email = email.toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  return { email, changed: email !== original.toLowerCase() };
}

/**
 * Bolagsnamnet som det ska stå i ett mejl: Google Maps-titlar som "Bodals
 * VVS AB | Rörmokare Östersund & Brunflo" kapas vid skiljetecknet.
 */
export function cleanCompanyName(name: string | null | undefined): string {
  const raw = (name ?? "").replace(/\s+/g, " ").trim();
  const cut = raw.split(/\s+[|•·]\s+|\s+[–—-]\s+(?=[A-ZÅÄÖ][a-zåäö]+\s)/)[0]?.trim() ?? raw;
  return cut || raw;
}

const FREE_MAILBOX = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.se", "outlook.com", "live.se", "live.com",
  "msn.com", "telia.com", "telia.se", "icloud.com", "me.com", "mac.com", "yahoo.com", "yahoo.se",
  "spray.se", "comhem.se", "bredband.net", "bahnhof.se", "tele2.se", "protonmail.com", "pm.me",
]);

/** Kataloger och plattformar: en träff där är ingen egen hemsida. */
const DIRECTORY_HOSTS = [
  "allabolag.se", "bolagsfakta.se", "ratsit.se", "merinfo.se", "hitta.se", "eniro.se", "proff.se",
  "boolag.se", "kreditrapporten.se", "upplysning.se", "largestcompanies.com", "bolagsverket.se",
  "facebook.com", "instagram.com", "linkedin.com", "youtube.com", "tiktok.com", "x.com", "twitter.com",
  "google.com", "maps.google.com", "reco.se", "offerta.se", "servicefinder.se", "byggahus.se",
  "mittanbud.se", "blocket.se", "yelp.com", "tripadvisor.se", "tripadvisor.com", "gulasidorna.se",
  "foretagsfakta.se", "infobel.com", "cylex.se", "118100.se", "birthday.se", "vainu.io",
  "uc.se", "solidinfo.se", "bokadirekt.se", "wikipedia.org", "jobbsafari.se", "arbetsformedlingen.se",
  // Leverantörers återförsäljar- och partnerlistor, byggportaler.
  "nibe.eu", "svedbergs.se", "sakervatten.se", "byggbasen.com", "badplatsen.se", "mimoji.com",
  "krafman.se", "gustavsberg.se", "thermia.se", "ctc.se", "elinstallatoren.se", "certifierad.nu",
  "hantverkare.se", "byggfakta.se", "bygg.se", "123.se", "foretagsinfo.se", "allbiz.se",
  // Googles gamla gratissajter stängdes 2024 och pekar bara till Maps.
  "business.site",
  "brabyggfirmor.se", "byggfirmor.se", "hittahantverkare.se", "jamforoffert.se", "offertta.se",
];

export function hostOf(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim().toLowerCase();
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//, "").split(/[/?#:]/)[0]?.replace(/^www\./, "") ?? "";
  return host.includes(".") ? host : null;
}

export function isDirectoryHost(host: string | null): boolean {
  if (!host) return false;
  return DIRECTORY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Mejldomänen om den är bolagets egen (inte gmail, inte en katalog). */
export function ownEmailDomain(email: string | null | undefined): string | null {
  const domain = hostOf((email ?? "").split("@")[1] ?? "");
  if (!domain || FREE_MAILBOX.has(domain) || isDirectoryHost(domain)) return null;
  return domain;
}

/** Ord i bolagsnamnet som säger något: "Norderåsens", "Bodals", inte "AB". */
// Branschord står i hundratals bolagsnamn och säger inget om VILKET bolag:
// "redovisning" i både AWR Redovisning och Lindsten & Rundqvist Redovisning.
const STOP = new Set([
  "ab", "hb", "kb", "och", "i", "&", "the", "aktiebolag", "handelsbolag", "sverige",
  "ostersund", "jamtland", "jamtlands", "norr", "service", "entreprenad", "vvs", "bygg", "byggservice",
  "redovisning", "revision", "konsult", "consulting", "stad", "stadservice", "ror", "rormokare",
  "elservice", "elinstallation", "eltjanst", "maleri", "fastigheter", "fastighet", "rehab",
  "kiropraktik", "fysioterapi", "tak", "golv", "kakel", "montage", "teknik", "mekaniska",
]);

function fold(text: string): string {
  return text.toLowerCase().replace(/å|ä/g, "a").replace(/ö/g, "o").replace(/é/g, "e");
}

export function nameTokens(name: string): string[] {
  return fold(cleanCompanyName(name))
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

export interface SearchHit {
  link: string;
  title?: string;
  snippet?: string;
}

/**
 * Webbadresser som en text UTTRYCKLIGEN anger som hemsida: med www., med
 * http(s):// eller efter en etikett ("Hemsida:", "Webbplats", "Website").
 * En naken domän i löptext är oftast katalogens egen ("… på
 * brabyggfirmor.se") och räknas inte. Mejladresser räknas aldrig.
 */
export function domainsInText(text: string | null | undefined): string[] {
  const out: string[] = [];
  const tld = "(?:se|nu|com|net|org|eu|info|biz|io)";
  const patterns = [
    new RegExp(`(?:^|[^@\\w.-])(?:https?:\\/\\/|www\\.)((?:[a-z0-9-]+\\.)+${tld})\\b`, "gi"),
    new RegExp(`(?:hemsida|webbplats|webbsida|website|webb|url)\\s*[:\\-–]?\\s*(?:https?:\\/\\/)?(?:www\\.)?((?:[a-z0-9-]+\\.)+${tld})\\b`, "gi"),
  ];
  for (const re of patterns) {
    for (const m of (text ?? "").matchAll(re)) {
      const host = m[1].toLowerCase().replace(/^www\./, "");
      if (!isDirectoryHost(host) && !out.includes(host)) out.push(host);
    }
  }
  return out;
}

/**
 * Letar en egen hemsida i sökträffarna. Två vägar:
 *  1. En träff som inte är en katalog och vars domän, titel eller utdrag bär
 *     ett av bolagets namnord.
 *  2. En webbadress som NÄMNS i ett utdrag om bolaget, oftast en katalog:
 *     "Norderåsens VVS … Website: www.bad-varme.se". Kedjesajter som
 *     Bad & Värme hittas bara så; sökningen på namnet ger dem aldrig själva.
 * Hellre en träff för mycket (mejlet stoppas, en människa tittar) än ett
 * felaktigt "ni saknar hemsida".
 */
export function websiteFromSearch(name: string, hits: SearchHit[], emailDomain?: string | null): string | null {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return null;
  const aboutUs = (hit: SearchHit) => tokens.some((t) => fold(`${hit.title ?? ""} ${hit.snippet ?? ""} ${hit.link}`).includes(t));
  for (const hit of hits) {
    const host = hostOf(hit.link);
    if (!host || isDirectoryHost(host)) continue;
    // Namnet i domänen (nhbel.se, bodalsvvs.se): bolagets egen sajt.
    if (tokens.some((t) => fold(host).replace(/-/g, "").includes(t))) return `https://${host}/`;
    // Namnet bara i titeln: räknas när länken är en startsida, inte en
    // listningssida. Kataloger vi aldrig hört talas om (alltombolag.se,
    // brabyggfirmor.se) har bolaget på en undersida med orgnr eller /foretag/.
    if (!looksLikeListing(hit.link) && tokens.some((t) => fold(`${hit.title ?? ""}`).includes(t))) {
      return `https://${host}/`;
    }
  }
  for (const hit of hits) {
    if (!aboutUs(hit)) continue;
    // Mejldomänen räknas inte här: den har redan prövats direkt (probeDomain),
    // och "info@norderasensvvs.se" i ett utdrag är ingen hemsida.
    const mentioned = domainsInText(`${hit.title ?? ""} ${hit.snippet ?? ""}`).find((d) => d !== emailDomain);
    if (mentioned) return `https://${mentioned}/`;
  }
  return null;
}

/** En listnings- eller profilsida hos någon annan, inte en egen startsida. */
export function looksLikeListing(url: string): boolean {
  let path = "";
  try {
    path = decodeURIComponent(new URL(url).pathname).toLowerCase();
  } catch {
    return true;
  }
  if (path === "/" || path === "") return false;
  if (/\d{6}-?\d{4}|\d{5,}/.test(path)) return true; // orgnr, id
  if (/\/(?:foretag|företag|bolag|company|companies|firma|listing|partner|profil|profile|hitta|sok|search|verksamhet|befattningshavare|installator|aterforsaljare|ort|kartor)\b/.test(path)) return true;
  return path.split("/").filter(Boolean).length > 1;
}

/** Familjer vars mejl påstår att något saknas och därför kräver sökning. */
export const ABSENCE_FAMILIES = new Set(["no-site", "parked"]);

export interface VerifyInput {
  family: string | null;
  companyName: string;
  companyWebsite: string | null;
  email: string | null;
  /** Mejldomänens sajt svarar 200 och är inte parkerad. null = okänt. */
  emailDomainLive: boolean | null;
  /** null = sökningen kunde inte göras. */
  searchHits: SearchHit[] | null;
  /** Titeln på mejldomänens startsida, när den svarar. */
  emailDomainTitle?: string | null;
  /** Jevs dom över sökträffarna. null = inte frågad eller svarade inte. */
  jev?: WebsiteJudgement | null;
  /**
   * Google-profiler från platssökningen (Serper places): namn och
   * webbplatsfält. null = platssökningen gick inte att göra.
   */
  places?: PlaceHit[] | null;
}

export interface PlaceHit {
  title: string;
  website?: string | null;
  address?: string | null;
}

/**
 * Google-profilens webbplatsfält är den starkaste källan: det är vad bolaget
 * själv angett. "Bad & Värme Norderåsens VVS" har bad-varme.se där, fast
 * ingen vanlig sökträff visar det. Profiler vars namn inte bär bolagets
 * namnord räknas inte (grannar i samma sökning).
 */
export function websiteFromPlaces(name: string, places: PlaceHit[]): string | null {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return null;
  for (const place of places) {
    if (!tokens.some((t) => fold(place.title).includes(t))) continue;
    const host = hostOf(place.website);
    if (host && !isDirectoryHost(host)) return `https://${host}/`;
  }
  return null;
}

/**
 * Mejladressen ligger på ett annat bolags domän: AWR Redovisning med
 * adress på lrredovisning.se (Lindsten & Rundqvist). Domänen och sajtens
 * titel bär inget av bolagets egna namnord.
 */
export function emailBelongsToOther(name: string, domain: string, title: string | null | undefined): boolean {
  if (!title) return false;
  const tokens = nameTokens(name);
  if (tokens.length === 0) return false;
  const hay = fold(`${domain} ${title}`);
  return !tokens.some((t) => hay.includes(t));
}

export type VerifyResult =
  | { ok: true; email: string; emailChanged: boolean; name: string }
  | { ok: false; reason: string; foundWebsite?: string; email?: string };

export function verifyLead(input: VerifyInput): VerifyResult {
  const cleaned = cleanEmailAddress(input.email);
  if (!cleaned) return { ok: false, reason: `ogiltig mejladress: "${input.email ?? ""}"` };
  const name = cleanCompanyName(input.companyName);
  const ownDomain = ownEmailDomain(cleaned.email);
  if (ownDomain && input.emailDomainLive === true && emailBelongsToOther(input.companyName, ownDomain, input.emailDomainTitle)) {
    // Regeln ser inget namnord i domänen. Jev får släppa igenom när den är
    // säker på att adressen ändå är bolagets (O-Mek = Ovikens Mekaniska).
    if (!confidentYes(input.jev?.emailBelongs ?? null)) {
      return { ok: false, reason: `mejladressen ligger på ${ownDomain}, som verkar tillhöra ett annat bolag ("${(input.emailDomainTitle ?? "").slice(0, 60)}")`, email: cleaned.email };
    }
  }
  if (input.family && ABSENCE_FAMILIES.has(input.family)) {
    const site = hostOf(input.companyWebsite);
    if (site && !isDirectoryHost(site)) {
      return { ok: false, reason: `CRM:et har en hemsida (${site}) men mejlet säger att den saknas`, foundWebsite: `https://${site}/`, email: cleaned.email };
    }
    const domain = ownEmailDomain(cleaned.email);
    if (domain && input.emailDomainLive === true) {
      return { ok: false, reason: `mejldomänen ${domain} har en egen sajt`, foundWebsite: `https://${domain}/`, email: cleaned.email };
    }
    if (input.places === null) {
      return { ok: false, reason: "platssökningen på Google kunde inte göras, påståendet om att hemsida saknas är overifierat", email: cleaned.email };
    }
    const fromProfile = websiteFromPlaces(input.companyName, input.places ?? []);
    if (fromProfile) {
      return { ok: false, reason: `Google-profilen anger ${hostOf(fromProfile)} som hemsida`, foundWebsite: fromProfile, email: cleaned.email };
    }
    if (input.searchHits === null) {
      return { ok: false, reason: "Google-sökningen kunde inte göras, påståendet om att hemsida saknas är overifierat", email: cleaned.email };
    }
    const found = websiteFromSearch(input.companyName, input.searchHits, domain);
    const jev = input.jev ?? null;
    // Jev krävs för ett frånvaropåstående: reglerna ensamma har missat en
    // kedjesida och tagit kataloger för hemsidor. Jev får fälla reglernas
    // fynd bara när den är säker på att ingen egen hemsida finns.
    if (!jev || !jev.hasSite) {
      return { ok: false, reason: "Jev kunde inte bedöma sökträffarna, påståendet om att hemsida saknas är overifierat", foundWebsite: found ?? undefined, email: cleaned.email };
    }
    if (confidentYes(jev.hasSite) || (found && !confidentNo(jev.hasSite))) {
      const site = jev.best && jev.best.p >= 0.5 ? `https://${hostOf(jev.best.url)}/` : found;
      return { ok: false, reason: `sökningen tyder på en egen hemsida${site ? ` (${hostOf(site)})` : ""}, Jev ${Math.round(jev.hasSite.p * 100)} %`, foundWebsite: site ?? undefined, email: cleaned.email };
    }
    if (!confidentNo(jev.hasSite)) {
      return { ok: false, reason: `Jev är osäker på om bolaget har en hemsida (${Math.round(jev.hasSite.p * 100)} %)`, email: cleaned.email };
    }
  }
  return { ok: true, email: cleaned.email, emailChanged: cleaned.changed, name };
}

/** Parkerad eller tom sida: räknas inte som egen hemsida. */
export function looksParked(html: string): boolean {
  return /parked at loopia|domain (?:is )?for sale|this domain is parked|domänen är parkerad|köp denna domän|coming soon|under construction|default web page|index of \//i.test(html);
}
