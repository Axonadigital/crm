import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { Identifier } from "ra-core";
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
  Link,
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
import type { Quote } from "../types";
import { QuotePipelineView } from "./QuotePipelineView";
import { PremiumSectionsAccordion } from "./QuoteSectionEditor";
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
        <DialogTitle className="sr-only">Offert</DialogTitle>
        {id ? (
          <ShowBase id={id}>
            <QuoteShowContent />
          </ShowBase>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// URL helper — builds the customer-facing quote link (NOT the pdf_url artifact).
// Used by CopyCustomerLinkButton and PreviewContractButton.
// ─────────────────────────────────────────────────────────────────────────────

function buildCustomerQuoteUrl(
  id: Identifier,
  approvalToken?: string | null,
): string {
  const base = `${window.location.origin}/quote.html?id=${id}`;
  return approvalToken ? `${base}&token=${approvalToken}` : base;
}

// ─────────────────────────────────────────────────────────────────────────────
// CopyCustomerLinkButton — copies the real customer link to clipboard.
// Visible only when a PDF artifact exists (serve_quote has html_content to serve)
// and the quote is not declined or expired.
// ─────────────────────────────────────────────────────────────────────────────

function CopyCustomerLinkButton() {
  const record = useRecordContext<Quote>();
  const notify = useNotify();
  const translate = useTranslate();

  if (!record) return null;
  if (!record.pdf_url || ["declined", "expired"].includes(record.status))
    return null;

  const handleCopy = () => {
    const url = buildCustomerQuoteUrl(record.id, record.approval_token);
    navigator.clipboard.writeText(url).then(
      () =>
        notify("resources.quotes.notifications.link_copied", {
          type: "info",
          _: "Länk kopierad",
        }),
      () =>
        notify("resources.quotes.notifications.link_copy_failed", {
          type: "warning",
          _: "Kunde inte kopiera länken",
        }),
    );
  };

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      <Link className="w-4 h-4 mr-1" />
      {translate("resources.quotes.actions.copy_link", { _: "Kundlänk" })}
    </Button>
  );
}

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
          <CopyCustomerLinkButton />
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

        {/* Phase 7: pipeline observability — default collapsed. */}
        <QuotePipelineView quoteId={record.id} />

        <PremiumSectionsAccordion
          sections={record.generated_sections ?? undefined}
          accentColor={record.accent_color}
        />

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
          <CopyCustomerLinkButton />
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

        {/* Phase 7: pipeline observability — default collapsed. */}
        <QuotePipelineView quoteId={record.id} />

        {/* Premium sections editor */}
        <PremiumSectionsAccordion
          sections={record.generated_sections ?? undefined}
          accentColor={record.accent_color}
        />

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
      return data as { pdf_url: string; html_content: string };
    },
    onSuccess: async (data: { pdf_url: string; html_content: string }) => {
      refresh();

      // Internal seller preview must use the editable html_content variant
      // (carries the real write_token so the WYSIWYG editor can save).
      // pdf_url points to the sanitized public artifact in Storage and
      // would render the customer-facing version with no edit button —
      // that was the regression the post-deploy review caught.
      const html = data.html_content;
      if (!html) {
        // Defensive fallback: if the edge function ever stops returning
        // html_content, fall back to opening pdf_url directly so the
        // preview at least loads (read-only).
        window.open(data.pdf_url, "_blank");
        return;
      }

      try {
        const blob = new Blob([html], { type: "text/html" });
        const blobUrl = URL.createObjectURL(blob);
        const win = window.open(blobUrl, "_blank");
        if (win) {
          win.addEventListener("load", () => URL.revokeObjectURL(blobUrl));
        } else {
          URL.revokeObjectURL(blobUrl);
          notify("resources.quotes.notifications.popup_blocked", {
            type: "warning",
            _: "Popup blocked - please allow popups for this site",
          });
        }
      } catch {
        // Browser refused the blob URL for some reason; surface the
        // sanitized public version as a last resort so the seller
        // at least gets a read-only preview.
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

      // Include approval_token so this link continues to work when
      // Always use the real customer-facing URL, never the pdf_url artifact.
      // Include approval_token so this link continues to work when
      // QUOTE_PUBLIC_TOKEN_ENFORCEMENT is eventually flipped on.
      // Do NOT flip that flag until production SQL-check confirms no
      // legacy tokenless links are still active (see Fas 5 preflight).
      const proposalUrl = buildCustomerQuoteUrl(
        record.id,
        record.approval_token,
      );

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
