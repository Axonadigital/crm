// Paketmejlet: utkastet som läggs i Rasmus Gmail när ett lead svarat på
// outreach-flödet (inte nej). Nu är kontakten varm, så mötesförslag är rätt
// (Gong: intresse-CTA i kallt läge, specifik tid när dialogen är igång).
//
// Paketen är de tre lösningarna som låstes 2026-09-24. Inga priser här —
// samma beslut som upsellCatalog och infrastruktursidan; priset tas i
// samtalet eller läggs in av Rasmus innan han trycker skicka.

import type { KrokFamily } from "./krokCopy.ts";

export type Paket = "hemsida" | "infrastruktur";

export const PAKET_FOR_FAMILY: Record<KrokFamily, Paket> = {
  "slow-mobile": "hemsida",
  "poor-crux": "hemsida",
  "not-mobile": "hemsida",
  unreachable: "hemsida",
  "no-https": "hemsida",
  noindex: "hemsida",
  parked: "hemsida",
  "no-site": "hemsida",
  "no-gbp": "infrastruktur",
};

interface PaketCopy {
  namn: string;
  url: string;
  ingar: string[];
  sagar: string;
}

export const PAKET: Record<Paket, PaketCopy> = {
  hemsida: {
    namn: "Hemsidor & webbshoppar",
    url: "https://www.axonadigital.se/tjanster/webbplatser",
    ingar: [
      "Ny startsida och undersidor byggda för telefonen först, med er logga, era bilder och era texter",
      "Kontaktvägar som fungerar: klickbart nummer, formulär som når er, Google-profilen kopplad",
      "Snabb laddning, HTTPS och sökmotorgrund (titlar, beskrivningar, strukturerad data)",
      "Driftsättning på er domän och en genomgång så ni kan ändra text och bilder själva",
    ],
    sagar: "Vi bygger utifrån förslaget ni sett. Ni godkänner varje sida innan den går live.",
  },
  infrastruktur: {
    namn: "Digital infrastruktur",
    url: "https://www.axonadigital.se/tjanster/digital-infrastruktur",
    ingar: [
      "Google Företagsprofil uppsatt och verifierad med rätt uppgifter, öppettider och bilder",
      "Domänmail som når fram (SPF, DKIM, DMARC) i stället för fri-mejl",
      "Bokning eller offertförfrågan som hamnar på rätt ställe hos er",
      "En genomgång av vad som syns om er på Google i dag och vad som ska bort",
    ],
    sagar: "Vi sätter upp, ni får inloggningarna. Inget låses in hos oss.",
  },
};

export interface PaketContext {
  greeting: string;
  namn: string;
  paket: Paket;
  /** Länk till förslaget (före/efter-bilden), eller null. */
  assetUrl: string | null;
  /** Resultatkortet från steg 3, eller null. */
  resultatkort: string | null;
  /** Namngiven referens, eller null. */
  referens: string | null;
}

export function paketSubject(krokAmne: string): string {
  return `Re: ${krokAmne}`;
}

/**
 * Brödtexten. Längre än de kalla mejlen med flit: mottagaren har bett om det.
 * Fortfarande utan siffror om DERAS framtid — bara vad som ingår, hur det
 * går till, och ett konkret nästa steg.
 */
export function paketBody(c: PaketContext): string {
  const p = PAKET[c.paket];
  const rader = p.ingar.map((r) => `– ${r}`).join("\n");
  const forslag = c.assetUrl ? `\n\nFörslaget ni sett ligger här om du vill titta igen: ${c.assetUrl}` : "";
  const referens = c.referens
    ? ` Vi byggde hemsidan åt ${c.referens} på samma sätt, se axonadigital.se/referenser.`
    : "";
  const resultat = c.resultatkort ? `\n\n${c.resultatkort}` : "";
  return (
    `${c.greeting}\n\n` +
    `Tack för svaret. Här är vad som ingår om ni vill gå vidare med ${p.namn.toLowerCase()} för ${c.namn}:\n\n` +
    `${rader}\n\n` +
    `${p.sagar}${referens}${resultat}${forslag}\n\n` +
    `Mer om hur vi jobbar: ${p.url}\n\n` +
    `Passar det med 15 minuter i telefon i veckan, så går vi igenom vad ni vill ha med och vad det skulle kosta? Föreslå en tid som passar dig, så ringer jag.`
  );
}
