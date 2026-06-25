/**
 * buildReportEmailHtml — ren modul (vitest-bar).
 *
 * Bygger ett kundvänt rapportmail med rådgivande, HANDLINGSDRIVEN ton: mailet
 * leder med den viktigaste åtgärden (action_plan[0]) och kopplar varje
 * prioritering till "så löser vi det". Email-säker HTML: tabell-layout, inline-
 * stilar, inga externa CSS/JS, jämförelsestaplar byggda av tabellceller.
 *
 * Designen är kalibrerad mot Axonas varumärke (near-black hero, accentblå
 * sparsamt, statusfärger som bär betydelse) — se reportTheme.ts.
 */

import { reportColors, reportLogoUrl } from "./reportTheme.ts";
import type {
  ReportActionItem,
  ReportAiContent,
  ReportMetrics,
  ReportViewModel,
} from "./types.ts";

const c = reportColors;
const FONT =
  "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

/**
 * Findings som inte ska driva innehåll i KUNDmailet. missing_llms_txt döljs:
 * llms.txt är i praktiken dött (strategidok. sektion 4) — vi flaggar det internt
 * men nämner det aldrig för kund.
 */
export const CUSTOMER_HIDDEN_FINDING_KEYS = ["missing_llms_txt"];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Liten CSS-ritad triangel (ingen emoji) i pillens textfärg. */
function triangle(up: boolean, color: string): string {
  const edge = up
    ? `border-bottom:6px solid ${color}`
    : `border-top:6px solid ${color}`;
  return `<span style="display:inline-block;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;${edge};vertical-align:middle;margin-right:5px;"></span>`;
}

function pillHtml(bg: string, fg: string, inner: string): string {
  return `<span style="display:inline-block;background:${bg};color:${fg};font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;">${inner}</span>`;
}

/** Trend-pill för procentmått (utan emoji-pilar). */
function deltaPill(deltaPct: number | null, lowerIsBetter = false): string {
  if (deltaPct == null) return "";
  const rounded = Math.round(deltaPct);
  if (rounded === 0) return pillHtml(c.slateTint, c.slate, "Stabilt");
  const improved = lowerIsBetter ? rounded < 0 : rounded > 0;
  const bg = improved ? c.greenTint : c.amberTint;
  const fg = improved ? c.green : c.amber;
  return pillHtml(
    bg,
    fg,
    `${triangle(rounded > 0, fg)}${rounded > 0 ? "+" : ""}${rounded}&nbsp;%`,
  );
}

/** Trend-pill för snittposition (heltalssteg, lägre är bättre). */
function positionPill(deltaAbs: number | null): string {
  if (deltaAbs == null) return "";
  if (Math.abs(deltaAbs) < 0.05)
    return pillHtml(c.slateTint, c.slate, "Stabilt");
  const improved = deltaAbs < 0;
  const bg = improved ? c.greenTint : c.amberTint;
  const fg = improved ? c.green : c.amber;
  const word = improved ? "förbättring" : "försämring";
  return pillHtml(
    bg,
    fg,
    `${triangle(improved, fg)}${word} ${Math.abs(deltaAbs).toFixed(1)}`,
  );
}

/** Två jämförelsestaplar (förra perioden vs den här) — rena tabellceller. */
function miniBars(previous: number | null, current: number | null): string {
  if (previous == null || current == null) return "";
  const max = Math.max(previous, current, 0.0001);
  const prevW = Math.max(4, Math.round((previous / max) * 100));
  const nowW = Math.max(4, Math.round((current / max) * 100));
  const row = (label: string, width: number, color: string, strong: boolean) =>
    `<tr>
      <td width="44" style="width:44px;font-size:10px;font-weight:${strong ? 700 : 600};color:${strong ? c.accentText : c.faint};padding:0 6px 0 0;">${label}</td>
      <td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="${width}%" style="height:6px;background:${color};border-radius:3px;font-size:0;line-height:6px;">&nbsp;</td><td>&nbsp;</td></tr></table></td>
    </tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px;">
    ${row("Förra", prevW, "#CBD5E1", false)}
    <tr><td style="height:5px;font-size:0;line-height:5px;">&nbsp;</td><td></td></tr>
    ${row("Nu", nowW, c.accent, true)}
  </table>`;
}

function kpiCard(
  label: string,
  value: string,
  badge: string,
  bars: string,
): string {
  return `<td width="50%" valign="top" style="padding:8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${c.hairline};border-radius:14px;">
      <tr><td style="padding:16px 16px 18px;font-family:${FONT};">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${c.muted};">${escapeHtml(label)}</p>
        <p style="margin:0 0 ${bars ? "12px" : "12px"};font-size:30px;line-height:1.05;font-weight:800;color:${c.ink};">${escapeHtml(value)}</p>
        ${bars}
        ${badge ? `<div style="padding-top:12px;">${badge}</div>` : ""}
      </td></tr>
    </table>
  </td>`;
}

function metricRows(cards: string[]): string {
  const rows: string[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    rows.push(
      `<tr>${cards[i]}${cards[i + 1] ?? '<td width="50%" style="width:50%;padding:8px;"></td>'}</tr>`,
    );
  }
  return rows.join("\n");
}

/** action_plan från AI:n, annars deterministisk fallback ur findings. */
function resolveActionItems(
  aiContent: ReportAiContent,
  viewModel?: ReportViewModel,
): ReportActionItem[] {
  if (aiContent.action_plan && aiContent.action_plan.length > 0) {
    return aiContent.action_plan;
  }
  const recs = (viewModel?.recommendations ?? []).slice(0, 3);
  return recs.map((r) => ({
    key: r.key,
    what_we_see: r.title,
    what_it_means: r.description,
    how_we_help: `Med ${r.service} arbetar vi praktiskt med just det här och gör förbättringen mätbar över tid.`,
    next_step: "Hör av er så lägger vi en konkret plan för nästa steg.",
  }));
}

/** Prominent "viktigast just nu"-kort — mailet leder med detta. */
function leadActionCard(item: ReportActionItem): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${c.accentBorder};border-radius:14px;background:${c.accentTint};">
    <tr><td style="padding:20px 22px;font-family:${FONT};">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${c.accentText};">Viktigast just nu</p>
      <p style="margin:0 0 6px;font-size:17px;font-weight:700;line-height:1.4;color:${c.ink};">${escapeHtml(item.what_we_see)}</p>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:${c.slate};">${escapeHtml(item.what_it_means)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${c.accentBorder};">
        <tr><td style="padding-top:14px;font-family:${FONT};">
          <p style="margin:0 0 6px;font-size:13px;line-height:1.55;color:${c.ink};"><strong style="color:${c.accentText};">Så löser vi det:</strong> ${escapeHtml(item.how_we_help)}</p>
          <p style="margin:0;font-size:13px;line-height:1.55;color:${c.ink};"><strong style="color:${c.accentText};">Nästa steg:</strong> ${escapeHtml(item.next_step)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`;
}

/** Kompakt rad för övriga prioriteringar. */
function actionRow(item: ReportActionItem, index: number): string {
  return `<tr><td style="padding:14px 0;border-top:1px solid ${c.hairline};font-family:${FONT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="30" valign="top" style="width:30px;"><span style="display:inline-block;width:24px;height:24px;border-radius:7px;background:${c.hero};color:#fff;font-size:13px;font-weight:800;text-align:center;line-height:24px;">${index}</span></td>
      <td style="padding-left:12px;">
        <p style="margin:0 0 4px;font-size:14px;font-weight:700;line-height:1.4;color:${c.ink};">${escapeHtml(item.what_we_see)}</p>
        <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:${c.muted};">${escapeHtml(item.what_it_means)}</p>
        <p style="margin:0;font-size:13px;line-height:1.5;color:${c.ink};"><strong style="color:${c.accentText};">Så löser vi det:</strong> ${escapeHtml(item.how_we_help)}</p>
      </td>
    </tr></table>
  </td></tr>`;
}

function section(padding: string, inner: string): string {
  return `<tr><td style="padding:${padding};">${inner}</td></tr>`;
}

function sectionLabel(text: string): string {
  return `<p style="margin:0 0 14px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${c.muted};">${escapeHtml(text)}</p>`;
}

export type BuildReportEmailInput = {
  companyName: string;
  periodLabel: string;
  aiContent: ReportAiContent;
  metrics: ReportMetrics;
  viewModel?: ReportViewModel;
  hasSearchData: boolean;
  /** From-adress för en "svara på mejlet"-CTA. */
  replyToEmail: string;
};

export function buildReportEmailHtml(input: BuildReportEmailInput): string {
  const { metrics, aiContent } = input;
  const cards: string[] = [];

  if (input.hasSearchData) {
    if (metrics.clicks.current != null) {
      cards.push(
        kpiCard(
          "Klick från Google",
          metrics.clicks.current.toLocaleString("sv-SE"),
          deltaPill(metrics.clicks.deltaPct),
          miniBars(metrics.clicks.previous, metrics.clicks.current),
        ),
      );
    }
    if (metrics.impressions.current != null) {
      cards.push(
        kpiCard(
          "Visningar i sök",
          metrics.impressions.current.toLocaleString("sv-SE"),
          deltaPill(metrics.impressions.deltaPct),
          miniBars(metrics.impressions.previous, metrics.impressions.current),
        ),
      );
    }
    if (metrics.ctr.current != null) {
      cards.push(
        kpiCard(
          "Andel som klickade",
          `${metrics.ctr.current.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} %`,
          deltaPill(metrics.ctr.deltaPct),
          miniBars(metrics.ctr.previous, metrics.ctr.current),
        ),
      );
    }
    if (metrics.position.current != null) {
      cards.push(
        kpiCard(
          "Snittposition (lägre är bättre)",
          metrics.position.current.toFixed(1),
          positionPill(metrics.position.deltaAbsolute),
          "",
        ),
      );
    }
  }
  if (metrics.lcp_ms.current != null) {
    const seconds = (metrics.lcp_ms.current / 1000).toFixed(1);
    const ok = metrics.lcp_ms.current <= 2500;
    cards.push(
      kpiCard(
        "Laddtid (mobil)",
        `${seconds} s`,
        pillHtml(
          ok ? c.greenTint : c.amberTint,
          ok ? c.green : c.amber,
          ok ? "Snabb nog" : "Kan förbättras",
        ),
        "",
      ),
    );
  }

  const safeCompany = escapeHtml(input.companyName);
  const safePeriod = escapeHtml(input.periodLabel);
  const safeMailto = `mailto:${encodeURIComponent(input.replyToEmail)}`;
  const service =
    input.viewModel?.primaryRecommendation?.service ??
    "nästa prioriterade insats";

  const actionItems = resolveActionItems(aiContent, input.viewModel);
  const leadItem = actionItems[0];
  const restItems = actionItems.slice(1);

  const coverageText = input.viewModel
    ? `${input.viewModel.coverage.available} av ${input.viewModel.coverage.total} datakällor analyserades${
        input.viewModel.coverage.missingSources.length
          ? ` · saknas: ${input.viewModel.coverage.missingSources.join(", ")}`
          : ""
      }`
    : null;

  const topQueries =
    input.hasSearchData && metrics.topQueries.length > 0
      ? metrics.topQueries.slice(0, 3)
      : [];

  return `<!DOCTYPE html>
<html lang="sv">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"></head>
<body style="margin:0;padding:0;background:${c.slateTint};font-family:${FONT};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${c.slateTint};">${escapeHtml(aiContent.summary).slice(0, 120)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.slateTint};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${c.white};border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(10,10,10,0.08);">

        <!-- Header (near-black, logo) -->
        <tr><td style="background:${c.hero};padding:30px 36px 28px;">
          <img src="${reportLogoUrl}" width="150" alt="Axona Digital" style="display:block;border:0;outline:none;height:auto;width:150px;">
          <p style="margin:20px 0 0;font-size:12px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${c.heroAccent};">Synlighetsrapport · ${safePeriod}</p>
          <h1 style="margin:8px 0 4px;font-size:26px;line-height:1.2;font-weight:800;color:${c.onHero};">Er synlighet just nu</h1>
          <p style="margin:0;font-size:14px;font-weight:500;line-height:1.5;color:${c.onHeroMuted};">${safeCompany}</p>
        </td></tr>

        <!-- Greeting + summary -->
        ${section(
          "30px 36px 6px",
          `<p style="margin:0 0 12px;font-size:16px;font-weight:700;line-height:1.4;color:${c.ink};">${escapeHtml(aiContent.greeting)}</p>
           <p style="margin:0;font-size:16px;font-weight:500;line-height:1.6;color:${c.slate};">${escapeHtml(aiContent.summary)}</p>`,
        )}

        <!-- Lead action (#1) -->
        ${leadItem ? section("22px 36px 6px", leadActionCard(leadItem)) : ""}

        <!-- Coverage caption -->
        ${
          coverageText
            ? section(
                "14px 36px 0",
                `<p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.04em;color:${c.faint};">DATATÄCKNING: ${escapeHtml(coverageText.toUpperCase())}</p>`,
              )
            : ""
        }

        <!-- KPI grid -->
        ${
          cards.length
            ? section(
                "14px 28px 6px",
                `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${metricRows(cards)}</table>
                 ${input.hasSearchData ? `<p style="margin:6px 8px 0;font-size:11px;color:${c.faint};line-height:1.5;">Jämförelse mot föregående period.</p>` : ""}`,
              )
            : ""
        }

        <!-- Top sökord -->
        ${
          topQueries.length
            ? section(
                "20px 36px 6px",
                `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${c.hairline};border-radius:14px;"><tr><td style="padding:18px 20px;font-family:${FONT};">
                  ${sectionLabel("Vanligaste sökorden")}
                  ${topQueries
                    .map(
                      (q, i) =>
                        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                          <td style="font-size:14px;font-weight:600;color:${c.ink};padding:7px 0;${i ? `border-top:1px solid ${c.hairline};` : ""}">${escapeHtml(q.query)}</td>
                          <td align="right" style="font-size:13px;color:${c.muted};padding:7px 0;${i ? `border-top:1px solid ${c.hairline};` : ""}white-space:nowrap;">${q.clicks.toLocaleString("sv-SE")} klick · pos ${q.position.toFixed(1)}</td>
                        </tr></table>`,
                    )
                    .join("")}
                </td></tr></table>`,
              )
            : ""
        }

        <!-- Resterande prioriteringar -->
        ${
          restItems.length
            ? section(
                "22px 36px 6px",
                `${sectionLabel("Så förbättrar vi resten")}
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                   ${restItems.map((item, i) => actionRow(item, i + 2)).join("")}
                 </table>`,
              )
            : ""
        }

        <!-- Upsell box -->
        ${section(
          "22px 36px 6px",
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.panel};border:1px solid ${c.hairline};border-radius:14px;"><tr><td style="padding:22px 24px;font-family:${FONT};">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${c.accentText};">Rekommenderad tilläggstjänst · ${escapeHtml(service)}</p>
            <p style="margin:0 0 10px;font-size:16px;font-weight:700;line-height:1.45;color:${c.ink};">${escapeHtml(aiContent.recommended_action)}</p>
            <p style="margin:0;font-size:14px;font-weight:500;line-height:1.6;color:${c.slate};">${escapeHtml(aiContent.upsell_pitch)}</p>
          </td></tr></table>`,
        )}

        <!-- PDF note + CTA -->
        ${section(
          "22px 36px 4px",
          `<p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:${c.slate};text-align:center;">Hela analysen — sökord, sidupplevelse, teknisk grund och en prioriterad åtgärdsplan — finns i den bifogade PDF-rapporten.</p>
           <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" style="border-radius:10px;background:${c.accent};">
             <a href="${safeMailto}" style="display:inline-block;font-family:${FONT};font-size:15px;font-weight:700;color:#fff;text-decoration:none;padding:14px 30px;border-radius:10px;">Prata med oss om nästa steg</a>
           </td></tr></table>
           <p style="margin:18px 0 0;font-size:13px;color:${c.faint};line-height:1.6;text-align:center;">Svara gärna på det här mejlet så hör vi av oss.</p>`,
        )}

        <tr><td style="height:8px;font-size:0;line-height:8px;">&nbsp;</td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 36px 30px;border-top:1px solid ${c.hairline};">
          <p style="margin:0;font-size:12px;color:${c.muted};">Axona Digital AB &nbsp;|&nbsp; Östersund, Sverige</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
