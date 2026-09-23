// Bolagsnamnet som det ska stå i löpande text.
//
// Registrerade firmanamn är skrivna för Bolagsverket, inte för en mening.
// "En sak på hemsidan för Aussie Bygg och Entreprenad i Jämtland AB" avslöjar
// mejlet som maskinellt redan i ämnesraden. Ett mejl från en människa hade
// skrivit "Aussie Bygg".
//
// Reglerna är avsiktligt försiktiga: vi kortar bara där det är uppenbart —
// bolagsform, ortsangivelse, och en sammansättning som gör namnet ohanterligt
// långt. Blir resultatet för kort eller tomt behålls originalet.

/** Bolagsformer som aldrig behöver stå i en mening. */
const LEGAL_SUFFIX =
  /\s*(\(publ\))?\s*\b(aktiebolag|handelsbolag|kommanditbolag|ekonomisk förening|ideell förening|ab|hb|kb|ek\.? för\.?)\b\.?\s*$/i;
const LEADING_AB = /^ab\s+/i;
/** " i Jämtland", " i Östersund" — ortsangivelsen bär ingen mening i mejlet. */
const LOCATION_TAIL = /\s+i\s+[A-ZÅÄÖ][\wåäöéè-]+(\s+[A-ZÅÄÖ][\wåäöéè-]+)?\s*$/;

/** Över den här längden känns namnet som en registerpost, inte ett tilltal. */
const MAX_LENGTH = 24;
/** Sammansättningar vi får klippa vid när namnet är för långt. */
const JOINERS = [" och ", " & ", " - ", " – "];

const MIN_LENGTH = 3;

export function shortCompanyName(raw: unknown): string {
  const original = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!original) return "";

  let name = original;

  // Bolagsformen kan stå både sist ("… AB") och först ("AB Östersunds …").
  let previous = "";
  while (previous !== name) {
    previous = name;
    name = name.replace(LEGAL_SUFFIX, "").trim();
  }
  name = name.replace(LEADING_AB, "").trim();

  const withoutLocation = name.replace(LOCATION_TAIL, "").trim();
  if (withoutLocation.length >= MIN_LENGTH) name = withoutLocation;

  // Fortfarande för långt? Klipp vid första sammansättningen som lämnar
  // något meningsfullt kvar.
  if (name.length > MAX_LENGTH) {
    // Den som kommer FÖRST i namnet, inte den som råkar stå först i listan —
    // "LBM - Larssons Bygg & Mätservice" ska bli "LBM", inte "LBM - Larssons
    // Bygg".
    const lower = name.toLocaleLowerCase("sv-SE");
    const cut = JOINERS.map((joiner) => lower.indexOf(joiner))
      .filter((index) => index >= MIN_LENGTH)
      .sort((a, b) => a - b)[0];
    if (cut !== undefined) name = name.slice(0, cut).trim();
  }

  // Blev det obrukbart är originalet bättre än ett stympat namn.
  return name.length >= MIN_LENGTH ? name : original;
}
