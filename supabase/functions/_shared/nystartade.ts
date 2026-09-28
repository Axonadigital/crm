// Nystartade bolag i Jämtlands län ur SCB:s företagsregister.
//
// Källa: Bolagsverkets publicering av SCB:s bulkfil (värdefulla
// datamängder, gratis, ingen nyckel), vardefulla-datamangder.bolagsverket.se/
// scb/scb_bulkfil.zip. Tabbseparerad, latin1, uppdateras veckovis. Ett
// GitHub-jobb (.github/workflows/nystartade.yml) laddar ner filen, sållar på
// postnummer och registreringsdatum och postar raderna hit; tolkningen och
// reglerna ligger här så att de kan testas.
//
// Bakgrund 2026-09-28: Rasmus vill nå bolag direkt när de startar. ÖP listar
// dem varannan vecka; vi vill ha samma lista maskinellt. Augusti 2026 gav
// 119 nya poster i länet: 29 AB, 2 HB, 80 enskilda firmor, resten föreningar.
//
// Juridiken (19 § marknadsföringslagen): e-postreklam till fysiska personer
// kräver förhandssamtycke, och enskilda näringsidkare räknas dit. Enskilda
// firmor lagras därför UTAN personnummer (org_number tom), vilket gör att
// grinden (outreach_company_form) aldrig släpper ett mejl till dem, och de
// går till ringlistan när ett telefonnummer dykt upp.

export const SCB_COLUMNS = [
  "ForAndrTyp", "COAdress", "Foretagsnamn", "FtgStat", "Gatuadress", "JEStat", "JurForm", "Namn",
  "Ng1", "Ng2", "Ng3", "Ng4", "Ng5", "PeOrgNr", "PostNr", "PostOrt", "RegDatKtid", "Reklamsparrtyp",
] as const;

/** Juridiska former vi tar in: aktiebolag, handelsbolag/kommanditbolag, enskild firma. */
export const JURFORM: Record<string, "ab" | "hb" | "enskild"> = { "49": "ab", "31": "hb", "10": "enskild" };

/**
 * Jämtlands län på postnummer: 830 00–846 99, utom 841 xx (Ånge och
 * Fränsta i Västernorrland, som kom med i provet 2026-09-28). Ytterhogdal
 * (Härjedalen) har 842 xx och ingår därmed.
 */
export function isJamtlandPostcode(postnr: string | null | undefined): boolean {
  const digits = (postnr ?? "").replace(/\D/g, "");
  if (digits.length !== 5) return false;
  const area = Number(digits.slice(0, 3));
  return area >= 830 && area <= 846 && area !== 841;
}

const SMALL = new Set(["och", "i", "på", "av", "för", "med", "&"]);

/** "ÖSTERSUND" → "Östersund", "RÖDÖN" → "Rödön", "ÅRE" → "Åre". */
export function titleCase(text: string): string {
  return text
    .toLocaleLowerCase("sv-SE")
    .split(/(\s+|-)/)
    .map((part, i) => (i > 0 && SMALL.has(part) ? part : part.charAt(0).toLocaleUpperCase("sv-SE") + part.slice(1)))
    .join("");
}

/** "Backlund, Tony" → "Tony Backlund". */
export function personName(namn: string): string {
  const [last, first] = namn.split(",").map((s) => s.trim());
  if (!first) return titleCase(namn.trim());
  return titleCase(`${first} ${last}`);
}

export interface NewCompany {
  name: string;
  /** Tio siffror med bindestreck för AB/HB; null för enskild firma. */
  org_number: string | null;
  form: "ab" | "hb" | "enskild";
  address: string | null;
  zipcode: string;
  city: string;
  sni_code: string | null;
  reg_date: string; // YYYY-MM-DD
  /** Stabil nyckel för dubblettkontroll utan personnummer. */
  dedupe_key: string;
}

export type ParseResult = { ok: true; company: NewCompany } | { ok: false; reason: string };

/** En rad ur bulkfilen (tabbseparerad, redan omkodad till UTF-8). */
export function parseScbLine(line: string, since: string): ParseResult {
  const f = line.split("\t");
  if (f.length < SCB_COLUMNS.length) return { ok: false, reason: "för få fält" };
  const get = (col: (typeof SCB_COLUMNS)[number]) => (f[SCB_COLUMNS.indexOf(col)] ?? "").trim();

  const form = JURFORM[get("JurForm")];
  if (!form) return { ok: false, reason: `juridisk form ${get("JurForm")} tas inte in` };
  if (get("Reklamsparrtyp") === "2") return { ok: false, reason: "reklamspärr" };
  const postnr = get("PostNr");
  if (!isJamtlandPostcode(postnr)) return { ok: false, reason: "utanför Jämtlands län" };
  const reg = get("RegDatKtid");
  if (!/^\d{8}$/.test(reg)) return { ok: false, reason: "saknar registreringsdatum" };
  const regDate = `${reg.slice(0, 4)}-${reg.slice(4, 6)}-${reg.slice(6, 8)}`;
  if (regDate < since) return { ok: false, reason: "för gammal" };

  const peorg = get("PeOrgNr").replace(/\D/g, "");
  const zipcode = `${postnr.slice(0, 3)} ${postnr.slice(3)}`;
  const city = titleCase(get("PostOrt"));
  const address = get("Gatuadress") ? titleCase(get("Gatuadress")).replace(/\bLgh\b/g, "lgh") : null;
  const sni = get("Ng1") || null;

  if (form === "enskild") {
    // Personnummer lagras inte. Firmanamnet om det finns, annars personens namn.
    const name = get("Foretagsnamn") ? titleCase(get("Foretagsnamn")) : personName(get("Namn"));
    if (!name) return { ok: false, reason: "saknar namn" };
    return {
      ok: true,
      company: {
        name, org_number: null, form, address, zipcode, city, sni_code: sni, reg_date: regDate,
        dedupe_key: `enskild:${name.toLocaleLowerCase("sv-SE")}|${postnr}|${reg}`,
      },
    };
  }

  // Juridisk person: PeOrgNr = "16" + organisationsnummer.
  const org10 = peorg.length === 12 ? peorg.slice(2) : peorg;
  if (org10.length !== 10) return { ok: false, reason: "ogiltigt organisationsnummer" };
  const orgNumber = `${org10.slice(0, 6)}-${org10.slice(6)}`;
  const name = get("Namn") || get("Foretagsnamn");
  if (!name) return { ok: false, reason: "saknar namn" };
  return {
    ok: true,
    company: {
      name, org_number: orgNumber, form, address, zipcode, city, sni_code: sni, reg_date: regDate,
      dedupe_key: `org:${org10}`,
    },
  };
}
