import { required, useTranslate } from "ra-core";
import { ReferenceInput } from "@/components/admin/reference-input";
import { TextInput } from "@/components/admin/text-input";
import { DateInput } from "@/components/admin/date-input";
import { NumberInput } from "@/components/admin/number-input";
import { SelectInput } from "@/components/admin/select-input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { useInput } from "ra-core";

import { AutocompleteCompanyInput } from "../companies/AutocompleteCompanyInput";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { QuoteLineItems } from "./QuoteLineItems";

export const QuoteInputs = () => {
  const isMobile = useIsMobile();
  return (
    <div className="flex flex-col gap-8">
      <QuoteInfoInputs />

      <div className={`flex gap-6 ${isMobile ? "flex-col" : "flex-row"}`}>
        <QuoteLinkedToInputs />
        <Separator orientation={isMobile ? "horizontal" : "vertical"} />
        <QuoteMiscInputs />
      </div>

      <Separator />
      <QuoteLineItems />

      <Separator />
      <QuoteTermsInputs />
    </div>
  );
};

const QuoteInfoInputs = () => {
  const translate = useTranslate();
  return (
    <div className="flex flex-col gap-4 flex-1">
      <TextInput
        source="title"
        validate={required()}
        helperText={false}
        label="resources.quotes.fields.title"
      />
      <SelectInput
        source="template_type"
        helperText={false}
        defaultValue="default"
        label="resources.quotes.fields.template_type"
        choices={[
          {
            id: "default",
            name: translate("resources.quotes.templates.default") || "Standard",
          },
          {
            id: "webb",
            name: translate("resources.quotes.templates.webb") || "Webb",
          },
          {
            id: "webb-med-support",
            name:
              translate("resources.quotes.templates.webb_med_support") ||
              "Webb med support",
          },
          {
            id: "seo",
            name: translate("resources.quotes.templates.seo") || "SEO",
          },
          {
            id: "ai-konsult",
            name:
              translate("resources.quotes.templates.ai_konsult") ||
              "AI-konsult",
          },
          {
            id: "drift",
            name:
              translate("resources.quotes.templates.drift") ||
              "Drift & Underhåll",
          },
        ]}
      />
    </div>
  );
};

const QuoteLinkedToInputs = () => {
  const translate = useTranslate();
  return (
    <div className="flex flex-col gap-4 flex-1">
      <h3 className="text-base font-medium">
        {translate("resources.deals.inputs.linked_to", { _: "Linked to" })}
      </h3>
      <ReferenceInput source="company_id" reference="companies">
        <AutocompleteCompanyInput
          label="resources.quotes.fields.company_id"
          validate={required()}
        />
      </ReferenceInput>

      <ReferenceInput source="contact_id" reference="contacts_summary">
        <SelectInput
          label="resources.quotes.fields.contact_id"
          optionText={(record: { first_name: string; last_name: string }) =>
            `${record.first_name} ${record.last_name}`
          }
          helperText={false}
          emptyText="None"
        />
      </ReferenceInput>

      <ReferenceInput source="deal_id" reference="deals">
        <SelectInput
          label="resources.quotes.fields.deal_id"
          optionText="name"
          helperText={false}
          emptyText="None"
        />
      </ReferenceInput>

      <TextInput
        source="customer_reference"
        helperText={false}
        label="resources.quotes.fields.customer_reference"
      />
    </div>
  );
};

const QuoteMiscInputs = () => {
  const translate = useTranslate();
  const config = useConfigurationContext();

  const defaultValidUntil = new Date();
  defaultValidUntil.setDate(defaultValidUntil.getDate() + 30);

  return (
    <div className="flex flex-col gap-4 flex-1">
      <h3 className="text-base font-medium">
        {translate("resources.deals.field_categories.misc", { _: "Details" })}
      </h3>

      <SelectInput
        source="currency"
        choices={[
          { id: "SEK", name: "SEK" },
          { id: "EUR", name: "EUR" },
          { id: "USD", name: "USD" },
          { id: "NOK", name: "NOK" },
          { id: "DKK", name: "DKK" },
          { id: "GBP", name: "GBP" },
        ]}
        defaultValue="SEK"
        helperText={false}
        label="resources.quotes.fields.currency"
      />
      <DateInput
        source="valid_until"
        helperText={false}
        defaultValue={defaultValidUntil.toISOString().split("T")[0]}
        label="resources.quotes.fields.valid_until"
      />

      <Separator />

      <NumberInput
        source="vat_rate"
        helperText={false}
        defaultValue={25}
        min={0}
        max={100}
        step={0.5}
        label="resources.quotes.fields.vat_rate"
      />
      <NumberInput
        source="discount_percent"
        helperText={false}
        defaultValue={0}
        min={0}
        max={100}
        step={1}
        label="resources.quotes.fields.discount_percent"
      />

      <TextInput
        source="payment_terms"
        helperText={false}
        defaultValue={
          config.sellerCompany?.defaultPaymentTerms || "30 dagar netto"
        }
        label="resources.quotes.fields.payment_terms"
      />
      <TextInput
        source="delivery_terms"
        helperText={false}
        defaultValue={config.sellerCompany?.defaultDeliveryTerms || ""}
        label="resources.quotes.fields.delivery_terms"
      />

      <Separator />
      <AccentColorInput />
    </div>
  );
};

const ACCENT_PRESETS = [
  { color: "#2563eb", label: "Blue" },
  { color: "#7c3aed", label: "Purple" },
  { color: "#059669", label: "Green" },
  { color: "#d97706", label: "Orange" },
  { color: "#dc2626", label: "Red" },
  { color: "#0a0a0a", label: "Black" },
];

const AccentColorInput = () => {
  const translate = useTranslate();
  const { field } = useInput({
    source: "accent_color",
    defaultValue: "#2563eb",
  });

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">
        {translate("resources.quotes.fields.accent_color", {
          _: "Accent color",
        })}
      </label>
      <div className="flex gap-2 items-center flex-wrap">
        {ACCENT_PRESETS.map(({ color, label }) => (
          <button
            key={color}
            type="button"
            title={label}
            onClick={() => field.onChange(color)}
            className="w-8 h-8 rounded-full border-2 transition-all"
            style={{
              backgroundColor: color,
              borderColor: field.value === color ? color : "transparent",
              outline: field.value === color ? `2px solid ${color}` : "none",
              outlineOffset: "2px",
            }}
          />
        ))}
        <input
          type="color"
          value={field.value || "#2563eb"}
          onChange={(e) => field.onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border"
          title={translate("resources.quotes.fields.custom_color", {
            _: "Custom color",
          })}
        />
      </div>
    </div>
  );
};

const QuoteTermsInputs = () => {
  const translate = useTranslate();
  const config = useConfigurationContext();
  const { field } = useInput({
    source: "terms_and_conditions",
    defaultValue: config.sellerCompany?.defaultTermsAndConditions || "",
  });
  const { field: notesField } = useInput({
    source: "notes_internal",
    defaultValue: "",
  });

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-medium">
        {translate("resources.quotes.fields.terms_and_conditions", {
          _: "Terms & Conditions",
        })}
      </h3>
      <Textarea
        {...field}
        value={field.value || ""}
        rows={4}
        className="resize-y"
        placeholder={translate(
          "resources.quotes.fields.terms_and_conditions_placeholder",
          { _: "Enter terms and conditions..." },
        )}
      />

      <h3 className="text-base font-medium">
        {translate("resources.quotes.fields.notes_internal", {
          _: "Internal Notes",
        })}
      </h3>
      <Textarea
        {...notesField}
        value={notesField.value || ""}
        rows={2}
        className="resize-y"
        placeholder={translate(
          "resources.quotes.fields.notes_internal_placeholder",
          { _: "Internal notes (not shown on quote)..." },
        )}
      />
    </div>
  );
};
