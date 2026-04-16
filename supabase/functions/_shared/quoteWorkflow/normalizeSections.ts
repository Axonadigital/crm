/**
 * Section normalization for premium quote templates.
 *
 * Two exported functions:
 *
 *  normalizePremiumSections(sections)
 *    Context-free: fills copy defaults for ALL premium template sections.
 *    Mutates in place. Idempotent — never overwrites existing values.
 *    Call from any code path: generate_quote_pdf, orchestrate_proposal, tests.
 *
 *  enrichSectionsForOrchestration(sections, context)
 *    Orchestration-aware: calls normalizePremiumSections then applies
 *    orchestration overrides (isMultiPage → hide upsell, recurring amounts).
 *    Returns null when sections is null (preserves legacy branch in
 *    orchestrate_proposal).
 *
 * Default copy values live in sectionDefaults.ts (runtime-neutral).
 * Frontend mirror of defaults: src/lib/quoteSectionDefaults.ts
 *
 * generate_quote_text does NOT currently use this helper — it stores the
 * raw parsed sections. Phase 1 preserves that split.
 */

import {
  DEFAULT_HIGHLIGHT_CARDS,
  DEFAULT_PROBLEM_CARDS,
  DEFAULT_PACKAGE_INCLUDES,
  DEFAULT_UPGRADE_PACKAGE,
  DEFAULT_PROCESS_STEPS,
  DEFAULT_SUPPORT_CARDS,
  DEFAULT_TECH_ITEMS,
  DEFAULT_FOUNDERS,
  DEFAULT_ABOUT_FACTS,
  DEFAULT_PACKAGE_SECTION_TITLE,
  DEFAULT_PACKAGE_SECTION_TEXT,
  DEFAULT_REFERENCE_SECTION_TITLE,
  DEFAULT_REFERENCE_SECTION_TEXT,
  DEFAULT_PROCESS_SECTION_TITLE,
  DEFAULT_PROCESS_SECTION_TEXT,
  DEFAULT_SUPPORT_SECTION_TITLE,
  DEFAULT_TECH_SECTION_TITLE,
  DEFAULT_ABOUT_SECTION_TITLE,
  DEFAULT_ABOUT_SECTION_TEXT,
  DEFAULT_UPGRADE_BENEFITS_TITLE,
  DEFAULT_REFERENCE_CTA_LABEL,
  DEFAULT_PRICE_SUMMARY_TITLE,
  DEFAULT_TERMS_SECTION_TITLE,
} from "./sectionDefaults.ts";

export interface NormalizeSectionsContext {
  /** True when the deal/quote is already for a multi-page website, so the
   *  upsell "Flersidig hemsida" upgrade card should be hidden. */
  isMultiPage: boolean;
  /** Recurring payment pass-through from the deal. */
  recurringAmount?: number | null;
  recurringInterval?: string | null;
}

/**
 * Fill default copy content for all premium template sections.
 * Idempotent — existing values are never overwritten.
 * Mutates the sections object in place.
 */
export function normalizePremiumSections(
  sections: Record<string, unknown>,
): void {
  const s = sections;

  // ── Highlight cards ──
  if (
    !Array.isArray(s.highlight_cards) ||
    (s.highlight_cards as unknown[]).length === 0
  ) {
    s.highlight_cards = DEFAULT_HIGHLIGHT_CARDS;
  }

  // ── Problem cards ──
  if (
    !Array.isArray(s.problem_cards) ||
    (s.problem_cards as unknown[]).length === 0
  ) {
    s.problem_cards = DEFAULT_PROBLEM_CARDS;
  }

  // ── Package includes ──
  if (
    !Array.isArray(s.package_includes) ||
    (s.package_includes as unknown[]).length === 0
  ) {
    s.package_includes = DEFAULT_PACKAGE_INCLUDES;
  }

  // ── Upgrade package ──
  // If the key is absent (never set), provide the default upsell package.
  // If the key exists (even as null = "hide it"), preserve the caller's value.
  // enrichSectionsForOrchestration overrides this to null when isMultiPage=true.
  if (!("upgrade_package" in s)) {
    s.upgrade_package = DEFAULT_UPGRADE_PACKAGE;
  }

  // ── Process steps ──
  if (
    !Array.isArray(s.process_steps) ||
    (s.process_steps as unknown[]).length === 0
  ) {
    s.process_steps = DEFAULT_PROCESS_STEPS;
  }

  // ── Support cards ──
  if (
    !Array.isArray(s.support_cards) ||
    (s.support_cards as unknown[]).length === 0
  ) {
    s.support_cards = DEFAULT_SUPPORT_CARDS;
  }

  // ── Tech items ──
  if (
    !Array.isArray(s.tech_items) ||
    (s.tech_items as unknown[]).length === 0
  ) {
    s.tech_items = DEFAULT_TECH_ITEMS;
  }

  // ── Founders ──
  if (!Array.isArray(s.founders) || (s.founders as unknown[]).length === 0) {
    s.founders = DEFAULT_FOUNDERS;
  }

  // ── Section titles / texts ──
  if (!s.package_section_title)
    s.package_section_title = DEFAULT_PACKAGE_SECTION_TITLE;
  if (!s.package_section_text)
    s.package_section_text = DEFAULT_PACKAGE_SECTION_TEXT;
  if (!s.reference_section_title)
    s.reference_section_title = DEFAULT_REFERENCE_SECTION_TITLE;
  if (!s.reference_section_text)
    s.reference_section_text = DEFAULT_REFERENCE_SECTION_TEXT;
  // problem_section_title intentionally left null-able — buildPremiumTemplate derives it from companySector
  if (!s.process_section_title)
    s.process_section_title = DEFAULT_PROCESS_SECTION_TITLE;
  if (!s.process_section_text)
    s.process_section_text = DEFAULT_PROCESS_SECTION_TEXT;
  if (!s.support_section_title)
    s.support_section_title = DEFAULT_SUPPORT_SECTION_TITLE;
  if (!s.tech_section_title) s.tech_section_title = DEFAULT_TECH_SECTION_TITLE;
  if (!s.about_section_title)
    s.about_section_title = DEFAULT_ABOUT_SECTION_TITLE;
  if (!s.about_section_text) s.about_section_text = DEFAULT_ABOUT_SECTION_TEXT;

  // ── Kat. B: new copy keys (were hardcoded literals in premiumSections.ts) ──
  if (!s.upgrade_benefits_title)
    s.upgrade_benefits_title = DEFAULT_UPGRADE_BENEFITS_TITLE;
  if (!s.reference_cta_label)
    s.reference_cta_label = DEFAULT_REFERENCE_CTA_LABEL;
  if (
    !Array.isArray(s.about_facts) ||
    (s.about_facts as unknown[]).length === 0
  ) {
    s.about_facts = DEFAULT_ABOUT_FACTS;
  }
  if (!s.price_summary_title)
    s.price_summary_title = DEFAULT_PRICE_SUMMARY_TITLE;
  if (!s.terms_section_title)
    s.terms_section_title = DEFAULT_TERMS_SECTION_TITLE;
}

/**
 * Merge parsed AI sections with default content for the orchestrated
 * proposal flow. Returns null when sections is null (no drift from the
 * legacy branch in orchestrate_proposal).
 */
export function enrichSectionsForOrchestration(
  sections: Record<string, unknown> | null,
  context: NormalizeSectionsContext,
): Record<string, unknown> | null {
  if (!sections) return null;

  const enriched = { ...sections };
  normalizePremiumSections(enriched);

  // Orchestration overrides — applied after normalization so they always win.
  if (context.isMultiPage) {
    enriched.upgrade_package = null;
  }
  enriched.recurring_amount = context.recurringAmount ?? null;
  enriched.recurring_interval = context.recurringInterval ?? null;

  return enriched;
}
