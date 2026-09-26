// Hälsningsfrasen i kalla mejl.
//
// Bakgrund: hälsningen byggdes av mejladressens lokaldel med en kort lista
// över opersonliga brevlådor som enda spärr. Utkasten 2026-09-23 gav
// "Hej aussiebygg!" (företagsnamnet som adress), "Hej tjena!" (ett
// hälsningsord som adress) och "Hej tomas.larsson!" (punkten obehandlad).
//
// Regeln är nu: använd ett namn BARA när lokaldelen rimligen ÄR ett förnamn.
// I alla andra fall hälsar vi utan namn. Ett opersonligt "Hej!" är alltid
// oskyldigt; ett felaktigt namn avslöjar mejlet som maskinellt i första ordet.

/** Brevlådor som aldrig är personer. */
const GENERIC_MAILBOXES = new Set([
  "info", "kontakt", "kontakta", "hej", "hejsan", "tjena", "halla", "hallo",
  "post", "mail", "email", "office", "hello", "admin", "kundtjanst",
  "kundservice", "support", "bokning", "boka", "order", "sales", "faktura",
  "fakturor", "ekonomi", "redovisning", "styrelse", "reception", "jobb",
  "work", "press", "media", "webb", "web", "noreply", "no-reply", "ingen",
  "svar", "kund", "kunder", "foretag", "firma", "butik", "shop", "verkstad",
  "service", "teknik", "salong", "klinik", "mottagning", "tid", "tider",
]);

/** Tecken som skiljer namndelar åt i en mejladress. */
const SEPARATORS = /[._\-+]/;

// Mejladresser saknar å, ä och ö. "par@" är Pär, inte Par, och ett fel
// stavat förnamn i första ordet avslöjar mejlet som maskinellt. Listan är
// de vanliga svenska förnamnen där ASCII-formen är entydig; för alla andra
// behålls stavningen som den är.
const DIACRITIC_NAMES: Record<string, string> = {
  par: "Pär", bjorn: "Björn", goran: "Göran", hakan: "Håkan", orjan: "Örjan",
  jorgen: "Jörgen", soren: "Sören", marten: "Mårten", asa: "Åsa", ake: "Åke",
  borje: "Börje", gosta: "Gösta", torbjorn: "Torbjörn", jorn: "Jörn",
  ingegard: "Ingegärd", mans: "Måns", helene: "Heléne", andre: "André",
  rene: "René", jose: "José",
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("sv-SE") + value.slice(1);
}

/**
 * Förnamnet att hälsa med, eller null när lokaldelen inte är ett personnamn.
 *
 * `companyName` används för att fånga adresser som bara upprepar företaget —
 * aussiebygg@outlook.com hos "Aussie Bygg och Entreprenad i Jämtland AB".
 */
export function personalFirstName(
  emailOrLocalPart: string,
  companyName?: string | null,
): string | null {
  const raw = (emailOrLocalPart ?? "").split("@")[0]?.trim() ?? "";
  if (!raw) return null;

  // "tomas.larsson" → "tomas". Efternamnet används inte i hälsningen.
  const first = raw.split(SEPARATORS)[0]?.trim() ?? "";
  if (!first) return null;

  const key = normalize(first);
  if (key.length < 2 || key.length > 16) return null;
  // Siffror hör inte hemma i ett förnamn.
  if (/\d/.test(first)) return null;
  // Utan vokal är det en förkortning, inte ett namn ("lbm", "hr", "pr").
  if (!/[aeiouyåäö]/i.test(first)) return null;
  if (GENERIC_MAILBOXES.has(key)) return null;

  // Adressen upprepar företagsnamnet. Gäller både "aussiebygg" i "Aussie
  // Bygg …" och omvänt, så korta firmanamn inte slinker igenom.
  const company = normalize(companyName ?? "");
  if (company && key.length >= 3) {
    if (company.includes(key) || key.includes(company)) return null;
  }

  // Lokaldelen är domänen — metropolen@metropolen.net. Adressen säger
  // företaget en gång till, inte vem som läser.
  const domain = (emailOrLocalPart ?? "").split("@")[1] ?? "";
  const domainRoot = normalize(domain.split(".")[0] ?? "");
  if (domainRoot && key.length >= 3 && domainRoot.includes(key)) return null;

  const lower = first.toLocaleLowerCase("sv-SE");
  return DIACRITIC_NAMES[lower] ?? capitalize(lower);
}

/**
 * Hela hälsningen. Utan ett säkert förnamn blir det "Hej!" — aldrig ett
 * gissat namn.
 */
export function greetingFor(
  emailOrLocalPart: string,
  companyName?: string | null,
): string {
  const name = personalFirstName(emailOrLocalPart, companyName);
  return name ? `Hej ${name}!` : "Hej!";
}
