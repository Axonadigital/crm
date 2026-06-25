/**
 * preview.ts — DEV-verktyg (körs ej i produktion).
 *
 * Bygger en realistisk sample-ReportViewModel + ReportAiContent och skriver
 * `email-preview.html` + `report-preview.pdf` så designen kan granskas visuellt
 * innan deploy.
 *
 * Kör:  deno run -A supabase/functions/_shared/monthlyReport/preview.ts [utmapp]
 */

import { buildReportEmailHtml } from "./buildReportEmailHtml.ts";
import { buildReportPdf } from "./buildReportPdf.ts";
import type { ReportAiContent, ReportViewModel } from "./types.ts";

export const sampleViewModel: ReportViewModel = {
  version: 2,
  companyName: "Axona Digital AB",
  period: { start: "2026-05-01", end: "2026-05-31", label: "maj 2026" },
  comparisonPeriod: { start: "2026-04-01", end: "2026-04-30" },
  coverage: { available: 4, total: 4, ratio: 1, missingSources: [] },
  metrics: {
    clicks: { current: 20, previous: 13, deltaPct: 54, deltaAbsolute: 7 },
    impressions: {
      current: 334,
      previous: 306,
      deltaPct: 9,
      deltaAbsolute: 28,
    },
    ctr: { current: 6, previous: 4.2, deltaPct: 41, deltaAbsolute: 1.8 },
    position: {
      current: 34.7,
      previous: 48.6,
      deltaPct: -28.6,
      deltaAbsolute: -13.9,
    },
    performance_score: {
      current: 62,
      previous: 58,
      deltaPct: 6.9,
      deltaAbsolute: 4,
    },
    lcp_ms: {
      current: 8000,
      previous: 8400,
      deltaPct: -4.8,
      deltaAbsolute: -400,
    },
    field_lcp_ms: {
      current: null,
      previous: null,
      deltaPct: null,
      deltaAbsolute: null,
    },
    field_inp_ms: {
      current: null,
      previous: null,
      deltaPct: null,
      deltaAbsolute: null,
    },
    field_cls: {
      current: null,
      previous: null,
      deltaPct: null,
      deltaAbsolute: null,
    },
    reviews_count: {
      current: null,
      previous: null,
      deltaPct: null,
      deltaAbsolute: null,
    },
    topQueries: [
      { query: "axona digital", clicks: 5, position: 2.1 },
      { query: "axona", clicks: 1, position: 8.1 },
      { query: "ai processer", clicks: 0, position: 21.0 },
      { query: "automatisera it processer", clicks: 0, position: 45.0 },
      { query: "automatisera it-processer", clicks: 0, position: 42.0 },
    ],
    topPages: [],
    opportunities: [
      {
        kind: "position_11_20",
        query: "ai automation östersund",
        clicks: 2,
        impressions: 210,
        ctr: 0.01,
        position: 14.2,
      },
      {
        kind: "position_4_10",
        query: "webbyrå östersund",
        clicks: 6,
        impressions: 180,
        ctr: 0.03,
        position: 7.4,
      },
      {
        kind: "low_ctr",
        query: "chattbot företag",
        clicks: 1,
        impressions: 140,
        ctr: 0.007,
        position: 9.1,
      },
      {
        kind: "position_11_20",
        query: "ai processer",
        clicks: 0,
        impressions: 96,
        ctr: 0,
        position: 16.0,
      },
      {
        kind: "low_ctr",
        query: "automatisera processer",
        clicks: 0,
        impressions: 74,
        ctr: 0,
        position: 8.8,
      },
      {
        kind: "position_4_10",
        query: "it-konsult östersund",
        clicks: 3,
        impressions: 61,
        ctr: 0.05,
        position: 6.2,
      },
    ],
    isFirstReport: false,
  },
  statuses: {
    googleVisibility: "poor",
    pageExperience: "needs_attention",
    localVisibility: "poor",
    technicalFoundation: "good",
  },
  technicalChecks: [
    {
      key: "indexable",
      label: "Indexerbar",
      passed: true,
      explanation: "Avgör om Google får lägga till sidan i sökresultatet.",
    },
    {
      key: "title",
      label: "Sidtitel",
      passed: true,
      explanation: "Beskriver sidan för både sökmotorer och besökare.",
    },
    {
      key: "meta_description",
      label: "Metabeskrivning",
      passed: true,
      explanation: "Påverkar hur attraktivt sökresultatet blir att klicka på.",
    },
    {
      key: "h1",
      label: "Huvudrubrik",
      passed: true,
      explanation: "Gör sidans huvudämne tydligt.",
    },
    {
      key: "sitemap",
      label: "Sitemap",
      passed: true,
      explanation: "Hjälper Google hitta sajtens sidor.",
    },
    {
      key: "robots",
      label: "Robots.txt",
      passed: true,
      explanation: "Styr vilka delar av sajten sökmotorer får läsa.",
    },
    {
      key: "schema_org",
      label: "Strukturerad data",
      passed: true,
      explanation: "Hjälper Google och AI-tjänster förstå verksamheten.",
    },
    {
      key: "og_tags",
      label: "Delningsmetadata",
      passed: true,
      explanation: "Ger professionella länkar i sociala medier och chattar.",
    },
  ],
  recommendations: [
    {
      key: "missing_business_profile",
      severity: "high",
      title: "Saknar Google Business-profil",
      description:
        "Företaget syns inte på Google Maps eller i lokala sökresultat — där de flesta lokala kunder letar.",
      service: "Google Business-paket",
    },
    {
      key: "slow_lcp",
      severity: "medium",
      title: "Hemsidan kan bli snabbare",
      description:
        "Prestandapoäng 62/100 på mobil — långsam laddning kan tappa besökare innan de tar kontakt.",
      service: "Prestandaoptimering",
    },
    {
      key: "low_position",
      severity: "medium",
      title: "Snittposition 34,7 i Google",
      description:
        "Sajten hamnar i snitt utanför första sidan på viktiga sökord.",
      service: "SEO-optimering",
    },
  ],
  primaryRecommendation: {
    key: "missing_business_profile",
    severity: "high",
    title: "Saknar Google Business-profil",
    description:
      "Företaget syns inte på Google Maps eller i lokala sökresultat.",
    service: "Google Business-paket",
  },
};

export const sampleAiContent: ReportAiContent = {
  greeting: "Hej Rasmus,",
  summary:
    "Maj har varit en riktigt positiv månad för er synlighet på Google — klicken till hemsidan har mer än fördubblats jämfört med april och er snittposition har förbättrats med nästan 14 platser. Samtidigt finns en sak som bromsar: hemsidan laddar långsamt på mobil, vilket är värt att ta tag i nu när fler hittar er.",
  recommended_action:
    "Sätt upp och vårda er Google Business-profil och bygg en enkel rutin för nya recensioner.",
  upsell_pitch:
    "För lokala företag är Google Business-profilen ofta den första kontaktytan och en av de insatser som ger snabbast och tydligast effekt.",
  action_plan: [
    {
      key: "missing_business_profile",
      what_we_see:
        "Ni saknar en Google Business-profil, så ni syns inte på Maps eller i lokala sökresultat.",
      what_it_means:
        "De flesta lokala kunder söker just där — utan profil missar ni dem helt.",
      how_we_help:
        "Vi sätter upp och optimerar profilen och bygger en rutin för nya recensioner — Google Business-paket.",
      next_step: "Hör av er så sätter vi upp profilen den här veckan.",
    },
    {
      key: "slow_lcp",
      what_we_see:
        "Hemsidan laddar på cirka 8 sekunder på mobil (prestandapoäng 62/100).",
      what_it_means:
        "Långsam laddning gör att besökare hoppar av innan de hinner ta kontakt.",
      how_we_help:
        "Vi identifierar och åtgärdar det som bromsar laddningen — Prestandaoptimering.",
      next_step:
        "Vi kan göra en snabb mätning och visa vinsten innan ni bestämmer er.",
    },
    {
      key: "low_position",
      what_we_see:
        "Er snittposition är 34,7 — i snitt utanför första sidan i Google.",
      what_it_means:
        "Position 1–10 får runt 90 % av alla klick, så det finns mycket trafik att hämta.",
      how_we_help:
        "Vi arbetar med innehåll och struktur för att flytta sökorden uppåt — SEO-optimering.",
      next_step: "Vi tar fram en kort sökordsplan att börja med.",
    },
  ],
};

/** Bygger båda artefakterna (ren, ingen I/O) — återanvänds av render-skript/test. */
export async function buildPreviewArtifacts(): Promise<{
  html: string;
  pdf: Uint8Array;
}> {
  const html = buildReportEmailHtml({
    companyName: sampleViewModel.companyName,
    periodLabel: sampleViewModel.period.label,
    aiContent: sampleAiContent,
    metrics: sampleViewModel.metrics,
    viewModel: sampleViewModel,
    hasSearchData: true,
    replyToEmail: "hej@axonadigital.se",
  });
  const pdf = await buildReportPdf({
    viewModel: sampleViewModel,
    aiContent: sampleAiContent,
  });
  return { html, pdf };
}

// Endast vid direktkörning i Deno (import.meta.main är undefined i Node/vitest).
if ((import.meta as { main?: boolean }).main) {
  const D = (globalThis as { Deno?: typeof Deno }).Deno!;
  const outDir = D.args[0] ?? ".";
  const { html, pdf } = await buildPreviewArtifacts();
  await D.writeTextFile(`${outDir}/email-preview.html`, html);
  await D.writeFile(`${outDir}/report-preview.pdf`, pdf);
  console.warn(`Wrote ${outDir}/email-preview.html (${html.length} bytes)`);
  console.warn(`Wrote ${outDir}/report-preview.pdf (${pdf.byteLength} bytes)`);
}
