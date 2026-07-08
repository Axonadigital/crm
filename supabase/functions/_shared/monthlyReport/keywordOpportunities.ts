/**
 * keywordOpportunities — ren modul (vitest-bar).
 *
 * Sökord som redan har synlighet (visningar) men inte ligger topp 3 — konkreta
 * exempel på "vad vi bör optimera för", till skillnad från "Vanligaste
 * sökorden" som bara visar redan starka sökord. Underlag till
 * SEO-optimering-paketets sökordsmöjligheter-sektion i mejl/PDF.
 */

import type { ReportSnapshot } from "./types.ts";

export type KeywordOpportunity = {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
};

const TOP_POSITION_THRESHOLD = 3;
const MAX_OPPORTUNITIES = 8;

/**
 * Filtrerar `top_queries` till sökord utanför topp 3, sorterade på flest
 * visningar (störst outnyttjad potential först).
 */
export function computeKeywordOpportunities(
  latest: ReportSnapshot | null | undefined,
): KeywordOpportunity[] {
  const queries = latest?.search_console?.top_queries ?? [];
  return queries
    .filter((q) => q.position > TOP_POSITION_THRESHOLD)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, MAX_OPPORTUNITIES)
    .map((q) => ({
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      position: Math.round(q.position * 10) / 10,
    }));
}
