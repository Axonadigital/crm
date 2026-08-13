import { required, useTranslate } from "ra-core";
import { AutocompleteArrayInput } from "@/components/admin/autocomplete-array-input";
import { ReferenceArrayInput } from "@/components/admin/reference-array-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { TextInput } from "@/components/admin/text-input";
import { NumberInput } from "@/components/admin/number-input";
import { DateInput } from "@/components/admin/date-input";
import { SelectInput } from "@/components/admin/select-input";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";

import { contactOptionText } from "../misc/ContactOption";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { AutocompleteCompanyInput } from "../companies/AutocompleteCompanyInput.tsx";
import { RECURRING_INTERVAL_CHOICES } from "./dealUtils";

export const DealInputs = () => {
  const isMobile = useIsMobile();
  return (
    <div className="flex flex-col gap-8">
      <DealInfoInputs />

      <div className={`flex gap-6 ${isMobile ? "flex-col" : "flex-row"}`}>
        <DealLinkedToInputs />
        <Separator orientation={isMobile ? "horizontal" : "vertical"} />
        <DealMiscInputs />
      </div>
    </div>
  );
};

const DealInfoInputs = () => {
  return (
    <div className="flex flex-col gap-4 flex-1">
      <TextInput source="name" validate={required()} helperText={false} />
      <TextInput source="description" multiline rows={3} helperText={false} />
    </div>
  );
};

const DealLinkedToInputs = () => {
  const translate = useTranslate();
  return (
    <div className="flex flex-col gap-4 flex-1">
      <h3 className="text-base font-medium">
        {translate("resources.deals.inputs.linked_to")}
      </h3>
      <ReferenceInput source="company_id" reference="companies">
        <AutocompleteCompanyInput
          label="resources.deals.fields.company_id"
          validate={required()}
        />
      </ReferenceInput>
      <ReferenceInput source="billing_company_id" reference="companies">
        <AutocompleteCompanyInput label="Faktureras via" />
      </ReferenceInput>
      <ReferenceArrayInput source="delivery_company_ids" reference="companies">
        <AutocompleteArrayInput
          label="Gäller även bolag"
          optionText="name"
          helperText={false}
        />
      </ReferenceArrayInput>

      <ReferenceArrayInput source="contact_ids" reference="contacts_summary">
        <AutocompleteArrayInput
          label="resources.deals.fields.contact_ids"
          optionText={contactOptionText}
          helperText={false}
        />
      </ReferenceArrayInput>
    </div>
  );
};

const DealMiscInputs = () => {
  const { dealStages, dealCategories } = useConfigurationContext();
  const translate = useTranslate();
  return (
    <div className="flex flex-col gap-4 flex-1">
      <h3 className="text-base font-medium">
        {translate("resources.deals.field_categories.misc")}
      </h3>

      <SelectInput
        source="category"
        choices={dealCategories}
        optionText="label"
        optionValue="value"
        helperText={false}
      />
      <NumberInput
        source="amount"
        defaultValue={0}
        helperText={false}
        validate={required()}
      />
      <SelectInput
        source="recurring_interval"
        choices={RECURRING_INTERVAL_CHOICES}
        helperText={false}
      />
      <NumberInput source="recurring_amount" helperText={false} />
      <SelectInput
        source="billing_schedule_type"
        label="Faktureringssätt"
        choices={[
          { id: "standard", name: "Standard" },
          { id: "installment", name: "Delbetalning" },
        ]}
        defaultValue="standard"
        helperText={false}
      />
      <NumberInput
        source="installment_count"
        label="Antal delbetalningar"
        helperText={false}
      />
      <NumberInput
        source="installment_interval_months"
        label="Månader mellan delbetalningar"
        defaultValue={1}
        helperText={false}
      />
      <TextInput
        source="invoiced_through"
        type="date"
        label="Fakturerad t.o.m."
        helperText="Styr nästa fakturadatum och hur mycket som är kvar att fakturera i år"
      />
      <TextInput
        source="billing_start_date"
        type="date"
        label="Faktureringsstart"
        helperText={false}
      />
      <TextInput
        source="billing_notes"
        label="Faktureringsnotis"
        multiline
        rows={2}
        helperText={false}
      />
      <DateInput
        validate={required()}
        source="expected_closing_date"
        helperText={false}
        defaultValue={new Date().toISOString().split("T")[0]}
      />
      <SelectInput
        source="stage"
        choices={dealStages}
        optionText="label"
        optionValue="value"
        defaultValue="opportunity"
        helperText={false}
        validate={required()}
      />
    </div>
  );
};
