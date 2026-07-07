import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "npm:pdf-lib@1.17.1";
import type {
  PresentationPolicy,
  ReportActionItem,
  ReportAiContent,
  ReportViewModel,
} from "./types.ts";
import { buildPresentationPolicy } from "./reportPresentation.ts";
import { hexToRgb01, reportColors } from "./reportTheme.ts";
import {
  AXONA_REPORT_LOGO_ASPECT,
  AXONA_REPORT_LOGO_PNG_BASE64,
} from "./reportLogo.ts";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Färgpalett från det delade temat (en källa för mejl + PDF). */
const col = {
  ink: rgb(...hexToRgb01(reportColors.ink)),
  muted: rgb(...hexToRgb01(reportColors.muted)),
  faint: rgb(...hexToRgb01(reportColors.faint)),
  line: rgb(...hexToRgb01(reportColors.hairline)),
  panel: rgb(...hexToRgb01(reportColors.panel)),
  hero: rgb(...hexToRgb01(reportColors.hero)),
  onHeroMuted: rgb(...hexToRgb01(reportColors.onHeroMuted)),
  heroAccent: rgb(...hexToRgb01(reportColors.heroAccent)),
  accent: rgb(...hexToRgb01(reportColors.accent)),
  accentText: rgb(...hexToRgb01(reportColors.accentText)),
  accentTint: rgb(...hexToRgb01(reportColors.accentTint)),
  accentBorder: rgb(...hexToRgb01(reportColors.accentBorder)),
  green: rgb(...hexToRgb01(reportColors.green)),
  greenTint: rgb(...hexToRgb01(reportColors.greenTint)),
  amber: rgb(...hexToRgb01(reportColors.amber)),
  amberTint: rgb(...hexToRgb01(reportColors.amberTint)),
  red: rgb(...hexToRgb01(reportColors.red)),
  redTint: rgb(...hexToRgb01(reportColors.redTint)),
  slate: rgb(...hexToRgb01(reportColors.slate)),
  slateTint: rgb(...hexToRgb01(reportColors.slateTint)),
  trackBg: rgb(0.93, 0.95, 0.97),
  prevBar: rgb(0.8, 0.84, 0.89),
  white: rgb(1, 1, 1),
};

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function statusLabel(status: string): string {
  if (status === "good") return "Bra";
  if (status === "needs_attention") return "Kan förbättras";
  if (status === "poor") return "Behöver åtgärdas";
  return "Data saknas";
}

function pctText(value: number | null): string {
  if (value == null) return "–";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} %`;
}

function ppText(value: number | null): string {
  if (value == null) return "–";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded} p.e.`;
}

function strongestSignal(viewModel: ReportViewModel): string {
  const m = viewModel.metrics;
  const candidates: Array<{ value: number; text: string }> = [];
  if (m.clicks.deltaPct != null && m.clicks.deltaPct > 0) {
    candidates.push({
      value: m.clicks.deltaPct,
      text: `Klicken från Google ökade med ${Math.round(m.clicks.deltaPct)} %.`,
    });
  }
  if (m.impressions.deltaPct != null && m.impressions.deltaPct > 0) {
    candidates.push({
      value: m.impressions.deltaPct,
      text: `Synligheten i Google ökade med ${Math.round(m.impressions.deltaPct)} %.`,
    });
  }
  if (m.position.deltaAbsolute != null && m.position.deltaAbsolute < 0) {
    candidates.push({
      value: Math.abs(m.position.deltaAbsolute) * 10,
      text: `Snittpositionen förbättrades ${Math.abs(m.position.deltaAbsolute).toFixed(1)} steg.`,
    });
  }
  if (m.lcp_ms.current != null && m.lcp_ms.current <= 2500) {
    candidates.push({
      value: 20,
      text: "Sidan laddar snabbt nog för mobila besökare.",
    });
  }
  candidates.sort((a, b) => b.value - a.value);
  return (
    candidates[0]?.text ??
    "Rapporten ger ett tydligt nuläge och visar nästa bästa förbättringssteg."
  );
}

function improvementFocus(
  viewModel: ReportViewModel,
  presentation: PresentationPolicy,
  recommendedService?: string,
): string {
  const m = viewModel.metrics;
  const manuallyRecommended = viewModel.recommendations.find(
    (r) => r.service === recommendedService,
  );
  if (manuallyRecommended) {
    return `${manuallyRecommended.title} är den viktigaste förbättringen i underlaget.`;
  }
  if (m.lcp_ms.current != null && m.lcp_ms.current > 2500) {
    // Dölj det råa sekundtalet när policyn säger så (Axona-ägd siffra).
    return presentation.showLcp
      ? `Laddtiden är ${(m.lcp_ms.current / 1000).toFixed(1)} sekunder, vilket gör prestanda till den tydligaste möjligheten.`
      : "Sidans laddtid är nästa tydliga möjlighet att stärka resultatet.";
  }
  if (viewModel.primaryRecommendation) {
    return `${viewModel.primaryRecommendation.title} är den viktigaste förbättringen i underlaget.`;
  }
  if (m.position.current != null && m.position.current > 10) {
    return "Fler sökord kan flyttas närmare första sidan i Google.";
  }
  return "Fortsätt förstärka den synlighet som redan finns.";
}

/**
 * Flyttar posten som matchar den manuellt valda huvudåtgärden längst fram,
 * utan att generera om text — ren omsortering av redan genererat innehåll.
 */
function reorderForRecommendedService(
  items: ReportActionItem[],
  recommendedKey: string | undefined,
): ReportActionItem[] {
  if (!recommendedKey) return items;
  const idx = items.findIndex((item) => item.key === recommendedKey);
  if (idx <= 0) return items;
  const copy = [...items];
  const [picked] = copy.splice(idx, 1);
  return [picked, ...copy];
}

function actionItemFromRecommendation(
  r: ReportViewModel["recommendations"][number],
): ReportActionItem {
  return {
    key: r.key,
    what_we_see: r.title,
    what_it_means: r.description,
    how_we_help: `Med ${r.service} arbetar vi praktiskt med just det här och gör förbättringen mätbar över tid.`,
    next_step: "Hör av er så lägger vi en konkret plan för nästa steg.",
  };
}

function fallbackActionItems(
  viewModel: ReportViewModel,
  recommendedService: string | undefined,
): ReportActionItem[] {
  const recs = viewModel.recommendations;
  const ordered = recommendedService
    ? [
        ...recs.filter((r) => r.service === recommendedService),
        ...recs.filter((r) => r.service !== recommendedService),
      ]
    : recs;
  return ordered.slice(0, 3).map(actionItemFromRecommendation);
}

function actionItemFromSelectedService(
  aiContent: ReportAiContent,
): ReportActionItem | null {
  if (!aiContent.recommended_service) return null;
  return {
    key: "selected_recommended_service",
    what_we_see: aiContent.recommended_action,
    what_it_means: aiContent.upsell_pitch,
    how_we_help: `Med ${aiContent.recommended_service} arbetar vi praktiskt med nästa prioriterade förbättring och gör den mätbar över tid.`,
    next_step: "Hör av er så lägger vi en konkret plan för nästa steg.",
  };
}

/** action_plan från AI:n, annars deterministisk fallback ur findings. */
function resolveActionItems(
  aiContent: ReportAiContent,
  viewModel: ReportViewModel,
): ReportActionItem[] {
  const recommendedKey = viewModel.recommendations.find(
    (r) => r.service === aiContent.recommended_service,
  )?.key;
  const selectedServiceItem = recommendedKey
    ? null
    : actionItemFromSelectedService(aiContent);
  if (aiContent.action_plan && aiContent.action_plan.length > 0) {
    if (
      recommendedKey &&
      !aiContent.action_plan.some((item) => item.key === recommendedKey)
    ) {
      return fallbackActionItems(viewModel, aiContent.recommended_service);
    }
    if (selectedServiceItem) {
      return [selectedServiceItem, ...aiContent.action_plan.slice(0, 2)];
    }
    return reorderForRecommendedService(aiContent.action_plan, recommendedKey);
  }
  const fallback = fallbackActionItems(viewModel, aiContent.recommended_service);
  return selectedServiceItem
    ? [selectedServiceItem, ...fallback.slice(0, 2)]
    : fallback;
}

export async function buildReportPdf(input: {
  viewModel: ReportViewModel;
  aiContent: ReportAiContent;
  /** Resolverad presentations-policy. Fallback: view_model.presentation, annars beräknad. */
  presentation?: PresentationPolicy;
}): Promise<Uint8Array> {
  const pres =
    input.presentation ??
    input.viewModel.presentation ??
    buildPresentationPolicy(input.viewModel);
  const resolvedService =
    input.aiContent.recommended_service ??
    input.viewModel.primaryRecommendation?.service;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logo: PDFImage | null = null;
  try {
    const bytes = Uint8Array.from(atob(AXONA_REPORT_LOGO_PNG_BASE64), (ch) =>
      ch.charCodeAt(0),
    );
    logo = await pdf.embedPng(bytes);
  } catch {
    logo = null; // faller tillbaka till text-wordmark
  }

  let page: PDFPage;
  let y: number;

  /** Rundad rektangel via SVG-path (top-left origin, y nedåt). */
  const roundedRect = (
    x: number,
    yTop: number,
    w: number,
    h: number,
    r: number,
    opts: {
      color?: ReturnType<typeof rgb>;
      borderColor?: ReturnType<typeof rgb>;
      borderWidth?: number;
    },
  ) => {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    const path =
      `M ${rr} 0 L ${w - rr} 0 Q ${w} 0 ${w} ${rr} L ${w} ${h - rr} ` +
      `Q ${w} ${h} ${w - rr} ${h} L ${rr} ${h} Q 0 ${h} 0 ${h - rr} ` +
      `L 0 ${rr} Q 0 0 ${rr} 0 Z`;
    page.drawSvgPath(path, {
      x,
      y: yTop,
      color: opts.color,
      borderColor: opts.borderColor,
      borderWidth: opts.borderWidth,
    });
  };

  /** Stadium-pill med centrerad text. Returnerar bredden. */
  const drawPill = (
    text: string,
    x: number,
    yTop: number,
    bg: ReturnType<typeof rgb>,
    fg: ReturnType<typeof rgb>,
    size = 8.5,
  ) => {
    const padX = 8;
    const h = size + 7;
    const tw = bold.widthOfTextAtSize(text, size);
    const w = tw + padX * 2;
    roundedRect(x, yTop, w, h, h / 2, { color: bg });
    page.drawText(text, {
      x: x + padX,
      y: yTop - h / 2 - size * 0.36,
      size,
      font: bold,
      color: fg,
    });
    return w;
  };

  const drawPageHeader = () => {
    // Loggan är vit (för mörk hero) → syns inte på vit topp. Sidhuvudet på
    // sida 2/3 använder därför wordmark i accentblått (loggan finns på sida 1).
    page.drawText("AXONA DIGITAL", {
      x: MARGIN,
      y,
      size: 9.5,
      font: bold,
      color: col.accent,
    });
    page.drawText(input.viewModel.period.label, {
      x:
        PAGE_WIDTH -
        MARGIN -
        regular.widthOfTextAtSize(input.viewModel.period.label, 9),
      y,
      size: 9,
      font: regular,
      color: col.muted,
    });
    page.drawLine({
      start: { x: MARGIN, y: y - 12 },
      end: { x: PAGE_WIDTH - MARGIN, y: y - 12 },
      thickness: 0.8,
      color: col.line,
    });
    y -= 30;
  };

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    drawPageHeader();
  };

  const ensure = (height: number) => {
    if (y - height < MARGIN + 28) newPage();
  };

  const heading = (text: string, size = 15) => {
    y -= 12; // luft ovanför rubriken
    ensure(size + 24);
    page.drawText(text, { x: MARGIN, y, size, font: bold, color: col.ink });
    page.drawRectangle({
      x: MARGIN,
      y: y - 8,
      width: 34,
      height: 3,
      color: col.accent,
    });
    y -= size + 16;
  };

  const paragraph = (
    text: string,
    options: {
      size?: number;
      color?: ReturnType<typeof rgb>;
      gap?: number;
    } = {},
  ) => {
    const size = options.size ?? 10.5;
    const lines = wrapText(text, regular, size, CONTENT_WIDTH);
    ensure(lines.length * (size + 4) + 6);
    for (const line of lines) {
      page.drawText(line, {
        x: MARGIN,
        y,
        size,
        font: regular,
        color: options.color ?? col.muted,
      });
      y -= size + 4;
    }
    y -= options.gap ?? 5;
  };

  /** Metrik-rad: etikett vänster, värde HÖGERSTÄLLT i kolumn, trend-pill längst ut. */
  const metricRow = (
    label: string,
    value: string,
    change?:
      | { kind: "pill"; text: string; tone: "good" | "bad" | "flat" }
      | { kind: "note"; text: string },
  ) => {
    const ROW_H = 28;
    ensure(ROW_H);
    const baseline = y - 17;
    page.drawText(label, {
      x: MARGIN,
      y: baseline,
      size: 10,
      font: regular,
      color: col.ink,
    });
    const valColRight = PAGE_WIDTH - MARGIN - 150;
    const vw = bold.widthOfTextAtSize(value, 11);
    page.drawText(value, {
      x: valColRight - vw,
      y: baseline,
      size: 11,
      font: bold,
      color: col.ink,
    });
    if (change?.kind === "pill") {
      const bg =
        change.tone === "good"
          ? col.greenTint
          : change.tone === "bad"
            ? col.amberTint
            : col.slateTint;
      const fg =
        change.tone === "good"
          ? col.green
          : change.tone === "bad"
            ? col.amber
            : col.slate;
      const size = 9;
      const tw = bold.widthOfTextAtSize(change.text, size);
      const w = tw + 16;
      drawPill(change.text, PAGE_WIDTH - MARGIN - w, y - 6, bg, fg, size);
    } else if (change?.kind === "note") {
      const nw = regular.widthOfTextAtSize(change.text, 9);
      page.drawText(change.text, {
        x: PAGE_WIDTH - MARGIN - nw,
        y: baseline,
        size: 9,
        font: regular,
        color: col.muted,
      });
    }
    y -= ROW_H;
    page.drawLine({
      start: { x: MARGIN, y: y + 3 },
      end: { x: PAGE_WIDTH - MARGIN, y: y + 3 },
      thickness: 0.5,
      color: col.line,
    });
  };

  const insightBox = (
    title: string,
    text: string,
    options: {
      x: number;
      width: number;
      bg: ReturnType<typeof rgb>;
      titleColor: ReturnType<typeof rgb>;
    },
  ) => {
    const boxHeight = 96;
    roundedRect(options.x, y + 14, options.width, boxHeight, 12, {
      color: options.bg,
    });
    page.drawText(title, {
      x: options.x + 16,
      y: y - 4,
      size: 9,
      font: bold,
      color: options.titleColor,
    });
    const lines = wrapText(text, regular, 10, options.width - 32);
    let lineY = y - 22;
    for (const line of lines.slice(0, 4)) {
      page.drawText(line, {
        x: options.x + 16,
        y: lineY,
        size: 10,
        font: regular,
        color: col.ink,
      });
      lineY -= 14;
    }
  };

  /** KPI-kort med jämförelsestaplar (förra vs nu) + trend-pill. */
  const metricCard = (
    label: string,
    value: string,
    opts: {
      x: number;
      yTop: number;
      width: number;
      prev: number | null;
      now: number | null;
      pill?: { text: string; tone: "good" | "bad" | "flat" };
      note?: string;
    },
  ) => {
    const h = 104;
    roundedRect(opts.x, opts.yTop, opts.width, h, 12, {
      color: col.white,
      borderColor: col.line,
      borderWidth: 0.8,
    });
    const padX = opts.x + 14;
    page.drawText(label, {
      x: padX,
      y: opts.yTop - 22,
      size: 8.5,
      font: bold,
      color: col.muted,
    });
    page.drawText(value, {
      x: padX,
      y: opts.yTop - 47,
      size: 22,
      font: bold,
      color: col.ink,
    });
    // jämförelsestaplar
    if (opts.prev != null && opts.now != null) {
      const max = Math.max(opts.prev, opts.now, 0.0001);
      const trackW = opts.width - 28 - 30;
      const trackX = padX + 30;
      const bar = (
        rowY: number,
        frac: number,
        fill: ReturnType<typeof rgb>,
        tag: string,
        strong: boolean,
      ) => {
        page.drawText(tag, {
          x: padX,
          y: rowY - 1,
          size: 7.5,
          font: strong ? bold : regular,
          color: strong ? col.accentText : col.faint,
        });
        roundedRect(trackX, rowY + 5, trackW, 5, 2.5, { color: col.trackBg });
        const w = Math.max(3, Math.round(trackW * Math.min(1, frac)));
        roundedRect(trackX, rowY + 5, w, 5, 2.5, { color: fill });
      };
      bar(opts.yTop - 60, opts.prev / max, col.prevBar, "Förra", false);
      bar(opts.yTop - 73, opts.now / max, col.accent, "Nu", true);
    } else if (opts.note) {
      page.drawText(opts.note, {
        x: padX,
        y: opts.yTop - 64,
        size: 8,
        font: regular,
        color: col.faint,
      });
    }
    if (opts.pill) {
      const bg =
        opts.pill.tone === "good"
          ? col.greenTint
          : opts.pill.tone === "bad"
            ? col.amberTint
            : col.slateTint;
      const fg =
        opts.pill.tone === "good"
          ? col.green
          : opts.pill.tone === "bad"
            ? col.amber
            : col.slate;
      drawPill(opts.pill.text, padX, opts.yTop - h + 22, bg, fg, 8.5);
    }
  };

  // ---------- Sida 1 ----------
  newPage();
  // Hero-band (near-black) över hela bredden, ovanför sidhuvudet.
  const heroH = 168;
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - heroH,
    width: PAGE_WIDTH,
    height: heroH,
    color: col.hero,
  });
  if (logo) {
    const lw = 150;
    const lh = lw / AXONA_REPORT_LOGO_ASPECT;
    page.drawImage(logo, {
      x: MARGIN,
      y: PAGE_HEIGHT - 52 - lh,
      width: lw,
      height: lh,
    });
  } else {
    page.drawText("AXONA DIGITAL", {
      x: MARGIN,
      y: PAGE_HEIGHT - 62,
      size: 16,
      font: bold,
      color: col.white,
    });
  }
  page.drawText("SYNLIGHETSRAPPORT", {
    x: MARGIN,
    y: PAGE_HEIGHT - 96,
    size: 9,
    font: bold,
    color: col.heroAccent,
  });
  page.drawText("Er synlighet just nu", {
    x: MARGIN,
    y: PAGE_HEIGHT - 124,
    size: 26,
    font: bold,
    color: col.white,
  });
  page.drawText(
    `${input.viewModel.companyName}  ·  ${input.viewModel.period.start} – ${input.viewModel.period.end}`,
    {
      x: MARGIN,
      y: PAGE_HEIGHT - 146,
      size: 11,
      font: regular,
      color: col.onHeroMuted,
    },
  );
  y = PAGE_HEIGHT - heroH - 34;

  heading("Månadens viktigaste");
  const boxTop = y;
  const halfW = (CONTENT_WIDTH - 16) / 2;
  insightBox("DET SOM FUNGERADE BÄST", strongestSignal(input.viewModel), {
    x: MARGIN,
    width: halfW,
    bg: col.greenTint,
    titleColor: col.green,
  });
  insightBox(
    "NÄSTA MÖJLIGHET",
    improvementFocus(
      input.viewModel,
      pres,
      input.aiContent.recommended_service,
    ),
    {
      x: MARGIN + halfW + 16,
      width: halfW,
      bg: col.amberTint,
      titleColor: col.amber,
    },
  );
  y = boxTop - 96;
  paragraph(input.aiContent.summary, { size: 11.5, color: col.ink, gap: 6 });
  paragraph(
    `Datatäckning: ${input.viewModel.coverage.available} av ${input.viewModel.coverage.total} källor. ${
      input.viewModel.coverage.missingSources.length
        ? `Saknas: ${input.viewModel.coverage.missingSources.join(", ")}.`
        : "Alla planerade källor kunde analyseras."
    }`,
    { size: 9.5, color: col.faint },
  );

  const m = input.viewModel.metrics;

  // Policy-gatade KPI-kort: bara presentabla mått tas med, layouten
  // omberäknas så inga luckor uppstår.
  type CardDesc = {
    label: string;
    value: string;
    prev: number | null;
    now: number | null;
    note?: string;
    pill?: { text: string; tone: "good" | "bad" | "flat" };
  };
  const cardDescs: CardDesc[] = [];
  if (pres.showClicks && m.clicks.current != null) {
    cardDescs.push({
      label: "KLICK",
      value: m.clicks.current.toLocaleString("sv-SE"),
      prev: m.clicks.previous,
      now: m.clicks.current,
      pill:
        m.clicks.deltaPct != null
          ? {
              text: pctText(m.clicks.deltaPct),
              tone: m.clicks.deltaPct >= 0 ? "good" : "bad",
            }
          : undefined,
    });
  }
  if (pres.showImpressions && m.impressions.current != null) {
    cardDescs.push({
      label: "VISNINGAR",
      value: m.impressions.current.toLocaleString("sv-SE"),
      prev: m.impressions.previous,
      now: m.impressions.current,
      pill:
        m.impressions.deltaPct != null
          ? {
              text: pctText(m.impressions.deltaPct),
              tone: m.impressions.deltaPct >= 0 ? "good" : "bad",
            }
          : undefined,
    });
  }
  if (pres.showPositionAbsolute && m.position.current != null) {
    cardDescs.push({
      label: "POSITION",
      value: m.position.current.toLocaleString("sv-SE", {
        maximumFractionDigits: 1,
      }),
      prev: null,
      now: null,
      note: "lägre är bättre",
      pill:
        m.position.deltaAbsolute != null
          ? {
              text: `${m.position.deltaAbsolute < 0 ? "-" : "+"}${Math.abs(m.position.deltaAbsolute).toFixed(1)}`,
              tone: m.position.deltaAbsolute < 0 ? "good" : "bad",
            }
          : undefined,
    });
  }

  // Detaljrader (gatade var för sig). Position-raden döljs när råtalet döljs.
  type RowDesc = {
    label: string;
    value: string;
    change?:
      | { kind: "pill"; text: string; tone: "good" | "bad" | "flat" }
      | { kind: "note"; text: string };
  };
  const rowDescs: RowDesc[] = [];
  if (pres.showClicks && m.clicks.current != null) {
    rowDescs.push({
      label: "Klick från Google",
      value: m.clicks.current.toLocaleString("sv-SE"),
      change:
        m.clicks.deltaPct != null
          ? {
              kind: "pill",
              text: pctText(m.clicks.deltaPct),
              tone: m.clicks.deltaPct >= 0 ? "good" : "bad",
            }
          : undefined,
    });
  }
  if (pres.showImpressions && m.impressions.current != null) {
    rowDescs.push({
      label: "Visningar i sökresultat",
      value: m.impressions.current.toLocaleString("sv-SE"),
      change:
        m.impressions.deltaPct != null
          ? {
              kind: "pill",
              text: pctText(m.impressions.deltaPct),
              tone: m.impressions.deltaPct >= 0 ? "good" : "bad",
            }
          : undefined,
    });
  }
  if (pres.showCtr && m.ctr.current != null) {
    rowDescs.push({
      label: "Klickfrekvens",
      value: `${m.ctr.current.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} %`,
      change:
        m.ctr.deltaPct != null
          ? {
              kind: "pill",
              text: ppText(m.ctr.deltaPct),
              tone: m.ctr.deltaPct >= 0 ? "good" : "bad",
            }
          : undefined,
    });
  }
  if (pres.showPositionAbsolute && m.position.current != null) {
    rowDescs.push({
      label: "Genomsnittlig position",
      value: m.position.current.toLocaleString("sv-SE", {
        maximumFractionDigits: 1,
      }),
      change:
        m.position.deltaAbsolute != null
          ? {
              kind: "pill",
              text: `${m.position.deltaAbsolute < 0 ? "förbättring" : "försämring"} ${Math.abs(m.position.deltaAbsolute).toFixed(1)}`,
              tone: m.position.deltaAbsolute < 0 ? "good" : "bad",
            }
          : undefined,
    });
  }

  if (cardDescs.length || rowDescs.length) {
    heading("Google-synlighet");
    if (cardDescs.length) {
      const gap = 12;
      const cardW =
        (CONTENT_WIDTH - gap * (cardDescs.length - 1)) / cardDescs.length;
      const cardTop = y;
      cardDescs.forEach((card, i) => {
        metricCard(card.label, card.value, {
          x: MARGIN + i * (cardW + gap),
          yTop: cardTop,
          width: cardW,
          prev: card.prev,
          now: card.now,
          note: card.note,
          pill: card.pill,
        });
      });
      y = cardTop - 104 - 22;
    }
    rowDescs.forEach((row) => metricRow(row.label, row.value, row.change));
  }

  const topQueries = pres.filterZeroClickQueries
    ? m.topQueries.filter((q) => q.clicks > 0)
    : m.topQueries;
  if (topQueries.length) {
    y -= 8;
    heading("Sökord som driver trafik", 13);
    topQueries.slice(0, 5).forEach((q) =>
      metricRow(q.query, `${q.clicks.toLocaleString("sv-SE")} klick`, {
        kind: "note",
        text: `position ${q.position.toFixed(1)}`,
      }),
    );
  }

  // Sökordsrörelser — endast vid SEO-optimering som huvudåtgärd.
  const keywordMovers = m.keywordMovers;
  if (
    resolvedService === "SEO-optimering" &&
    keywordMovers &&
    (keywordMovers.improved.length || keywordMovers.declined.length)
  ) {
    y -= 8;
    heading("Sökordsrörelser", 13);
    keywordMovers.improved.forEach((mover) =>
      metricRow(mover.query, `→ pos ${mover.current.toFixed(1)}`, {
        kind: "pill",
        text: `förbättring ${Math.abs(mover.delta).toFixed(1)}`,
        tone: "good",
      }),
    );
    keywordMovers.declined.forEach((mover) =>
      metricRow(mover.query, `→ pos ${mover.current.toFixed(1)}`, {
        kind: "pill",
        text: `försämring ${Math.abs(mover.delta).toFixed(1)}`,
        tone: "bad",
      }),
    );
  }

  // ---------- Sida 2 ----------
  if (m.opportunities.length) {
    y -= 8;
    heading("Sökord med störst potential", 13);
    m.opportunities.slice(0, 6).forEach((item) => {
      const reason =
        item.kind === "low_ctr"
          ? "många visningar men få klick"
          : item.kind === "position_4_10"
            ? "redan på första sidan"
            : "nära första sidan";
      metricRow(
        item.query,
        `${item.impressions.toLocaleString("sv-SE")} visningar`,
        {
          kind: "note",
          text: reason,
        },
      );
    });
  }

  // "Fyra delar av synligheten" (röd scorecard) — borttagen som standard
  // (pres.showFourParts = false). Behålls bakom flaggan för manuell override.
  if (pres.showFourParts) {
    y -= 8;
    heading("Fyra delar av synligheten");
    const statusRows = [
      ["Google-synlighet", input.viewModel.statuses.googleVisibility],
      ["Sidupplevelse", input.viewModel.statuses.pageExperience],
      ["Lokal synlighet", input.viewModel.statuses.localVisibility],
      ["Teknisk grund", input.viewModel.statuses.technicalFoundation],
    ] as const;
    statusRows.forEach(([label, status]) => {
      ensure(28);
      const baseline = y - 16;
      page.drawText(label, {
        x: MARGIN,
        y: baseline,
        size: 11,
        font: bold,
        color: col.ink,
      });
      const tone =
        status === "good"
          ? { bg: col.greenTint, fg: col.green }
          : status === "poor"
            ? { bg: col.redTint, fg: col.red }
            : status === "missing"
              ? { bg: col.slateTint, fg: col.slate }
              : { bg: col.amberTint, fg: col.amber };
      const text = statusLabel(status);
      const w = bold.widthOfTextAtSize(text, 9) + 16;
      drawPill(text, PAGE_WIDTH - MARGIN - w, y - 4, tone.bg, tone.fg, 9);
      y -= 26;
      page.drawLine({
        start: { x: MARGIN, y: y + 3 },
        end: { x: PAGE_WIDTH - MARGIN, y: y + 3 },
        thickness: 0.5,
        color: col.line,
      });
    });
  }

  // "Sidupplevelse" (rå LCP/INP/CLS/Lighthouse) visas bara när sidupplevelsen
  // faktiskt är bra — annars skulle den bara lista svaga, Axona-ägda tal.
  if (pres.showPageExperience) {
    y -= 10;
    heading("Sidupplevelse");
    const realLcp = m.field_lcp_ms.current;
    metricRow(
      "Verklig laddtid (LCP)",
      realLcp == null ? "Fältdata saknas" : `${(realLcp / 1000).toFixed(1)} s`,
      {
        kind: "note",
        text: realLcp == null ? "Lighthouse visas separat" : "mål: under 2,5 s",
      },
    );
    metricRow(
      "Verklig svarstid (INP)",
      m.field_inp_ms.current == null
        ? "Fältdata saknas"
        : `${Math.round(m.field_inp_ms.current)} ms`,
      { kind: "note", text: "mål: under 200 ms" },
    );
    metricRow(
      "Layoutstabilitet (CLS)",
      m.field_cls.current == null
        ? "Fältdata saknas"
        : m.field_cls.current.toFixed(2),
      { kind: "note", text: "mål: under 0,10" },
    );
    if (pres.showPerformanceScore) {
      metricRow(
        "Lighthouse prestandapoäng",
        m.performance_score.current?.toFixed(0) ?? "Data saknas",
        { kind: "note", text: "syntetiskt mobiltest" },
      );
    }
  }

  y -= 10;
  heading("Teknisk grund");
  input.viewModel.technicalChecks.forEach((check) => {
    const status =
      check.passed == null ? "Ej kontr." : check.passed ? "Finns" : "Saknas";
    const tone =
      check.passed == null
        ? { bg: col.slateTint, fg: col.slate }
        : check.passed
          ? { bg: col.greenTint, fg: col.green }
          : { bg: col.redTint, fg: col.red };
    ensure(26);
    const baseline = y - 15;
    page.drawText(check.label, {
      x: MARGIN,
      y: baseline,
      size: 10,
      font: bold,
      color: col.ink,
    });
    const labelW = bold.widthOfTextAtSize(check.label, 10);
    const exp = wrapText(
      check.explanation,
      regular,
      9,
      PAGE_WIDTH - MARGIN * 2 - labelW - 90,
    );
    page.drawText(exp[0] ?? "", {
      x: MARGIN + labelW + 10,
      y: baseline,
      size: 9,
      font: regular,
      color: col.muted,
    });
    const w = bold.widthOfTextAtSize(status, 8.5) + 16;
    drawPill(status, PAGE_WIDTH - MARGIN - w, y - 3, tone.bg, tone.fg, 8.5);
    y -= 24;
    page.drawLine({
      start: { x: MARGIN, y: y + 3 },
      end: { x: PAGE_WIDTH - MARGIN, y: y + 3 },
      thickness: 0.5,
      color: col.line,
    });
  });

  // Prioriterad åtgärdsplan (handlingsdriven, strukturerad)
  y -= 12;
  heading("Prioriterad åtgärdsplan");
  const actionItems = resolveActionItems(input.aiContent, input.viewModel);
  if (actionItems.length === 0) {
    paragraph("Inga tydliga kritiska brister hittades i tillgängliga källor.");
  }
  actionItems.forEach((item, index) => {
    const whatLines = wrapText(item.what_we_see, bold, 11, CONTENT_WIDTH - 40);
    const meansLines = wrapText(
      item.what_it_means,
      regular,
      10,
      CONTENT_WIDTH - 40,
    );
    const helpLines = wrapText(
      `Så löser vi det: ${item.how_we_help}`,
      regular,
      10,
      CONTENT_WIDTH - 40,
    );
    const blockH =
      18 +
      whatLines.length * 14 +
      meansLines.length * 13 +
      helpLines.length * 13 +
      14;
    ensure(blockH);
    // sifferchip
    roundedRect(MARGIN, y + 2, 22, 22, 7, { color: col.hero });
    page.drawText(`${index + 1}`, {
      x: MARGIN + 22 / 2 - bold.widthOfTextAtSize(`${index + 1}`, 12) / 2,
      y: y - 12,
      size: 12,
      font: bold,
      color: col.white,
    });
    const tx = MARGIN + 34;
    const tw = CONTENT_WIDTH - 34;
    let ly = y - 4;
    for (const line of whatLines) {
      page.drawText(line, {
        x: tx,
        y: ly,
        size: 11,
        font: bold,
        color: col.ink,
      });
      ly -= 14;
    }
    for (const line of meansLines) {
      page.drawText(line, {
        x: tx,
        y: ly,
        size: 10,
        font: regular,
        color: col.muted,
      });
      ly -= 13;
    }
    for (let i = 0; i < helpLines.length; i++) {
      const line = helpLines[i];
      page.drawText(line, {
        x: tx,
        y: ly,
        size: 10,
        font: regular,
        color: i === 0 ? col.accentText : col.ink,
      });
      ly -= 13;
    }
    void tw;
    y = ly - 12;
  });

  // Rekommenderat nästa steg
  y -= 4;
  heading("Rekommenderat nästa steg", 13);
  if (resolvedService) {
    ensure(40);
    roundedRect(MARGIN, y + 14, CONTENT_WIDTH, 34, 10, {
      color: col.accentTint,
      borderColor: col.accentBorder,
      borderWidth: 0.8,
    });
    page.drawText(resolvedService, {
      x: MARGIN + 16,
      y: y - 6,
      size: 11,
      font: bold,
      color: col.accentText,
    });
    y -= 44;
  }
  paragraph(input.aiContent.recommended_action, {
    size: 11.5,
    color: col.ink,
    gap: 6,
  });
  paragraph(input.aiContent.upsell_pitch, { size: 10, color: col.slate });

  // ---------- Sida 3: metod ("Så ska rapporten läsas") ----------
  // Gatad: finns mest för att bortförklara "Fältdata saknas"/labbtest — onödig
  // när de sektionerna döljs (pres.showMethodology = false som standard).
  if (pres.showMethodology) {
    newPage();
    heading("Så ska rapporten läsas");
    const method: Array<[string, string]> = [
      [
        "Search Console — faktisk organisk synlighet",
        "Visar hur ni faktiskt syns och presterar i Googles sökresultat under perioden: hur många som ser er, klickar och vilken position ni har. Riktiga siffror från riktiga sökningar.",
      ],
      [
        "Core Web Vitals — besökarnas verkliga upplevelse",
        'Mäter hur snabbt och stabilt sidan upplevs av era faktiska besökare. Kräver tillräckligt med trafik — när underlaget är för litet visas "Fältdata saknas".',
      ],
      [
        "Lighthouse — kontrollerat labbtest",
        "Ett syntetiskt prestandatest under standardiserade förhållanden (poäng 0–100). Fungerar som stabilt komplement när fältdata saknas, men speglar inte alltid varje besökares upplevelse.",
      ],
    ];
    method.forEach(([title, body]) => {
      const bodyLines = wrapText(body, regular, 10.5, CONTENT_WIDTH - 32);
      const boxH = 28 + bodyLines.length * 15 + 16;
      ensure(boxH + 12);
      roundedRect(MARGIN, y + 12, CONTENT_WIDTH, boxH, 12, {
        color: col.white,
        borderColor: col.line,
        borderWidth: 0.8,
      });
      page.drawText(title, {
        x: MARGIN + 18,
        y: y - 8,
        size: 12,
        font: bold,
        color: col.ink,
      });
      let ly = y - 28;
      for (const line of bodyLines) {
        page.drawText(line, {
          x: MARGIN + 18,
          y: ly,
          size: 10.5,
          font: regular,
          color: col.muted,
        });
        ly -= 15;
      }
      y -= boxH + 16;
    });
  }

  // Sidfötter
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawText(`Sida ${index + 1} av ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 64,
      y: 26,
      size: 8,
      font: regular,
      color: col.faint,
    });
    p.drawText("Axona Digital AB · Synlighetsrapport", {
      x: MARGIN,
      y: 26,
      size: 8,
      font: regular,
      color: col.faint,
    });
  });

  pdf.setTitle(
    `Synlighetsrapport ${input.viewModel.companyName} ${input.viewModel.period.label}`,
  );
  pdf.setAuthor("Axona Digital AB");
  return pdf.save();
}
