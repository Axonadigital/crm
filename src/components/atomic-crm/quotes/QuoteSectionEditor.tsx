/**
 * QuoteSectionEditor — CRM inline editor for premium quote sections.
 *
 * Exports:
 *  PremiumSectionsAccordion  — full accordion editor, drop-in replacement for
 *                              the old flat PremiumSectionsPreview in QuoteShow.tsx.
 *  ArraySectionEditor        — generic fixed-length array editor (reusable).
 *
 * Fas 8B scope: process_steps, support_cards, tech_items, founders, about_facts,
 * all section titles/texts, and the new 8A scalar keys.
 * Existing fields (summary_pitch, highlight_cards, problem_cards, etc.) are
 * preserved with identical behaviour.
 *
 * Save path: saveSections → dataProvider.saveQuoteContent → save_quote_content.
 * No new backend work needed.
 *
 * Array shape rules (Codex-approved, Fas 8B rev 3):
 *  - Pad if too short.
 *  - NEVER truncate: items beyond maxVisible stay in draft and survive save.
 */

import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
  useTranslate,
} from "ra-core";
import { Check, Pencil, X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { normalizeClientSections } from "@/lib/quoteSectionDefaults";
import { DEFAULT_UPGRADE_PACKAGE } from "@/lib/quoteSectionDefaults";
import type { Quote, QuoteGeneratedSections } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// ArraySectionEditor
// ─────────────────────────────────────────────────────────────────────────────

interface FieldDef<T> {
  key: keyof T;
  label: string;
  type: "text" | "textarea";
  readOnly?: boolean;
}

interface ArraySectionEditorProps<T extends Record<string, string>> {
  items: T[];
  maxVisible: number;
  fields: FieldDef<T>[];
  onChange: (items: T[]) => void;
  isEditing: boolean;
  /** Label displayed above each item (e.g. "Steg 1") */
  itemLabel?: (index: number, item: T) => string;
}

export function ArraySectionEditor<T extends Record<string, string>>({
  items,
  maxVisible,
  fields,
  onChange,
  isEditing,
  itemLabel,
}: ArraySectionEditorProps<T>) {
  const visibleItems = items.slice(0, maxVisible);

  const handleFieldChange = (idx: number, key: keyof T, value: string) => {
    // Preserve items beyond maxVisible — never truncate on save.
    onChange(
      items.map((item, i) => (i === idx ? { ...item, [key]: value } : item)),
    );
  };

  if (!isEditing) {
    return (
      <div className="space-y-3">
        {visibleItems.map((item, i) => (
          <div key={i} className="space-y-0.5">
            {itemLabel && (
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {itemLabel(i, item)}
              </span>
            )}
            {fields
              .filter((f) => !f.readOnly)
              .map((f) => (
                <p key={String(f.key)} className="text-sm">
                  {f.type === "textarea" ? (
                    <span className="text-xs text-muted-foreground leading-5">
                      {item[f.key as string]}
                    </span>
                  ) : (
                    <span className="font-medium">{item[f.key as string]}</span>
                  )}
                </p>
              ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {visibleItems.map((item, i) => (
        <div key={i} className="rounded-md border p-3 space-y-2 bg-background">
          {itemLabel && (
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {itemLabel(i, item)}
            </span>
          )}
          {fields.map((f) =>
            f.readOnly ? (
              <div key={String(f.key)} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {f.label}:
                </span>
                <span className="text-xs bg-muted rounded px-1.5 py-0.5 font-mono">
                  {item[f.key as string]}
                </span>
              </div>
            ) : f.type === "textarea" ? (
              <Textarea
                key={String(f.key)}
                value={item[f.key as string] ?? ""}
                onChange={(e) => handleFieldChange(i, f.key, e.target.value)}
                rows={2}
                className="resize-y text-xs"
                placeholder={f.label}
              />
            ) : (
              <input
                key={String(f.key)}
                type="text"
                value={item[f.key as string] ?? ""}
                onChange={(e) => handleFieldChange(i, f.key, e.target.value)}
                className="text-sm bg-transparent border-b border-dashed w-full outline-none focus:border-foreground"
                placeholder={f.label}
              />
            ),
          )}
        </div>
      ))}
      {items.length > maxVisible && (
        <p className="text-[10px] text-muted-foreground italic">
          +{items.length - maxVisible} item(s) utanför v1-gränsen — bevaras vid
          sparning.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {children}
    </span>
  );
}

function ScalarField({
  label,
  value,
  onChange,
  type = "text",
  rows = 2,
  placeholder,
  isEditing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "textarea";
  rows?: number;
  placeholder?: string;
  isEditing: boolean;
}) {
  return (
    <div className="space-y-1">
      <SectionLabel>{label}</SectionLabel>
      {isEditing ? (
        type === "textarea" ? (
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            className="resize-y text-sm"
            placeholder={placeholder ?? label}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="text-sm bg-transparent border-b border-dashed w-full outline-none focus:border-foreground"
            placeholder={placeholder ?? label}
          />
        )
      ) : (
        <p className="text-sm leading-6 whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PremiumSectionsAccordion — main export
// ─────────────────────────────────────────────────────────────────────────────

export const PremiumSectionsAccordion = ({
  sections,
  accentColor,
}: {
  /** Raw sections from DB — may be null/empty for legacy or manual quotes. */
  sections: Partial<QuoteGeneratedSections> | null | undefined;
  accentColor?: string;
}) => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const record = useRecordContext<Quote>();
  const accent = accentColor || "#2563eb";

  const canEdit = record?.status === "draft" || record?.status === "generated";

  // Normalized sections for read-only display — filled with defaults at mount.
  // This ensures read-only view is consistent with preview/PDF even for legacy
  // or sparse sections objects.
  const displaySections = useMemo<QuoteGeneratedSections>(() => {
    const base: Partial<QuoteGeneratedSections> = { ...(sections ?? {}) };
    normalizeClientSections(base);
    return base as QuoteGeneratedSections;
  }, [sections]);

  // Hide completely when no content and not editable (closed/signed quotes
  // without any generated_sections should not show an empty accordion).
  const hasContent = sections != null && Object.keys(sections).length > 0;

  // All hooks must be declared before any conditional return.
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<QuoteGeneratedSections>(displaySections);

  if (!hasContent && !canEdit) return null;

  const { mutate: saveSections, isPending } = useMutation({
    mutationFn: () =>
      dataProvider.saveQuoteContent(
        record!.id,
        draft as unknown as Record<string, unknown>,
      ),
    onSuccess: () => {
      setIsEditing(false);
      notify("resources.quotes.notifications.text_saved", {
        type: "info",
        _: "Saved",
      });
      refresh();
    },
    onError: () => {
      notify("resources.quotes.notifications.text_save_failed", {
        type: "error",
        _: "Failed to save",
      });
    },
  });

  const handleStartEdit = () => {
    setDraft({ ...displaySections });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDraft({ ...displaySections });
  };

  const set = <K extends keyof QuoteGeneratedSections>(
    key: K,
    value: QuoteGeneratedSections[K],
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="m-4">
      <Separator className="mb-4" />

      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tracking-wide">
            {translate("resources.quotes.fields.premium_content", {
              _: "Premium content (AI-generated)",
            })}
          </span>
          <div
            className="w-4 h-4 rounded-full border"
            style={{ backgroundColor: accent }}
            title={`Accent: ${accent}`}
          />
        </div>
        {canEdit && !isEditing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStartEdit}
            className="h-7 px-2 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="w-3.5 h-3.5 mr-1" />
            {translate("ra.action.edit", { _: "Edit" })}
          </Button>
        )}
        {isEditing && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={isPending}
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              {translate("ra.action.cancel", { _: "Cancel" })}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => saveSections()}
              disabled={isPending}
              className="h-7 px-2"
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              {isPending
                ? translate("ra.action.saving", { _: "Saving..." })
                : translate("ra.action.save", { _: "Save" })}
            </Button>
          </div>
        )}
      </div>

      {/* Accordion */}
      <Accordion type="multiple" defaultValue={["intro"]}>
        {/* ── 1. Intro & sammanfattning ── */}
        <AccordionItem value="intro">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:no-underline">
            Intro &amp; sammanfattning
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            {/* Summary pitch */}
            <div className="p-4 border rounded-md bg-muted/30">
              <SectionLabel>// Sammanfattning</SectionLabel>
              {isEditing ? (
                <Textarea
                  value={draft.summary_pitch ?? ""}
                  onChange={(e) => set("summary_pitch", e.target.value)}
                  rows={3}
                  className="mt-2 resize-y text-sm leading-6"
                />
              ) : (
                <p className="mt-2 text-sm leading-6">
                  {displaySections.summary_pitch}
                </p>
              )}
            </div>

            {/* Highlight cards */}
            <div className="p-4 border rounded-md bg-muted/30">
              <SectionLabel>// Highlight-kort</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                {(isEditing
                  ? draft.highlight_cards
                  : displaySections.highlight_cards
                )?.map((card, i) => (
                  <div
                    key={i}
                    className="p-3 border rounded-lg"
                    style={{ borderTopColor: accent, borderTopWidth: "2px" }}
                  >
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          value={card.icon}
                          onChange={(e) =>
                            set(
                              "highlight_cards",
                              draft.highlight_cards.map((c, j) =>
                                j === i ? { ...c, icon: e.target.value } : c,
                              ),
                            )
                          }
                          className="text-xs text-muted-foreground bg-transparent border-b border-dashed w-full mb-1 outline-none focus:border-foreground"
                          placeholder="Icon name"
                        />
                        <input
                          type="text"
                          value={card.title}
                          onChange={(e) =>
                            set(
                              "highlight_cards",
                              draft.highlight_cards.map((c, j) =>
                                j === i ? { ...c, title: e.target.value } : c,
                              ),
                            )
                          }
                          className="text-sm font-semibold bg-transparent border-b border-dashed w-full mb-1 outline-none focus:border-foreground"
                          placeholder="Titel"
                        />
                        <Textarea
                          value={card.text}
                          onChange={(e) =>
                            set(
                              "highlight_cards",
                              draft.highlight_cards.map((c, j) =>
                                j === i ? { ...c, text: e.target.value } : c,
                              ),
                            )
                          }
                          rows={2}
                          className="text-xs resize-y mt-1"
                          placeholder="Beskrivning"
                        />
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-muted-foreground">
                          {card.icon}
                        </span>
                        <h4 className="text-sm font-semibold mt-1">
                          {card.title}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {card.text}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Design demo */}
            {(displaySections.design_demo_description || isEditing) && (
              <div className="p-3 border rounded-md bg-muted/20">
                <SectionLabel>// Designdemo</SectionLabel>
                {isEditing ? (
                  <Textarea
                    value={draft.design_demo_description || ""}
                    onChange={(e) =>
                      set("design_demo_description", e.target.value || null)
                    }
                    rows={2}
                    className="mt-1 resize-y text-sm"
                    placeholder="Design demo description (leave empty to hide)"
                  />
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {displaySections.design_demo_description}
                  </p>
                )}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* ── 2. Problemsektionen ── */}
        <AccordionItem value="problem">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:no-underline">
            Problemsektionen
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <ScalarField
              label="Sektionsrubrik"
              value={
                (isEditing ? draft : displaySections).problem_section_title ??
                ""
              }
              onChange={(v) => set("problem_section_title", v)}
              isEditing={isEditing}
            />
            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>// Problemkort</SectionLabel>
                {isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      set("problem_cards", [
                        ...(draft.problem_cards ?? []),
                        {
                          number: String(
                            (draft.problem_cards?.length ?? 0) + 1,
                          ).padStart(2, "0"),
                          title: "",
                          text: "",
                        },
                      ])
                    }
                  >
                    + Lägg till
                  </Button>
                )}
              </div>
              <div className="space-y-3">
                {(
                  (isEditing ? draft : displaySections).problem_cards ?? []
                ).map((card, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span className="text-2xl font-bold text-muted-foreground/30 leading-none mt-1 w-8 shrink-0">
                      {card.number}
                    </span>
                    {isEditing ? (
                      <div className="flex-1 space-y-1">
                        <input
                          type="text"
                          value={card.title}
                          onChange={(e) =>
                            set(
                              "problem_cards",
                              draft.problem_cards?.map((c, j) =>
                                j === i ? { ...c, title: e.target.value } : c,
                              ),
                            )
                          }
                          className="text-sm font-semibold bg-transparent border-b border-dashed w-full outline-none focus:border-foreground"
                          placeholder="Rubrik"
                        />
                        <Textarea
                          value={card.text}
                          onChange={(e) =>
                            set(
                              "problem_cards",
                              draft.problem_cards?.map((c, j) =>
                                j === i ? { ...c, text: e.target.value } : c,
                              ),
                            )
                          }
                          rows={2}
                          className="text-xs resize-y"
                          placeholder="Beskrivning"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() =>
                            set(
                              "problem_cards",
                              draft.problem_cards?.filter((_, j) => j !== i),
                            )
                          }
                        >
                          Ta bort
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-semibold">{card.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {card.text}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── 3. Paketet ── */}
        <AccordionItem value="package">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:no-underline">
            Paketet
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <ScalarField
              label="Sektionsrubrik"
              value={
                (isEditing ? draft : displaySections).package_section_title ??
                ""
              }
              onChange={(v) => set("package_section_title", v)}
              isEditing={isEditing}
            />
            <ScalarField
              label="Sektionstext"
              value={
                (isEditing ? draft : displaySections).package_section_text ?? ""
              }
              onChange={(v) => set("package_section_text", v)}
              type="textarea"
              isEditing={isEditing}
            />
            {/* Package includes */}
            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>// Ingår i paketet</SectionLabel>
                {isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      set("package_includes", [
                        ...(draft.package_includes ?? []),
                        "",
                      ])
                    }
                  >
                    + Lägg till
                  </Button>
                )}
              </div>
              <ul className="mt-1 space-y-1">
                {(
                  (isEditing ? draft : displaySections).package_includes ?? []
                ).map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-green-600 shrink-0">✓</span>
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          value={item}
                          onChange={(e) =>
                            set(
                              "package_includes",
                              draft.package_includes?.map((v, j) =>
                                j === i ? e.target.value : v,
                              ),
                            )
                          }
                          className="text-sm bg-transparent border-b border-dashed flex-1 outline-none focus:border-foreground"
                          placeholder="Ingår"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1 text-xs text-destructive hover:text-destructive"
                          onClick={() =>
                            set(
                              "package_includes",
                              draft.package_includes?.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-sm">{item}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            {/* Upgrade package */}
            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>// Uppgraderingstillägg</SectionLabel>
                {isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      set(
                        "upgrade_package",
                        draft.upgrade_package == null
                          ? { ...DEFAULT_UPGRADE_PACKAGE }
                          : null,
                      )
                    }
                  >
                    {draft.upgrade_package == null ? "Aktivera" : "Dölj i PDF"}
                  </Button>
                )}
              </div>
              {(isEditing
                ? draft.upgrade_package
                : displaySections.upgrade_package) == null ? (
                <p className="text-xs text-muted-foreground italic">
                  Uppgraderingstillägg dolt i PDF.
                </p>
              ) : (
                <div className="space-y-2">
                  {isEditing && draft.upgrade_package ? (
                    <>
                      <input
                        type="text"
                        value={draft.upgrade_package.title}
                        onChange={(e) =>
                          set("upgrade_package", {
                            ...draft.upgrade_package!,
                            title: e.target.value,
                          })
                        }
                        className="text-sm font-semibold bg-transparent border-b border-dashed w-full outline-none focus:border-foreground"
                        placeholder="Titel"
                      />
                      <Textarea
                        value={draft.upgrade_package.description}
                        onChange={(e) =>
                          set("upgrade_package", {
                            ...draft.upgrade_package!,
                            description: e.target.value,
                          })
                        }
                        rows={2}
                        className="text-xs resize-y"
                        placeholder="Beskrivning"
                      />
                      <input
                        type="text"
                        value={draft.upgrade_package.price}
                        onChange={(e) =>
                          set("upgrade_package", {
                            ...draft.upgrade_package!,
                            price: e.target.value,
                          })
                        }
                        className="text-sm bg-transparent border-b border-dashed w-full outline-none focus:border-foreground"
                        placeholder="Pris (ex: Offert på begäran)"
                      />
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold">
                        {displaySections.upgrade_package?.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {displaySections.upgrade_package?.description}
                      </p>
                      <p className="text-xs font-medium">
                        {displaySections.upgrade_package?.price}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
            <ScalarField
              label="Fördelar-rubrik (upgrade)"
              value={
                (isEditing ? draft : displaySections).upgrade_benefits_title ??
                ""
              }
              onChange={(v) => set("upgrade_benefits_title", v)}
              isEditing={isEditing}
            />
          </AccordionContent>
        </AccordionItem>

        {/* ── 4. Referensprojekt ── */}
        <AccordionItem value="references">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:no-underline">
            Referensprojekt
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <ScalarField
              label="Sektionsrubrik"
              value={
                (isEditing ? draft : displaySections).reference_section_title ??
                ""
              }
              onChange={(v) => set("reference_section_title", v)}
              isEditing={isEditing}
            />
            <ScalarField
              label="Sektionstext"
              value={
                (isEditing ? draft : displaySections).reference_section_text ??
                ""
              }
              onChange={(v) => set("reference_section_text", v)}
              type="textarea"
              isEditing={isEditing}
            />
            <ScalarField
              label="CTA-länktext"
              value={
                (isEditing ? draft : displaySections).reference_cta_label ?? ""
              }
              onChange={(v) => set("reference_cta_label", v)}
              isEditing={isEditing}
            />
          </AccordionContent>
        </AccordionItem>

        {/* ── 5. Processen ── */}
        <AccordionItem value="process">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:no-underline">
            Processen
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <ScalarField
              label="Sektionsrubrik"
              value={
                (isEditing ? draft : displaySections).process_section_title ??
                ""
              }
              onChange={(v) => set("process_section_title", v)}
              isEditing={isEditing}
            />
            <ScalarField
              label="Sektionstext"
              value={
                (isEditing ? draft : displaySections).process_section_text ?? ""
              }
              onChange={(v) => set("process_section_text", v)}
              type="textarea"
              isEditing={isEditing}
            />
            <ArraySectionEditor
              items={(isEditing ? draft : displaySections).process_steps ?? []}
              maxVisible={4}
              fields={[
                {
                  key: "number",
                  label: "Nummer",
                  type: "text",
                  readOnly: true,
                },
                { key: "title", label: "Titel", type: "text" },
                { key: "text", label: "Beskrivning", type: "textarea" },
              ]}
              onChange={(items) => set("process_steps", items)}
              isEditing={isEditing}
              itemLabel={(i) => `Steg ${i + 1}`}
            />
          </AccordionContent>
        </AccordionItem>

        {/* ── 6. Support & äganderätt ── */}
        <AccordionItem value="support">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:no-underline">
            Support &amp; äganderätt
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <ScalarField
              label="Sektionsrubrik"
              value={
                (isEditing ? draft : displaySections).support_section_title ??
                ""
              }
              onChange={(v) => set("support_section_title", v)}
              isEditing={isEditing}
            />
            <ArraySectionEditor
              items={(isEditing ? draft : displaySections).support_cards ?? []}
              maxVisible={4}
              fields={[
                { key: "icon", label: "Ikon", type: "text", readOnly: true },
                { key: "title", label: "Titel", type: "text" },
                { key: "text", label: "Beskrivning", type: "textarea" },
              ]}
              onChange={(items) => set("support_cards", items)}
              isEditing={isEditing}
              itemLabel={(i) => `Kort ${i + 1}`}
            />
          </AccordionContent>
        </AccordionItem>

        {/* ── 7. Teknik ── */}
        <AccordionItem value="tech">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:no-underline">
            Teknik
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <ScalarField
              label="Sektionsrubrik"
              value={
                (isEditing ? draft : displaySections).tech_section_title ?? ""
              }
              onChange={(v) => set("tech_section_title", v)}
              isEditing={isEditing}
            />
            <ArraySectionEditor
              items={(isEditing ? draft : displaySections).tech_items ?? []}
              maxVisible={4}
              fields={[
                { key: "icon", label: "Ikon", type: "text", readOnly: true },
                { key: "title", label: "Titel", type: "text" },
                { key: "text", label: "Beskrivning", type: "textarea" },
              ]}
              onChange={(items) => set("tech_items", items)}
              isEditing={isEditing}
              itemLabel={(i) => `Item ${i + 1}`}
            />
          </AccordionContent>
        </AccordionItem>

        {/* ── 8. Om oss ── */}
        <AccordionItem value="about">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:no-underline">
            Om oss
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <ScalarField
              label="Sektionsrubrik"
              value={
                (isEditing ? draft : displaySections).about_section_title ?? ""
              }
              onChange={(v) => set("about_section_title", v)}
              isEditing={isEditing}
            />
            <ScalarField
              label="Sektionstext"
              value={
                (isEditing ? draft : displaySections).about_section_text ?? ""
              }
              onChange={(v) => set("about_section_text", v)}
              type="textarea"
              isEditing={isEditing}
            />
            <ArraySectionEditor
              items={(isEditing ? draft : displaySections).founders ?? []}
              maxVisible={2}
              fields={[
                {
                  key: "initials",
                  label: "Initialer",
                  type: "text",
                  readOnly: true,
                },
                { key: "name", label: "Namn", type: "text" },
                { key: "role", label: "Roll", type: "text" },
                { key: "description", label: "Beskrivning", type: "textarea" },
              ]}
              onChange={(items) => set("founders", items)}
              isEditing={isEditing}
              itemLabel={(i) => `Person ${i + 1}`}
            />
            <ArraySectionEditor
              items={(isEditing ? draft : displaySections).about_facts ?? []}
              maxVisible={4}
              fields={[
                { key: "value", label: "Värde", type: "text" },
                { key: "label", label: "Etikett", type: "text" },
              ]}
              onChange={(items) => set("about_facts", items)}
              isEditing={isEditing}
              itemLabel={(i) => `Fakta ${i + 1}`}
            />
          </AccordionContent>
        </AccordionItem>

        {/* ── 9. Pris & villkor ── */}
        <AccordionItem value="price">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:no-underline">
            Pris &amp; villkor
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <ScalarField
              label="Pris-sammanfattning rubrik"
              value={
                (isEditing ? draft : displaySections).price_summary_title ?? ""
              }
              onChange={(v) => set("price_summary_title", v)}
              isEditing={isEditing}
            />
            <ScalarField
              label="Villkors-rubrik"
              value={
                (isEditing ? draft : displaySections).terms_section_title ?? ""
              }
              onChange={(v) => set("terms_section_title", v)}
              isEditing={isEditing}
            />
            {/* Price summary bullets */}
            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>// Prissammanfattning – punkter</SectionLabel>
                {isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      set("price_summary_bullets", [
                        ...(draft.price_summary_bullets ?? []),
                        "",
                      ])
                    }
                  >
                    + Lägg till
                  </Button>
                )}
              </div>
              <ul className="space-y-1">
                {(
                  (isEditing ? draft : displaySections).price_summary_bullets ??
                  []
                ).map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="text-green-600 shrink-0">✓</span>
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          value={item}
                          onChange={(e) =>
                            set(
                              "price_summary_bullets",
                              draft.price_summary_bullets?.map((v, j) =>
                                j === i ? e.target.value : v,
                              ),
                            )
                          }
                          className="text-sm bg-transparent border-b border-dashed flex-1 outline-none focus:border-foreground"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1 text-xs text-destructive hover:text-destructive"
                          onClick={() =>
                            set(
                              "price_summary_bullets",
                              draft.price_summary_bullets?.filter(
                                (_, j) => j !== i,
                              ),
                            )
                          }
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-sm">{item}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ── 10. Offerttext ── */}
        <AccordionItem value="proposal">
          <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:no-underline">
            Offerttext (AI-genererad)
          </AccordionTrigger>
          <AccordionContent>
            <div className="p-4 border rounded-md bg-muted/30">
              {isEditing ? (
                <Textarea
                  value={draft.proposal_body ?? ""}
                  onChange={(e) => set("proposal_body", e.target.value)}
                  rows={10}
                  className="resize-y text-sm leading-6"
                />
              ) : (
                <div className="text-sm leading-6 whitespace-pre-wrap">
                  {displaySections.proposal_body}
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
