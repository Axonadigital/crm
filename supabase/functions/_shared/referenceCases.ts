// Referenscase — tidigare projekt som bevis i kallt mejl.
//
// Varför de finns: 57 företag ligger i banan "interna system" utan känd
// bransch. Arbetsflödesmallen är skriven per bransch ("hur samlar ni in
// tidrapporter?") och kan inte renderas för dem, så de faller bort tyst.
//
// I stället för att gissa branschen visar vi något vi faktiskt byggt och
// låter mottagaren känna igen sig. Mejlet påstår fortfarande ingenting om
// DEM — det frågar, och lägger ett bevis bredvid frågan.
//
// Regeln för texterna: bara sådant vi kan belägga. Uppmätta siffror eller
// vad som faktiskt byggdes. Inga påhittade tidsbesparingar eller
// omsättningslyft — det vore samma fel som de felaktiga skannerpåståendena
// vi byggde bort 2026-09-23.
//
// Samtliga kunder får nämnas vid namn (besked från Rasmus 2026-09-23).

export type ReferenceCase = {
  id: string;
  /** Kunden, som den ska stå i mejlet. */
  customer: string;
  /** Meningarna som hamnar i mejlet. Skrivna för mottagaren, inte för oss. */
  line: string;
  /** Frågan som följer på beviset — kopplar caset till mottagaren. */
  question: string;
  /**
   * Banor där caset är relevant. Matchningen sker på vad skanningen faktiskt
   * observerat, aldrig på en gissad bransch.
   */
  lanes: string[];
};

export const REFERENCE_CASES: ReferenceCase[] = [
  {
    id: "zbud-administration",
    customer: "Z-Bud",
    line:
      "Z-Bud satt tidigare varje dag och matade in fraktsedlar för hand. " +
      "Vi byggde bort nästan hela den administrationen — i dag sker den i " +
      "princip med ett knapptryck.",
    question: "Finns det något återkommande moment hos er som äter tid på samma sätt?",
    lanes: ["interna_system"],
  },
  {
    id: "ochoriginal-prestanda",
    customer: "Och Original",
    line:
      "Och Originals startsida tog 22 sekunder innan besökaren såg något. " +
      "Efter att vi optimerat bilder och laddning är den nere på 6.",
    question: "Vill du veta vad motsvarande mätning visar för er sida?",
    lanes: ["hemsideforbattring", "ny_hemsida"],
  },
];

/**
 * Caset att visa för en given bana, eller null när inget passar.
 *
 * Null är ett giltigt svar: saknas ett relevant case utelämnas variabeln och
 * renderingskontrollen stoppar mejlet, i stället för att visa ett bevis som
 * inte hör dit.
 */
export function referenceCaseFor(lane: string | null): ReferenceCase | null {
  if (!lane) return null;
  return REFERENCE_CASES.find((item) => item.lanes.includes(lane)) ?? null;
}
