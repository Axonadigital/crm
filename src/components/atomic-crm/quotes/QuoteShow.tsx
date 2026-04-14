import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  ShowBase,
  useDataProvider,
  useNotify,
  useRecordContext,
  useRedirect,
  useRefresh,
  useTranslate,
} from "ra-core";
import {
  Send,
  Sparkles,
  Download,
  ExternalLink,
  Eye,
  Pencil,
  Check,
  X,
  Copy,
  FileCheck,
} from "lucide-react";
import { EditButton } from "@/components/admin/edit-button";
import { DeleteWithConfirmButton } from "@/components/admin/delete-with-confirm-button";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";

import { CompanyAvatar } from "../companies/CompanyAvatar";
import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { MobileBackButton } from "../misc/MobileBackButton";
import type { Quote, QuoteGeneratedSections } from "../types";
import { quoteStatusColors } from "./quoteStatuses";

export const QuoteShow = ({ open, id }: { open: boolean; id?: string }) => {
  const isMobile = useIsMobile();
  const redirect = useRedirect();
  const handleClose = () => {
    redirect("list", "quotes");
  };

  if (isMobile) {
    return id ? (
      <ShowBase id={id}>
        <QuoteShowMobileWrapper />
      </ShowBase>
    ) : null;
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="lg:max-w-4xl p-4 overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
        {id ? (
          <ShowBase id={id}>
            <QuoteShowContent />
          </ShowBase>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

const QuoteShowMobileWrapper = () => {
  const record = useRecordContext<Quote>();
  const translate = useTranslate();

  if (!record) return null;

  const displayText = record.custom_text || record.generated_text;
  const fmtNum = (n: number) =>
    Number(n).toLocaleString("sv-SE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <>
      <MobileHeader>
        <MobileBackButton />
        <div className="flex flex-1 min-w-0">
          <h1 className="truncate text-xl font-semibold">{record.title}</h1>
        </div>
        <DeleteWithConfirmButton redirect="/quotes" size="icon" label="" />
        {record.status === "draft" && <EditButton />}
      </MobileHeader>
      <MobileContent>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <ReferenceField source="company_id" reference="companies" link="show">
            <CompanyAvatar width={40} height={40} />
          </ReferenceField>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold truncate">{record.title}</h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge variant={quoteStatusColors[record.status]}>
                {translate(`resources.quotes.statuses.${record.status}`, {
                  _: record.status,
                })}
              </Badge>
              {record.quote_number && (
                <span className="text-sm text-muted-foreground">
                  {record.quote_number}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <MetaFieldMobile
            label={translate("resources.quotes.fields.total_amount", {
              _: "Total inkl. moms",
            })}
            value={`${fmtNum(record.total_amount)} ${record.currency}`}
            bold
          />
          <MetaFieldMobile
            label={translate("resources.quotes.fields.subtotal", {
              _: "Subtotal",
            })}
            value={`${fmtNum(record.subtotal)} ${record.currency}`}
          />
          {record.discount_percent > 0 && (
            <MetaFieldMobile
              label={translate("resources.quotes.fields.discount_percent", {
                _: "Rabatt",
              })}
              value={`${record.discount_percent}%`}
            />
          )}
          <MetaFieldMobile
            label={translate("resources.quotes.fields.vat_rate", { _: "Moms" })}
            value={`${record.vat_rate}%`}
          />
          {record.valid_until && (
            <MetaFieldMobile
              label={translate("resources.quotes.fields.valid_until", {
                _: "Giltig till",
              })}
              value={new Date(record.valid_until).toLocaleDateString("sv-SE")}
            />
          )}
          {record.payment_terms && (
            <MetaFieldMobile
              label={translate("resources.quotes.fields.payment_terms", {
                _: "Betalningsvillkor",
              })}
              value={record.payment_terms}
            />
          )}
        </div>

        <Separator className="my-4" />

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <DuplicateQuoteButton />
          {(record.status === "draft" || record.status === "generated") && (
            <GenerateTextButton />
          )}
          {(record.status === "draft" || record.status === "generated") && (
            <PreviewPdfButton />
          )}
          {(record.status === "generated" || record.status === "draft") &&
            displayText && <PreviewContractButton />}
          {(record.status === "generated" || record.status === "draft") &&
            displayText && <SendForSigningButton />}
          {record.pdf_url && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={record.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="w-4 h-4 mr-1" />
                {translate("resources.quotes.action.download_pdf", {
                  _: "Ladda ner PDF",
                })}
              </a>
            </Button>
          )}
        </div>

        {/* Text sections */}
        {displayText && (
          <>
            <Separator className="mb-4" />
            <EditableField
              field="custom_text"
              labelKey="resources.quotes.fields.generated_text"
              labelFallback="Offerttext"
              rows={8}
            />
          </>
        )}

        {record.generated_sections && (
          <PremiumSectionsPreview
            sections={record.generated_sections}
            accentColor={record.accent_color}
          />
        )}

        {record.notes_internal && (
          <div className="mt-4">
            <span className="text-xs text-muted-foreground tracking-wide">
              {translate("resources.quotes.fields.notes_internal", {
                _: "Interna anteckningar",
              })}
            </span>
            <div className="mt-2 p-3 border rounded-md bg-yellow-50 dark:bg-yellow-950/30 whitespace-pre-wrap text-sm leading-6 border-yellow-200 dark:border-yellow-800">
              {record.notes_internal}
            </div>
          </div>
        )}
      </MobileContent>
    </>
  );
};

const MetaFieldMobile = ({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) => (
  <div className="flex flex-col">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={`text-sm ${bold ? "font-semibold" : ""}`}>{value}</span>
  </div>
);

const QuoteShowContent = () => {
  const translate = useTranslate();
  const record = useRecordContext<Quote>();
  if (!record) return null;

  const displayText = record.custom_text || record.generated_text;
  const fmtNum = (n: number) =>
    Number(n).toLocaleString("sv-SE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="space-y-2">
      <div className="flex-1">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div className="flex items-center gap-4">
            <ReferenceField
              source="company_id"
              reference="companies"
              link="show"
            >
              <CompanyAvatar />
            </ReferenceField>
            <div>
              <h2 className="text-2xl font-semibold">{record.title}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={quoteStatusColors[record.status]}>
                  {translate(`resources.quotes.statuses.${record.status}`, {
                    _: record.status,
                  })}
                </Badge>
                {record.quote_number && (
                  <span className="text-sm text-muted-foreground">
                    {record.quote_number}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pr-12">
            <DeleteWithConfirmButton redirect="/quotes" />
            {record.status === "draft" && <EditButton />}
            <DuplicateQuoteButton />
          </div>
        </div>

        {/* Key metrics */}
        <div className="flex gap-8 m-4 flex-wrap">
          <MetaField
            label={translate("resources.quotes.fields.subtotal", {
              _: "Subtotal",
            })}
            value={`${fmtNum(record.subtotal)} ${record.currency}`}
          />

          {record.discount_percent > 0 && (
            <MetaField
              label={translate("resources.quotes.fields.discount_percent", {
                _: "Discount",
              })}
              value={`${record.discount_percent}%`}
            />
          )}

          <MetaField
            label={translate("resources.quotes.fields.vat_rate", {
              _: "VAT",
            })}
            value={`${record.vat_rate}% (${fmtNum(record.vat_amount)} ${record.currency})`}
          />

          <MetaField
            label={translate("resources.quotes.fields.total_amount", {
              _: "Total incl. VAT",
            })}
            value={`${fmtNum(record.total_amount)} ${record.currency}`}
            bold
          />

          {record.valid_until && (
            <MetaField
              label={translate("resources.quotes.fields.valid_until", {
                _: "Valid until",
              })}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {new Date(record.valid_until).toLocaleDateString("sv-SE")}
                </span>
                {new Date(record.valid_until) < new Date() && (
                  <Badge variant="destructive">
                    {translate("resources.quotes.statuses.expired", {
                      _: "Expired",
                    })}
                  </Badge>
                )}
              </div>
            </MetaField>
          )}

          <MetaField
            label={translate("resources.quotes.fields.created_at", {
              _: "Created",
            })}
            value={new Date(record.created_at).toLocaleDateString("sv-SE")}
          />

          {record.sent_at && (
            <MetaField
              label={translate("resources.quotes.fields.sent_at", {
                _: "Sent",
              })}
              value={new Date(record.sent_at).toLocaleDateString("sv-SE")}
            />
          )}

          {record.signed_at && (
            <MetaField
              label={translate("resources.quotes.fields.signed_at", {
                _: "Signed",
              })}
              value={new Date(record.signed_at).toLocaleDateString("sv-SE")}
            />
          )}
        </div>

        {/* Payment & delivery terms */}
        {(record.payment_terms ||
          record.delivery_terms ||
          record.customer_reference) && (
          <div className="flex gap-8 m-4 flex-wrap">
            {record.payment_terms && (
              <MetaField
                label={translate("resources.quotes.fields.payment_terms", {
                  _: "Payment terms",
                })}
                value={record.payment_terms}
              />
            )}
            {record.delivery_terms && (
              <MetaField
                label={translate("resources.quotes.fields.delivery_terms", {
                  _: "Delivery terms",
                })}
                value={record.delivery_terms}
              />
            )}
            {record.customer_reference && (
              <MetaField
                label={translate("resources.quotes.fields.customer_reference", {
                  _: "Customer reference",
                })}
                value={record.customer_reference}
              />
            )}
          </div>
        )}

        {record.contact_id && (
          <div className="m-4">
            <span className="text-xs text-muted-foreground tracking-wide">
              {translate("resources.quotes.fields.contact_id", {
                _: "Contact",
              })}
            </span>
            <ReferenceField
              source="contact_id"
              reference="contacts_summary"
              link="show"
            >
              <ContactName />
            </ReferenceField>
          </div>
        )}

        <Separator className="my-4" />

        {/* Action buttons */}
        <div className="flex gap-2 m-4 flex-wrap">
          {(record.status === "draft" || record.status === "generated") && (
            <GenerateTextButton />
          )}
          {(record.status === "draft" || record.status === "generated") && (
            <PreviewPdfButton />
          )}
          {(record.status === "generated" || record.status === "draft") &&
            displayText && <PreviewContractButton />}
          {(record.status === "generated" || record.status === "draft") &&
            displayText && <SendForSigningButton />}
          {record.pdf_url && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={record.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="w-4 h-4 mr-1" />
                {translate("resources.quotes.action.download_pdf", {
                  _: "Download PDF",
                })}
              </a>
            </Button>
          )}
          {record.docuseal_document_url && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={record.docuseal_document_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                {translate("resources.quotes.action.view_signed", {
                  _: "View signed document",
                })}
              </a>
            </Button>
          )}
        </div>

        {/* Premium sections preview */}
        {record.generated_sections && (
          <PremiumSectionsPreview
            sections={record.generated_sections}
            accentColor={record.accent_color}
          />
        )}

        {/* Generated/Custom text preview */}
        {displayText && (
          <div className="m-4">
            <Separator className="mb-4" />
            <EditableField
              field="custom_text"
              labelKey="resources.quotes.fields.generated_text"
              labelFallback="Quote text"
              rows={12}
            />
          </div>
        )}

        {/* Terms & conditions */}
        {(record.terms_and_conditions ||
          record.status === "draft" ||
          record.status === "generated") && (
          <div className="m-4">
            <EditableField
              field="terms_and_conditions"
              labelKey="resources.quotes.fields.terms_and_conditions"
              labelFallback="Terms & Conditions"
            />
          </div>
        )}

        {/* Internal notes */}
        {record.notes_internal && (
          <div className="m-4">
            <span className="text-xs text-muted-foreground tracking-wide">
              {translate("resources.quotes.fields.notes_internal", {
                _: "Internal Notes",
              })}
            </span>
            <div className="mt-2 p-3 border rounded-md bg-yellow-50 dark:bg-yellow-950/30 whitespace-pre-wrap text-sm leading-6 border-yellow-200 dark:border-yellow-800">
              {record.notes_internal}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MetaField = ({
  label,
  value,
  bold,
  children,
}: {
  label: string;
  value?: string;
  bold?: boolean;
  children?: React.ReactNode;
}) => (
  <div className="flex flex-col mr-10">
    <span className="text-xs text-muted-foreground tracking-wide">{label}</span>
    {children ?? (
      <span className={`text-sm ${bold ? "font-semibold" : ""}`}>{value}</span>
    )}
  </div>
);

const ContactName = () => {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <span className="text-sm">
      {record.first_name} {record.last_name}
    </span>
  );
};

const EditableField = ({
  field,
  labelKey,
  labelFallback,
  rows = 4,
}: {
  field: string;
  labelKey: string;
  labelFallback: string;
  rows?: number;
}) => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const record = useRecordContext<Quote>();
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");

  const { mutate: saveField, isPending } = useMutation({
    mutationFn: () =>
      dataProvider.update("quotes", {
        id: record!.id,
        data: { [field]: editedText },
        previousData: record,
      }),
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

  if (!record) return null;

  const currentValue = String(record[field as keyof Quote] ?? "");
  const canEdit = record.status === "draft" || record.status === "generated";

  const handleStartEdit = () => {
    setEditedText(currentValue);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedText("");
  };

  if (!currentValue && !canEdit) return null;

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground tracking-wide">
          {translate(labelKey, { _: labelFallback })}
        </span>
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
              onClick={() => saveField()}
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
      {isEditing ? (
        <Textarea
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          rows={rows}
          className="mt-2 resize-y text-sm leading-6"
          autoFocus
        />
      ) : currentValue ? (
        <div className="mt-2 p-4 border rounded-md bg-muted/30 whitespace-pre-wrap text-sm leading-6">
          {currentValue}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground italic">
          {translate("resources.quotes.fields.no_content", {
            _: "No content yet. Click Edit to add.",
          })}
        </p>
      )}
    </>
  );
};

// EditableQuoteText replaced by EditableField with field="custom_text"

const PremiumSectionsPreview = ({
  sections,
  accentColor,
}: {
  sections: QuoteGeneratedSections;
  accentColor?: string;
}) => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const record = useRecordContext<Quote>();
  const accent = accentColor || "#2563eb";
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<QuoteGeneratedSections>(sections);

  const canEdit = record?.status === "draft" || record?.status === "generated";

  const { mutate: saveSections, isPending } = useMutation({
    mutationFn: () =>
      dataProvider.update("quotes", {
        id: record!.id,
        data: { generated_sections: draft },
        previousData: record,
      }),
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
    setDraft({
      ...sections,
      highlight_cards: sections.highlight_cards?.map((c) => ({ ...c })) ?? [],
      problem_cards: sections.problem_cards?.map((c) => ({ ...c })) ?? [],
      package_includes: sections.package_includes
        ? [...sections.package_includes]
        : [],
    });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDraft(sections);
  };

  const updateCard = (
    index: number,
    field: keyof QuoteGeneratedSections["highlight_cards"][number],
    value: string,
  ) => {
    setDraft((prev) => ({
      ...prev,
      highlight_cards: prev.highlight_cards.map((card, i) =>
        i === index ? { ...card, [field]: value } : card,
      ),
    }));
  };

  return (
    <div className="m-4">
      <Separator className="mb-4" />
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

      {/* Summary pitch */}
      <div className="p-4 border rounded-md bg-muted/30 mb-4">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          // Sammanfattning
        </span>
        {isEditing ? (
          <Textarea
            value={draft.summary_pitch}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, summary_pitch: e.target.value }))
            }
            rows={3}
            className="mt-2 resize-y text-sm leading-6"
          />
        ) : (
          <p className="mt-2 text-sm leading-6">{sections.summary_pitch}</p>
        )}
      </div>

      {/* Highlight cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {(isEditing ? draft.highlight_cards : sections.highlight_cards)?.map(
          (card, i) => (
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
                    onChange={(e) => updateCard(i, "icon", e.target.value)}
                    className="text-xs text-muted-foreground bg-transparent border-b border-dashed w-full mb-1 outline-none focus:border-foreground"
                    placeholder="Icon name"
                  />
                  <input
                    type="text"
                    value={card.title}
                    onChange={(e) => updateCard(i, "title", e.target.value)}
                    className="text-sm font-semibold bg-transparent border-b border-dashed w-full mb-1 outline-none focus:border-foreground"
                    placeholder="Title"
                  />
                  <Textarea
                    value={card.text}
                    onChange={(e) => updateCard(i, "text", e.target.value)}
                    rows={2}
                    className="text-xs resize-y mt-1"
                    placeholder="Description"
                  />
                </>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">
                    {card.icon}
                  </span>
                  <h4 className="text-sm font-semibold mt-1">{card.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {card.text}
                  </p>
                </>
              )}
            </div>
          ),
        )}
      </div>

      {/* Design demo description */}
      {(sections.design_demo_description || isEditing) && (
        <div className="p-3 border rounded-md bg-muted/20 mb-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            // Designdemo
          </span>
          {isEditing ? (
            <Textarea
              value={draft.design_demo_description || ""}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  design_demo_description: e.target.value || null,
                }))
              }
              rows={2}
              className="mt-1 resize-y text-sm"
              placeholder="Design demo description (leave empty to hide)"
            />
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {sections.design_demo_description}
            </p>
          )}
        </div>
      )}

      {/* Proposal body */}
      <div className="p-4 border rounded-md bg-muted/30 mb-4">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          // Offerttext
        </span>
        {isEditing ? (
          <Textarea
            value={draft.proposal_body}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, proposal_body: e.target.value }))
            }
            rows={10}
            className="mt-2 resize-y text-sm leading-6"
          />
        ) : (
          <div className="mt-2 text-sm leading-6 whitespace-pre-wrap">
            {sections.proposal_body}
          </div>
        )}
      </div>

      {/* Problem cards */}
      {((isEditing ? draft.problem_cards : sections.problem_cards) ?? [])
        .length > 0 || isEditing ? (
        <div className="p-4 border rounded-md bg-muted/30 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              // Problemkort
            </span>
            {isEditing && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    problem_cards: [
                      ...(prev.problem_cards ?? []),
                      {
                        number: String(
                          (prev.problem_cards?.length ?? 0) + 1,
                        ).padStart(2, "0"),
                        title: "",
                        text: "",
                      },
                    ],
                  }))
                }
              >
                + Lägg till
              </Button>
            )}
          </div>
          <div className="space-y-3 mt-2">
            {(isEditing ? draft.problem_cards : sections.problem_cards)?.map(
              (card, i) => (
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
                          setDraft((prev) => ({
                            ...prev,
                            problem_cards: prev.problem_cards?.map((c, j) =>
                              j === i ? { ...c, title: e.target.value } : c,
                            ),
                          }))
                        }
                        className="text-sm font-semibold bg-transparent border-b border-dashed w-full outline-none focus:border-foreground"
                        placeholder="Rubrik"
                      />
                      <Textarea
                        value={card.text}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            problem_cards: prev.problem_cards?.map((c, j) =>
                              j === i ? { ...c, text: e.target.value } : c,
                            ),
                          }))
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
                          setDraft((prev) => ({
                            ...prev,
                            problem_cards: prev.problem_cards?.filter(
                              (_, j) => j !== i,
                            ),
                          }))
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
              ),
            )}
          </div>
        </div>
      ) : null}

      {/* Package includes */}
      {((isEditing ? draft.package_includes : sections.package_includes) ?? [])
        .length > 0 || isEditing ? (
        <div className="p-4 border rounded-md bg-muted/30 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              // Ingår i paketet
            </span>
            {isEditing && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    package_includes: [...(prev.package_includes ?? []), ""],
                  }))
                }
              >
                + Lägg till
              </Button>
            )}
          </div>
          <ul className="mt-2 space-y-1">
            {(isEditing
              ? draft.package_includes
              : sections.package_includes
            )?.map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-green-600 shrink-0">✓</span>
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={item}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          package_includes: prev.package_includes?.map(
                            (v, j) => (j === i ? e.target.value : v),
                          ),
                        }))
                      }
                      className="text-sm bg-transparent border-b border-dashed flex-1 outline-none focus:border-foreground"
                      placeholder="Ingår"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-xs text-destructive hover:text-destructive"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          package_includes: prev.package_includes?.filter(
                            (_, j) => j !== i,
                          ),
                        }))
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
      ) : null}

      {/* Upgrade package */}
      {isEditing || sections.upgrade_package !== undefined ? (
        <div className="p-4 border rounded-md bg-muted/30 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              // Uppgraderingstillägg
            </span>
            {isEditing && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    upgrade_package:
                      prev.upgrade_package == null
                        ? {
                            title: "Flersidig hemsida",
                            description:
                              "Uppgradera till en flersidig hemsida med dedikerade undersidor.",
                            price: "Offert på begäran",
                            includes: [],
                            benefits: [],
                          }
                        : null,
                  }))
                }
              >
                {draft.upgrade_package == null ? "Aktivera" : "Dölj i PDF"}
              </Button>
            )}
          </div>
          {(isEditing ? draft.upgrade_package : sections.upgrade_package) ==
          null ? (
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
                      setDraft((prev) => ({
                        ...prev,
                        upgrade_package: prev.upgrade_package
                          ? { ...prev.upgrade_package, title: e.target.value }
                          : null,
                      }))
                    }
                    className="text-sm font-semibold bg-transparent border-b border-dashed w-full outline-none focus:border-foreground"
                    placeholder="Titel"
                  />
                  <Textarea
                    value={draft.upgrade_package.description}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        upgrade_package: prev.upgrade_package
                          ? {
                              ...prev.upgrade_package,
                              description: e.target.value,
                            }
                          : null,
                      }))
                    }
                    rows={2}
                    className="text-xs resize-y"
                    placeholder="Beskrivning"
                  />
                  <input
                    type="text"
                    value={draft.upgrade_package.price}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        upgrade_package: prev.upgrade_package
                          ? { ...prev.upgrade_package, price: e.target.value }
                          : null,
                      }))
                    }
                    className="text-sm bg-transparent border-b border-dashed w-full outline-none focus:border-foreground"
                    placeholder="Pris (ex: Offert på begäran)"
                  />
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold">
                    {sections.upgrade_package?.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {sections.upgrade_package?.description}
                  </p>
                  <p className="text-xs font-medium">
                    {sections.upgrade_package?.price}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

const PreviewPdfButton = () => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const record = useRecordContext<Quote>();
  const recordId = record?.id;

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (!recordId) throw new Error("No record");
      const data = await dataProvider.generateQuotePdf(recordId);
      return data as { pdf_url: string };
    },
    onSuccess: async (data: { pdf_url: string }) => {
      refresh();
      try {
        // Fetch the HTML and open via blob URL to ensure correct content-type
        const response = await fetch(data.pdf_url);
        const html = await response.text();
        const blob = new Blob([html], { type: "text/html" });
        const blobUrl = URL.createObjectURL(blob);
        const win = window.open(blobUrl, "_blank");
        // Clean up blob URL after the window loads
        if (win) {
          win.addEventListener("load", () => URL.revokeObjectURL(blobUrl));
        } else {
          // Fallback if popup blocked
          URL.revokeObjectURL(blobUrl);
          notify("resources.quotes.notifications.popup_blocked", {
            type: "warning",
            _: "Popup blocked - please allow popups for this site",
          });
        }
      } catch {
        // Fallback: open URL directly
        window.open(data.pdf_url, "_blank");
      }
    },
    onError: () => {
      notify("resources.quotes.notifications.pdf_generation_failed", {
        type: "error",
        _: "Failed to generate preview",
      });
    },
  });

  return (
    <Button
      onClick={() => mutate()}
      disabled={isPending}
      variant="outline"
      size="sm"
      className="flex items-center gap-2"
    >
      <Eye className="w-4 h-4" />
      {isPending
        ? translate("resources.quotes.action.generating_preview", {
            _: "Generating...",
          })
        : translate("resources.quotes.action.preview_pdf", {
            _: "Preview quote",
          })}
    </Button>
  );
};

const GenerateTextButton = () => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const record = useRecordContext<Quote>();
  const recordId = record?.id;

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      if (!recordId) throw new Error("No record");
      return dataProvider.generateQuoteText(recordId);
    },
    onSuccess: () => {
      notify("resources.quotes.notifications.text_generated", {
        type: "info",
        _: "Quote text generated successfully",
      });
      refresh();
    },
    onError: () => {
      notify("resources.quotes.notifications.text_generation_failed", {
        type: "error",
        _: "Failed to generate quote text",
      });
    },
  });

  return (
    <Button
      onClick={() => mutate()}
      disabled={isPending}
      size="sm"
      className="flex items-center gap-2"
    >
      <Sparkles className="w-4 h-4" />
      {isPending
        ? translate("resources.quotes.action.generating", {
            _: "Generating...",
          })
        : translate("resources.quotes.action.generate_text", {
            _: "Generate text with AI",
          })}
    </Button>
  );
};

const SendForSigningButton = () => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();
  const record = useRecordContext<Quote>();
  const recordId = record?.id;

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (!recordId) throw new Error("No record");
      await dataProvider.generateQuotePdf(recordId);
      return dataProvider.sendQuoteForSigning(recordId);
    },
    onSuccess: () => {
      notify("resources.quotes.notifications.sent_for_signing", {
        type: "info",
        _: "Quote sent for signing",
      });
      refresh();
    },
    onError: () => {
      notify("resources.quotes.notifications.sending_failed", {
        type: "error",
        _: "Failed to send quote for signing",
      });
    },
  });

  return (
    <Button
      onClick={() => mutate()}
      disabled={isPending}
      variant="outline"
      size="sm"
      className="flex items-center gap-2"
    >
      <Send className="w-4 h-4" />
      {isPending
        ? translate("resources.quotes.action.sending", { _: "Sending..." })
        : translate("resources.quotes.action.send_for_signing", {
            _: "Send for signing",
          })}
    </Button>
  );
};

interface ContractField {
  name: string;
  value: string;
}

function formatCurrencySv(amount: number, currency = "SEK"): string {
  const suffix = currency === "SEK" ? " kr" : ` ${currency}`;
  const formatted = amount.toLocaleString("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted}${suffix}`;
}

const PreviewContractButton = () => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const record = useRecordContext<Quote>();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<ContractField[]>([]);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (!record) throw new Error("No record");

      let companyName = "";
      if (record.company_id) {
        const { data: company } = await dataProvider.getOne("companies", {
          id: record.company_id,
        });
        companyName = company?.name || "";
      }

      let contactName = "";
      let contactEmail = "";
      if (record.contact_id) {
        const { data: contact } = await dataProvider.getOne(
          "contacts_summary",
          { id: record.contact_id },
        );
        contactName =
          [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") ||
          "";
        contactEmail = contact?.email || "";
      }

      const { data: lineItems } = await dataProvider.getList(
        "quote_line_items",
        {
          filter: { quote_id: record.id },
          sort: { field: "sort_order", order: "ASC" },
          pagination: { page: 1, perPage: 100 },
        },
      );

      const currency = record.currency || "SEK";
      const today = new Date().toLocaleDateString("sv-SE");
      const validUntil = record.valid_until
        ? new Date(record.valid_until).toLocaleDateString("sv-SE")
        : "";

      const itemBullets =
        lineItems && lineItems.length > 0
          ? lineItems
              .map((item: { description: string }) => `• ${item.description}`)
              .join("\n")
          : "";
      const scopeOfWork = itemBullets
        ? `Uppdraget omfattar:\n${itemBullets}\n\nSe bifogad offert för fullständig beskrivning.`
        : "Se bifogad offert för fullständig beskrivning.";

      const lineItemsText =
        lineItems && lineItems.length > 0
          ? lineItems
              .map(
                (item: {
                  description: string;
                  quantity: number;
                  unit_price: number;
                  total: number;
                }) => {
                  const qty = Number(item.quantity);
                  const price = formatCurrencySv(
                    Number(item.unit_price),
                    currency,
                  );
                  const total = formatCurrencySv(Number(item.total), currency);
                  return `${item.description}  |  ${qty} x ${price}  =  ${total}`;
                },
              )
              .join("\n")
          : "Inga rader";

      const proposalUrl =
        record.pdf_url ||
        `${window.location.origin}/quote.html?id=${record.id}`;

      const result: ContractField[] = [
        { name: "Offertnummer", value: record.quote_number || `#${record.id}` },
        { name: "Datum", value: today },
        { name: "Giltig till", value: validUntil || "—" },
        { name: "Foretag", value: companyName },
        { name: "Kontaktperson", value: `${contactName} (${contactEmail})` },
        { name: "Uppdragsbeskrivning", value: scopeOfWork },
        { name: "Prislista", value: lineItemsText },
        {
          name: "Totalt",
          value: formatCurrencySv(record.total_amount || 0, currency),
        },
        {
          name: "Betalningsvillkor",
          value: record.payment_terms || "30 dagar netto",
        },
        {
          name: "Villkor",
          value:
            record.terms_and_conditions || "Standardvillkor enligt offert.",
        },
        { name: "Offertlank", value: proposalUrl },
      ];

      return result;
    },
    onSuccess: (data: ContractField[]) => {
      setFields(data);
      setOpen(true);
    },
    onError: () => {
      notify("resources.quotes.notifications.preview_contract_failed", {
        type: "error",
        _: "Kunde inte förhandsgranska kontraktet",
      });
    },
  });

  return (
    <>
      <Button
        onClick={() => mutate()}
        disabled={isPending}
        variant="outline"
        size="sm"
        className="flex items-center gap-2"
      >
        <FileCheck className="w-4 h-4" />
        {isPending
          ? translate("resources.quotes.action.loading_contract_preview", {
              _: "Laddar...",
            })
          : translate("resources.quotes.action.preview_contract", {
              _: "Förhandsgranska kontrakt",
            })}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="lg:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {translate("resources.quotes.action.contract_preview_title", {
                _: "Förhandsgranskning — DocuSeal-kontrakt",
              })}
            </DialogTitle>
            <DialogDescription>
              {translate(
                "resources.quotes.action.contract_preview_description",
                {
                  _: "Dessa fält skickas till DocuSeal när du trycker Skicka för signering. Kontrollera att allt stämmer.",
                },
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {fields.map((field) => (
              <div key={field.name} className="border rounded-md p-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {field.name}
                </span>
                <div className="mt-1 text-sm whitespace-pre-wrap break-words leading-6">
                  {field.name === "Offertlank" ? (
                    <a
                      href={field.value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {field.value}
                    </a>
                  ) : (
                    field.value
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const DuplicateQuoteButton = () => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const redirect = useRedirect();
  const record = useRecordContext<Quote>();
  const recordId = record?.id;

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (!recordId) throw new Error("No record");
      return dataProvider.duplicateQuote(recordId) as Promise<{ id: number }>;
    },
    onSuccess: (data: { id: number }) => {
      notify("resources.quotes.notifications.duplicated", {
        type: "info",
        _: "Quote duplicated",
      });
      redirect("edit", "quotes", data.id);
    },
    onError: () => {
      notify("resources.quotes.notifications.duplicate_failed", {
        type: "error",
        _: "Failed to duplicate quote",
      });
    },
  });

  return (
    <Button
      onClick={() => mutate()}
      disabled={isPending}
      variant="outline"
      size="sm"
      className="flex items-center gap-2"
    >
      <Copy className="w-4 h-4" />
      {isPending
        ? translate("resources.quotes.action.duplicating", {
            _: "Duplicating...",
          })
        : translate("resources.quotes.action.duplicate", {
            _: "Duplicate",
          })}
    </Button>
  );
};
