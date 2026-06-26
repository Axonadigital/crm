import type { WebsiteFinding, WebsiteSnapshot } from "../types";
import { getRemediation } from "./remediationCatalog";

/**
 * Pure builder: turns a website analysis snapshot into a Swedish markdown
 * "åtgärdschecklista" meant to be pasted into Claude (with the customer's
 * website repo open) to actually fix the issues.
 *
 * Principle: MAXIMAL FIDELITY — every field present in the snapshot is included
 * in the readable statistics section, and the full snapshot(s) are appended as
 * raw JSON so nothing is ever lost. No data fetching here — the button passes
 * the already-loaded snapshot.
 */

export type WebsiteChecklistData = {
  companyName: string;
  websiteUrl?: string | null;
  snapshot: WebsiteSnapshot;
  previousSnapshot?: WebsiteSnapshot | null;
};

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_LABEL: Record<string, string> = {
  high: "hög",
  medium: "medel",
  low: "låg",
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "okänt datum";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("sv-SE");
}

function fmtNum(n?: number | null): string | null {
  if (n == null || isNaN(n)) return null;
  return Number(n).toLocaleString("sv-SE");
}

function fmtMs(n?: number | null): string | null {
  if (n == null || isNaN(n)) return null;
  return `${Number(Math.round(n)).toLocaleString("sv-SE")} ms`;
}

function fmtPct(ratio?: number | null): string | null {
  // CTR comes as a 0–1 ratio.
  if (ratio == null || isNaN(ratio)) return null;
  return `${(ratio * 100).toFixed(1)} %`;
}

function yesNo(value?: boolean | null): string | null {
  if (value == null) return null;
  return value ? "Ja" : "Nej";
}

/** `- {label}: {value}`, or null when the value is missing (so it is filtered). */
function line(label: string, value?: string | number | null): string | null {
  if (value === undefined || value === null || value === "") return null;
  return `- ${label}: ${value}`;
}

/** Appends "(föregående: X)" when a previous value exists, for trend context. */
function withPrev(
  value: string | number | null | undefined,
  prev: string | number | null | undefined,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (prev === undefined || prev === null || prev === "") return String(value);
  return `${value} (föregående: ${prev})`;
}

function block(title: string, body: (string | null)[]): string | null {
  const lines = body.filter(Boolean) as string[];
  if (!lines.length) return null;
  return [title, ...lines].join("\n");
}

// --- Statistics sections ---------------------------------------------------

function pagespeedSection(
  s: WebsiteSnapshot,
  prev?: WebsiteSnapshot | null,
): string | null {
  const ps = s.pagespeed;
  const lab = block("### Prestanda (PageSpeed lab, mobil)", [
    line(
      "Prestandapoäng",
      withPrev(
        s.performance_score ?? ps?.performance_score,
        prev?.performance_score ?? prev?.pagespeed?.performance_score,
      ),
    ),
    line("SEO-poäng", withPrev(s.seo_score ?? ps?.seo_score, prev?.seo_score)),
    line("LCP", withPrev(fmtMs(ps?.lcp_ms), fmtMs(prev?.pagespeed?.lcp_ms))),
    line("CLS", ps?.cls ?? null),
    line("TBT", fmtMs(ps?.tbt_ms)),
    line("FCP", fmtMs(ps?.fcp_ms)),
    line("Speed Index", fmtMs(ps?.speed_index_ms)),
    line("TTI", fmtMs(ps?.tti_ms)),
  ]);

  const opps = ps?.opportunities?.length
    ? block(
        "#### Förbättringsmöjligheter (PageSpeed)",
        ps.opportunities.map(
          (o) => `- Spara ~${fmtMs(o.savings_ms) ?? "?"}: ${o.title}`,
        ),
      )
    : null;

  const desktop = s.pagespeed?.desktop
    ? block("### Prestanda (PageSpeed lab, desktop)", [
        line("Prestandapoäng", s.pagespeed.desktop.performance_score),
        line("SEO-poäng", s.pagespeed.desktop.seo_score),
        line("LCP", fmtMs(s.pagespeed.desktop.lcp_ms)),
        line("CLS", s.pagespeed.desktop.cls ?? null),
        line("TBT", fmtMs(s.pagespeed.desktop.tbt_ms)),
        line("FCP", fmtMs(s.pagespeed.desktop.fcp_ms)),
        line("Speed Index", fmtMs(s.pagespeed.desktop.speed_index_ms)),
        line("TTI", fmtMs(s.pagespeed.desktop.tti_ms)),
      ])
    : null;

  return [lab, opps, desktop].filter(Boolean).join("\n\n") || null;
}

function fieldDataSection(s: WebsiteSnapshot): string | null {
  const fd = s.field_data;
  if (!fd) return null;
  const rating = (r?: string | null) => (r ? ` (${r})` : "");
  return block("### Core Web Vitals (riktiga användare, CrUX)", [
    line("Mätområde", fd.scope),
    line(
      "LCP",
      fmtMs(fd.lcp_ms) && `${fmtMs(fd.lcp_ms)}${rating(fd.lcp_rating)}`,
    ),
    line(
      "INP",
      fmtMs(fd.inp_ms) && `${fmtMs(fd.inp_ms)}${rating(fd.inp_rating)}`,
    ),
    line("CLS", fd.cls != null ? `${fd.cls}${rating(fd.cls_rating)}` : null),
  ]);
}

function seoChecksSection(s: WebsiteSnapshot): string | null {
  const c = s.seo_checks;
  if (!c) return null;
  return block("### Teknisk SEO", [
    line("Title", c.title ? `"${c.title}"` : yesNo(false)),
    line(
      "Meta description",
      c.meta_description ? `"${c.meta_description}"` : yesNo(false),
    ),
    line("Open Graph-taggar", yesNo(c.og_tags)),
    line("Schema.org (strukturerad data)", yesNo(c.schema_org)),
    line("Sitemap.xml", yesNo(c.sitemap)),
    line("— antal URL:er i sitemap", fmtNum(c.sitemap_url_count)),
    line("— senast uppdaterad (lastmod)", c.lastmod_newest),
    line("— inaktuella sidor (180+ dagar)", fmtNum(c.stale_count)),
    line("Robots.txt", yesNo(c.robots)),
    line("llms.txt", yesNo(c.llms_txt)),
    line("H1-rubrik", yesNo(c.h1)),
    line("Indexerbar", yesNo(c.indexable)),
  ]);
}

function searchConsoleSection(
  s: WebsiteSnapshot,
  prev?: WebsiteSnapshot | null,
): string | null {
  const sc = s.search_console;
  if (!sc) return null;
  const psc = prev?.search_console;

  const head = block("### Google-sök (Search Console)", [
    line("Klick", withPrev(fmtNum(sc.clicks), fmtNum(psc?.clicks))),
    line(
      "Visningar",
      withPrev(fmtNum(sc.impressions), fmtNum(psc?.impressions)),
    ),
    line("CTR", withPrev(fmtPct(sc.ctr), fmtPct(psc?.ctr))),
    line(
      "Snittposition",
      withPrev(
        sc.position?.toFixed?.(1) ?? sc.position,
        psc?.position?.toFixed?.(1),
      ),
    ),
    line(
      "Period",
      sc.period_start && sc.period_end
        ? `${sc.period_start} – ${sc.period_end}`
        : null,
    ),
  ]);

  const queries = sc.top_queries?.length
    ? block(
        "#### Toppsökord",
        sc.top_queries.map(
          (q) =>
            `- "${q.query}" — ${fmtNum(q.clicks)} klick, ${fmtNum(
              q.impressions,
            )} visn, pos ${q.position?.toFixed?.(1) ?? q.position}`,
        ),
      )
    : null;

  const pages = sc.top_pages?.length
    ? block(
        "#### Toppsidor",
        sc.top_pages.map(
          (p) =>
            `- ${p.page} — ${fmtNum(p.clicks)} klick, ${fmtNum(
              p.impressions,
            )} visn, pos ${p.position?.toFixed?.(1) ?? p.position}`,
        ),
      )
    : null;

  const devices = sc.device_breakdown
    ? block(
        "#### Enhetsfördelning",
        Object.entries(sc.device_breakdown).map(
          ([device, d]) =>
            `- ${device}: ${fmtNum(d?.clicks)} klick, ${fmtNum(
              d?.impressions,
            )} visn, pos ${d?.position?.toFixed?.(1) ?? d?.position}`,
        ),
      )
    : null;

  const countries = sc.top_countries?.length
    ? block(
        "#### Länder",
        sc.top_countries.map(
          (c) =>
            `- ${c.country}: ${fmtNum(c.clicks)} klick, ${fmtNum(
              c.impressions,
            )} visn`,
        ),
      )
    : null;

  const brand = block("#### Branded vs non-branded", [
    sc.branded
      ? `- Branded: ${fmtNum(sc.branded.clicks)} klick, ${fmtNum(
          sc.branded.impressions,
        )} visn, ${fmtNum(sc.branded.queries)} sökord`
      : null,
    sc.non_branded
      ? `- Non-branded: ${fmtNum(sc.non_branded.clicks)} klick, ${fmtNum(
          sc.non_branded.impressions,
        )} visn, ${fmtNum(sc.non_branded.queries)} sökord`
      : null,
  ]);

  const opps = sc.opportunities?.length
    ? block(
        "#### Sök-möjligheter (opportunities)",
        sc.opportunities.map(
          (o) =>
            `- [${o.kind}] "${o.query}" — pos ${
              o.position?.toFixed?.(1) ?? o.position
            }, ${fmtNum(o.impressions)} visn, ${fmtNum(o.clicks)} klick`,
        ),
      )
    : null;

  return [head, queries, pages, devices, countries, brand, opps]
    .filter(Boolean)
    .join("\n\n");
}

function businessSection(s: WebsiteSnapshot): string | null {
  const bp = s.business_profile;
  const ga = s.gbp_actions;
  if (!bp && !ga) return null;
  return block("### Google Business", [
    line("Hittad profil", yesNo(bp?.found)),
    line("Betyg", bp?.rating),
    line("Antal recensioner", fmtNum(bp?.reviews_count)),
    line("Place ID", bp?.place_id),
    ga
      ? `- Aktiviteter (${ga.period_start} – ${ga.period_end}): ${fmtNum(
          ga.calls,
        )} samtal, ${fmtNum(ga.website_clicks)} webbklick, ${fmtNum(
          ga.direction_requests,
        )} vägbeskrivningar`
      : null,
  ]);
}

function competitorsSection(s: WebsiteSnapshot): string | null {
  if (!s.competitors?.length) return null;
  return block(
    "### Konkurrenter (benchmark)",
    s.competitors.map(
      (c) =>
        `- ${c.url}: prestanda ${c.performance_score ?? "—"}, SEO ${
          c.seo_score ?? "—"
        }, LCP ${fmtMs(c.lcp_ms) ?? "—"}, CLS ${c.cls ?? "—"}, title ${
          c.has_title ? "✓" : "✗"
        }, schema ${c.has_schema ? "✓" : "✗"}, sitemap ${
          c.has_sitemap ? "✓" : "✗"
        }`,
    ),
  );
}

function localRankSection(s: WebsiteSnapshot): string | null {
  if (!s.local_rank?.length) return null;
  return block(
    "### Lokal ranking (map-pack)",
    s.local_rank.map(
      (r) =>
        `- "${r.keyword}": ${
          r.found ? `position ${r.position ?? "—"}` : "ej hittad"
        }`,
    ),
  );
}

// --- Action sections -------------------------------------------------------

/** Data-driven sub-steps injected from the snapshot for a given finding. */
function injectedSteps(finding: WebsiteFinding, s: WebsiteSnapshot): string[] {
  const out: string[] = [];
  if (
    (finding.key === "slow_site" || finding.key === "improvable_speed") &&
    s.pagespeed?.opportunities?.length
  ) {
    for (const o of s.pagespeed.opportunities) {
      out.push(`Spara ~${fmtMs(o.savings_ms) ?? "?"}: ${o.title}`);
    }
  }
  if (
    (finding.key === "no_clicks" ||
      finding.key === "low_position" ||
      finding.key === "no_search_visibility") &&
    s.search_console?.opportunities?.length
  ) {
    for (const o of s.search_console.opportunities) {
      out.push(
        `Måltavla [${o.kind}]: "${o.query}" (pos ${
          o.position?.toFixed?.(1) ?? o.position
        }, ${fmtNum(o.impressions)} visn)`,
      );
    }
  }
  return out;
}

function renderFinding(finding: WebsiteFinding, s: WebsiteSnapshot): string {
  const entry = getRemediation(finding.key);
  const sev = SEVERITY_LABEL[finding.severity] ?? finding.severity;
  const head = `### [ ] ${finding.title} (${sev} · ${entry.area})`;
  const desc = finding.description ? `\n${finding.description}` : "";
  const steps = [...entry.steps, ...injectedSteps(finding, s)]
    .map((step) => `  - [ ] ${step}`)
    .join("\n");
  return `${head}${desc}\n${steps}`;
}

function bySeverity(a: WebsiteFinding, b: WebsiteFinding): number {
  return (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
}

// --- Main builder ----------------------------------------------------------

export function buildWebsiteChecklist(data: WebsiteChecklistData): string {
  const { companyName, websiteUrl, snapshot, previousSnapshot } = data;
  const findings = snapshot.findings ?? [];

  const codeFindings = findings
    .filter((f) => getRemediation(f.key).codeFixable)
    .sort(bySeverity);
  const manualFindings = findings
    .filter((f) => !getRemediation(f.key).codeFixable)
    .sort(bySeverity);

  const dc = snapshot.data_coverage;
  const sourceStatus = snapshot.source_status
    ? Object.entries(snapshot.source_status)
        .map(
          ([src, st]) =>
            `${src}: ${st.status}${st.message ? ` (${st.message})` : ""}`,
        )
        .join("; ")
    : null;

  const header = [
    `# Åtgärdschecklista — ${companyName}`,
    "",
    ...([
      line("Hemsida", websiteUrl || snapshot.url),
      line("Analyserad", fmtDate(snapshot.fetched_at)),
      line(
        "Period",
        snapshot.period_start && snapshot.period_end
          ? `${snapshot.period_start} – ${snapshot.period_end}${
              snapshot.window_kind ? ` (${snapshot.window_kind})` : ""
            }`
          : null,
      ),
      line(
        "Datatäckning",
        dc?.available_sources != null && dc?.total_sources != null
          ? `${dc.available_sources}/${dc.total_sources} källor${
              dc.backfilled ? " (backfilled)" : ""
            }`
          : null,
      ),
      line("Källstatus", sourceStatus),
    ].filter(Boolean) as string[]),
  ].join("\n");

  const stats = [
    "## Nuläge — fullständig statistik",
    pagespeedSection(snapshot, previousSnapshot),
    fieldDataSection(snapshot),
    seoChecksSection(snapshot),
    searchConsoleSection(snapshot, previousSnapshot),
    businessSection(snapshot),
    competitorsSection(snapshot),
    localRankSection(snapshot),
  ]
    .filter(Boolean)
    .join("\n\n");

  const codeSection = [
    "## Åtgärder Claude kan göra i koden",
    codeFindings.length
      ? codeFindings.map((f) => renderFinding(f, snapshot)).join("\n\n")
      : "_Inga kod-åtgärder hittades._",
  ].join("\n\n");

  const manualSection = manualFindings.length
    ? [
        "## Manuella åtgärder (utanför koden)",
        manualFindings.map((f) => renderFinding(f, snapshot)).join("\n\n"),
      ].join("\n\n")
    : null;

  const rawJson = [
    "## Rådata (komplett JSON)",
    "Hela analysen — fallback så att 100 % av datan följer med, även fält som inte listas ovan.",
    "",
    "```json",
    JSON.stringify(
      previousSnapshot
        ? { senaste: snapshot, föregående: previousSnapshot }
        : snapshot,
      null,
      2,
    ),
    "```",
  ].join("\n");

  const footer = [
    "---",
    "**Så här jobbar du av listan:** öppna kundens hemside-repo (Next.js App Router + Tailwind) innan du klistrar in. Bocka av varje `[ ]` när åtgärden är gjord. Verifiera med en ny analys i CRM:t efteråt.",
  ].join("\n");

  return [header, stats, codeSection, manualSection, rawJson, footer]
    .filter(Boolean)
    .join("\n\n");
}
