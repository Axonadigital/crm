/**
 * keywordMovement — ren modul (vitest-bar).
 *
 * Port av computeKeywordMovers() i WebsiteStatsSection.tsx ("Sökordsrörelser"
 * i CRM:et) — samma algoritm, delad så mejl/PDF kan visa samma
 * positionsrörelser som kundvyn, utan en ny datakälla.
 */

import type { ReportSnapshot } from "./types.ts";

export type KeywordMover = {
  query: string;
  current: number;
  previous: number;
  delta: number;
};

/**
 * Jämför sökordspositioner mellan två officiella månader. Negativ delta =
 * förbättring (lägre position är bättre).
 */
export function computeKeywordMovers(
  latest: ReportSnapshot | null | undefined,
  previous: ReportSnapshot | null | undefined,
): { improved: KeywordMover[]; declined: KeywordMover[] } {
  const current = latest?.search_console?.top_queries ?? [];
  const prior = previous?.search_console?.top_queries ?? [];
  const priorByQuery = new Map(prior.map((row) => [row.query, row.position]));
  const movers: KeywordMover[] = [];
  for (const row of current) {
    const priorPosition = priorByQuery.get(row.query);
    if (priorPosition != null && priorPosition !== row.position) {
      movers.push({
        query: row.query,
        current: row.position,
        previous: priorPosition,
        delta: row.position - priorPosition,
      });
    }
  }
  return {
    improved: movers
      .filter((m) => m.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 5),
    declined: movers
      .filter((m) => m.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 3),
  };
}
