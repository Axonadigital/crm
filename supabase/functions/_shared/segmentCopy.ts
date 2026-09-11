/**
 * Branschspecifika textbitar till "bra hemsida"-sekvensen.
 *
 * Företag över 50 poäng behöver ingen ny hemsida. Det som gör ett mejl till
 * dem värt att svara på är att det pekar på ett återkommande handjobb som
 * just deras bransch känner igen. Utan den konkretionen blir mejlet
 * "vi hjälper företag att effektivisera" — en broschyr, inte en fråga.
 *
 * Allt är formulerat som FRÅGOR om hur de gör i dag, aldrig som påståenden
 * om att de har ett problem. Vi vet inte det, och ett felaktigt påstående om
 * någons verksamhet är värre än inget mejl alls. Av samma skäl finns här
 * inga resultatsiffror: ROI-påståenden mäter -17 % svarsfrekvens i
 * Gong/30MPC-materialet och kräver bevis vi inte har.
 *
 * Fragmenten ligger här och inte i mallarna eftersom åtta mallar med varsin
 * kopia hade varit åtta ställen att hålla i synk.
 */
import type { IndustrySegment } from "./industrySegment.ts";

export interface SegmentCopy {
  /** Ämnesradens första ord: "Tidrapporterna hos Storsjö Tak AB". */
  subject: string;
  /** Frågan i mejl ett. Ska kunna följa efter "Det jag undrar är något annat: ". */
  pain: string;
  /** En ANNAN vinkel i uppföljningen — att upprepa sig avslöjar mallen. */
  painFollowup: string;
}

const COPY: Partial<Record<IndustrySegment, SegmentCopy>> = {
  bygg: {
    subject: "Tidrapporterna",
    pain: "hur samlar ni in tidrapporter och underlag till faktureringen i dag?",
    painFollowup:
      "hur håller ni ordning på ÄTA och ändringar som dyker upp mitt i ett projekt?",
  },
  vvs_el: {
    subject: "Arbetsordrarna",
    pain:
      "hur får montörerna sina arbetsordrar, och hur kommer materialåtgången tillbaka till kontoret?",
    painFollowup:
      "hur lång tid tar det att få ihop ett ROT-underlag när jobbet är klart?",
  },
  maleri_golv: {
    subject: "Offerterna",
    pain:
      "hur räknar ni fram en offert i dag — sitter någon och mäter och prissätter för hand?",
    painFollowup:
      "hur håller ni reda på vilka jobb som är offererade, påbörjade och fakturerade?",
  },
  transport: {
    subject: "Körordrarna",
    pain:
      "hur går körordrarna ut till chaufförerna, och hur kommer fraktsedlarna tillbaka?",
    painFollowup: "hur lång tid tar det att pussla ihop schemat en vanlig vecka?",
  },
  fastighet: {
    subject: "Objektsschemat",
    pain:
      "hur fördelar ni scheman mellan objekten, och hur rapporteras avvikelser tillbaka?",
    painFollowup:
      "hur visar ni för en kund vad som faktiskt blivit utfört på deras objekt?",
  },
  tandvard: {
    subject: "Återkallelserna",
    pain:
      "hur sköter ni återkallelser och påminnelser i dag — sitter någon och ringer?",
    painFollowup: "hur fyller ni luckan när någon avbokar sent på dagen?",
  },
  salong: {
    subject: "Avbokningarna",
    pain: "hur hanterar ni sena avbokningar och luckor i boken?",
    painFollowup: "hur påminner ni kunder om att det är dags att boka igen?",
  },
  restaurang: {
    subject: "Schemat",
    pain: "hur lägger ni schemat och håller koll på beställningarna i dag?",
    painFollowup:
      "hur lång tid tar det att få ihop underlaget till lönerna varje månad?",
  },
};

/**
 * Copy för ett segment, eller null. "ovrigt" har medvetet ingen copy —
 * vet vi inte branschen har vi inget konkret att fråga om, och då ska
 * företaget inte få mejlet alls.
 */
export function segmentCopy(
  segment: string | null | undefined,
): SegmentCopy | null {
  if (!segment) return null;
  return COPY[segment as IndustrySegment] ?? null;
}

/** Segment som har copy — de enda som "bra hemsida"-sekvensen får mejla. */
export function segmentsWithCopy(): IndustrySegment[] {
  return Object.keys(COPY) as IndustrySegment[];
}

/**
 * Mallkroppen som ligger i email_templates ("Scanner: bra hemsida — interna
 * system"). Speglad hit BARA för att kunna testa ordantalet mot varje
 * segments fråga — mallen redigeras i CRM:et och är sanningskällan.
 *
 * Ordantalet är inte kosmetik: Gong/30MPC (85 miljoner kalla mejl) mäter att
 * svarsfrekvensen toppar vid 51-100 ord. Första utkastet landade på 104-111
 * med de längre branschfrågorna inlagda.
 */
export const SYSTEMS_TEMPLATE_BODY = `{{greeting}}

Jag körde hemsidan för {{company_name}} genom vårt test. Den fick {{scan_score}} av 100, så det är inte den jag hör av mig om.

Det jag undrar är något annat: {{segment_pain}}

Vi bygger interna system åt mindre företag — sådant som annars sköts för hand i en pärm eller ett kalkylark. Vill du att jag skissar på hur det kan se ut hos er? Det kostar inget.

Säg bara till om du inte vill höra mer.`;
