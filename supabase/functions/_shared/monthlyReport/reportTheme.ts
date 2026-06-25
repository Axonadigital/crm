/**
 * reportTheme.ts — delad designtoken-källa för kundrapporten (mejl + PDF).
 *
 * Tidigare dupplicerades färgerna i buildReportEmailHtml.ts (hex) och
 * buildReportPdf.ts (rgb). Här är de samlade EN gång, kalibrerade mot
 * Axonas varumärkesguide (design/brand-guide.md): near-black hero, accentblå
 * sparsamt, statusfärger som bär betydelse. Mejlet använder hex direkt; PDF:en
 * konverterar via `hexToRgb01()` (pdf-lib vill ha 0–1-komponenter).
 */

export const reportColors = {
  /** Brödtext / rubriker på ljus bakgrund. */
  ink: "#0F172A",
  /** Sekundär text. */
  muted: "#64748B",
  /** Svag text (etiketter, mål, metadata). */
  faint: "#94A3B8",
  /** Hårlinje / kortkant. */
  hairline: "#E6EAF0",
  /** Ljus panelyta. */
  panel: "#F8FAFC",

  /** Hero/sidhuvud — near-black enligt varumärket (#0a0a0a-familjen). */
  hero: "#0A0A0A",
  /** Text på hero. */
  onHero: "#FFFFFF",
  /** Sekundär text på hero (brand grey-300). */
  onHeroMuted: "#D4D4D4",
  /** Caption-accent på hero (brand blue-400, sparsamt). */
  heroAccent: "#60A5FA",

  /** Accentblå — sektionsstreck, sifferchips, knapp, länk (används sparsamt). */
  accent: "#2563EB",
  /** Accenttext på ljus tint. */
  accentText: "#1D4ED8",
  /** Ljus accentbakgrund. */
  accentTint: "#EFF4FF",
  /** Accentkant. */
  accentBorder: "#BFD3FE",

  green: "#15803D",
  greenTint: "#ECFDF3",
  amber: "#B45309",
  amberTint: "#FFF7ED",
  red: "#DC2626",
  redTint: "#FEF2F2",
  slate: "#475569",
  slateTint: "#F1F5F9",

  white: "#FFFFFF",
} as const;

export type ReportColorKey = keyof typeof reportColors;

/** Hostad transparent vit wordmark för mejlets header (alt-text bär varumärket vid blockerad bild). */
export const reportLogoUrl =
  "https://crm.axonadigital.se/logos/axona-logo-report.png";

/** Wordmarkens bildförhållande (bredd/höjd) — samma asset i mejl och PDF. */
export const reportLogoAspect = 600 / 62;

/** "#RRGGBB" → [r, g, b] i 0–1 för pdf-lib `rgb()`. */
export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const int = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  return [
    ((int >> 16) & 255) / 255,
    ((int >> 8) & 255) / 255,
    (int & 255) / 255,
  ];
}
