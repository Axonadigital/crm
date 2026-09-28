import { required, useTranslate } from "ra-core";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";

const categoryChoices = [
  { id: "outreach", name: "Outreach" },
  { id: "followup", name: "Uppföljning" },
  { id: "meeting_request", name: "Mötesförfrågan" },
  { id: "proposal", name: "Offert" },
  { id: "thank_you", name: "Tack" },
];

const variableHints = `Tillgängliga variabler: {{first_name}}, {{last_name}}, {{full_name}}, {{company_name}}, {{company_website}}, {{sender_name}}, {{sender_first_name}}`;

export const EmailTemplateInputs = () => {
  const translate = useTranslate();
  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl">
      <TextInput
        source="name"
        label={translate("resources.email_templates.fields.name", {
          _: "Mallnamn",
        })}
        validate={required()}
      />
      <SelectInput
        source="category"
        label={translate("resources.email_templates.fields.category", {
          _: "Kategori",
        })}
        choices={categoryChoices}
        defaultValue="outreach"
        validate={required()}
      />
      <TextInput
        source="subject"
        label={translate("resources.email_templates.fields.subject", {
          _: "Ämnesrad",
        })}
        validate={required()}
        helperText={variableHints}
      />
      <TextInput
        source="body"
        label={translate("resources.email_templates.fields.body", {
          _: "Brödtext",
        })}
        multiline
        rows={12}
        validate={required()}
        helperText={variableHints}
      />
    </div>
  );
};
