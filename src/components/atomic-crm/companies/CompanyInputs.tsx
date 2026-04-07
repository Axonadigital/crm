import { AlertTriangle, Calendar } from "lucide-react";
import { required, useRecordContext, useTranslate } from "ra-core";
import { useNavigate } from "react-router-dom";
import { ReferenceInput } from "@/components/admin/reference-input";
import { TextInput } from "@/components/admin/text-input";
import { SelectInput } from "@/components/admin/select-input";
import { ArrayInput } from "@/components/admin/array-input";
import { SimpleFormIterator } from "@/components/admin/simple-form-iterator";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

import ImageEditorField from "../misc/ImageEditorField";
import { isLinkedinUrl } from "../misc/isLinkedInUrl";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company, Sale } from "../types";
import {
  getFollowupRelativeLabel,
  getFollowupUrgency,
  getFollowupUrgencyColor,
} from "./followupUtils";
import { getTranslatedCompanySizeLabel } from "./getTranslatedCompanySizeLabel";
import { sizes } from "./sizes";
import { useCompanyDuplicateCheck } from "./useCompanyDuplicateCheck";

const isUrl = (url: string) => {
  if (!url) return;
  const UrlRegex = new RegExp(
    /^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([-.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/i,
  );
  if (!UrlRegex.test(url)) {
    return {
      message: "crm.validation.invalid_url",
      args: { _: "Must be a valid URL" },
    };
  }
};

export const CompanyInputs = () => {
  const isMobile = useIsMobile();

  return (
    <div className="flex flex-col gap-4 p-1">
      <CompanyDisplayInputs />
      <CompanyFollowUpInputs />
      <div className={`flex gap-6 ${isMobile ? "flex-col" : "flex-row"}`}>
        <div className="flex flex-col gap-10 flex-1">
          <CompanyContactInputs />
          <CompanyContextInputs />
        </div>
        <Separator orientation={isMobile ? "horizontal" : "vertical"} />
        <div className="flex flex-col gap-8 flex-1">
          <CompanyAddressInputs />
          <CompanyAdditionalInformationInputs />
        </div>
      </div>
    </div>
  );
};

const CompanyDisplayInputs = () => {
  const translate = useTranslate();
  const record = useRecordContext<Company>();
  const duplicates = useCompanyDuplicateCheck();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-2 flex-1">
      <div className="flex gap-4 flex-row">
        <ImageEditorField
          source="logo"
          type="avatar"
          width={60}
          height={60}
          emptyText={record?.name.charAt(0)}
          linkPosition="bottom"
        />
        <TextInput
          source="name"
          className="w-full h-fit"
          validate={required()}
          helperText={false}
          placeholder={translate("resources.companies.fields.name", {
            _: "Company name",
          })}
        />
      </div>
      {duplicates.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Möjlig dubblett – liknande bolag finns redan:
          </div>
          <ul className="ml-5 list-disc">
            {duplicates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="underline hover:no-underline"
                  onClick={() => navigate(`/companies/${c.id}/show`)}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const CompanyContactInputs = () => {
  const translate = useTranslate();
  return (
    <div className="flex flex-col gap-4">
      <h6 className="text-lg font-semibold">
        {translate("resources.companies.field_categories.contact", {
          _: "Company info",
        })}
      </h6>
      <TextInput source="website" helperText={false} validate={isUrl} />
      <TextInput
        source="linkedin_url"
        helperText={false}
        validate={isLinkedinUrl}
      />
      <TextInput source="phone_number" helperText={false} />
      <TextInput source="email" helperText={false} type="email" />
    </div>
  );
};

const CompanyContextInputs = () => {
  const translate = useTranslate();
  const { companySectors } = useConfigurationContext();
  const translatedSizes = sizes.map((size) => ({
    ...size,
    name: getTranslatedCompanySizeLabel(size, translate),
  }));

  const leadStatusChoices = [
    {
      id: "new",
      name: translate("resources.companies.lead_status.new", { _: "Ny" }),
    },
    {
      id: "contacted",
      name: translate("resources.companies.lead_status.contacted", {
        _: "Kontaktad",
      }),
    },
    {
      id: "no_response",
      name: translate("resources.companies.lead_status.no_response", {
        _: "Kontaktad, ej svar",
      }),
    },
    {
      id: "info_sent",
      name: translate("resources.companies.lead_status.info_sent", {
        _: "Info utskickat",
      }),
    },
    {
      id: "send_info",
      name: translate("resources.companies.lead_status.send_info", {
        _: "Skicka info/komplettering",
      }),
    },
    {
      id: "interested",
      name: translate("resources.companies.lead_status.interested", {
        _: "Intresserad",
      }),
    },
    {
      id: "meeting_booked",
      name: translate("resources.companies.lead_status.meeting_booked", {
        _: "Möte bokat",
      }),
    },
    {
      id: "proposal_sent",
      name: translate("resources.companies.lead_status.proposal_sent", {
        _: "Offert skickad",
      }),
    },
    {
      id: "closed_won",
      name: translate("resources.companies.lead_status.closed_won", {
        _: "Vunnen",
      }),
    },
    {
      id: "closed_lost",
      name: translate("resources.companies.lead_status.closed_lost", {
        _: "Förlorad",
      }),
    },
    {
      id: "not_interested",
      name: translate("resources.companies.lead_status.not_interested", {
        _: "Ej intresserad",
      }),
    },
    {
      id: "bad_fit",
      name: translate("resources.companies.lead_status.bad_fit", {
        _: "Dålig match",
      }),
    },
  ];

  const sourceChoices = [
    {
      id: "manual",
      name: translate("resources.companies.source.manual", { _: "Manuell" }),
    },
    { id: "google_maps", name: "Google Maps" },
    { id: "hitta", name: "Hitta.se" },
    { id: "allabolag", name: "Allabolag" },
    { id: "eniro", name: "Eniro" },
    {
      id: "referral",
      name: translate("resources.companies.source.referral", {
        _: "Rekommendation",
      }),
    },
    {
      id: "field",
      name: translate("resources.companies.source.field", { _: "Fältarbete" }),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h6 className="text-lg font-semibold">
        {translate("resources.companies.field_categories.context", {
          _: "Context",
        })}
      </h6>
      <SelectInput
        source="sector"
        choices={companySectors}
        optionText="label"
        optionValue="value"
        helperText={false}
      />
      <SelectInput source="size" choices={translatedSizes} helperText={false} />
      <TextInput source="revenue" helperText={false} />
      <TextInput source="tax_identifier" helperText={false} />
      <TextInput
        source="org_number"
        label={translate("resources.companies.fields.org_number", {
          _: "Organisationsnummer",
        })}
        helperText={false}
      />
      <TextInput
        source="industry"
        label={translate("resources.companies.fields.industry", {
          _: "Bransch",
        })}
        helperText={false}
      />
      <SelectInput
        source="lead_status"
        label={translate("resources.companies.fields.lead_status", {
          _: "Lead Status",
        })}
        choices={leadStatusChoices}
        helperText={false}
      />
      <SelectInput
        source="source"
        label={translate("resources.companies.fields.source", { _: "Källa" })}
        choices={sourceChoices}
        helperText={false}
      />
    </div>
  );
};

const CompanyFollowUpInputs = () => {
  const translate = useTranslate();
  const record = useRecordContext<Company>();
  const urgency = record?.next_followup_date
    ? getFollowupUrgency(record.next_followup_date)
    : null;
  const relativeLabel = record?.next_followup_date
    ? getFollowupRelativeLabel(record.next_followup_date)
    : null;

  const actionTypeChoices = [
    { id: "call", name: "Ring" },
    { id: "email", name: "Mejla" },
    { id: "meeting", name: "Möte" },
    { id: "follow_up", name: "Följ upp" },
    { id: "send_quote", name: "Skicka offert" },
    { id: "other", name: "Övrigt" },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg border-2 border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/30">
      <h6 className="text-lg font-semibold flex items-center gap-2">
        <Calendar className="w-5 h-5 text-orange-600" />
        {translate("resources.companies.fields.next_followup_date", {
          _: "Nästa uppföljning",
        })}
        {relativeLabel && (
          <Badge
            className={cn(
              "ml-auto text-xs",
              urgency ? getFollowupUrgencyColor(urgency) : "",
            )}
          >
            {relativeLabel}
          </Badge>
        )}
      </h6>
      <TextInput
        source="next_followup_date"
        type="date"
        label="Datum"
        helperText={false}
      />
      <SelectInput
        source="next_action_type"
        label="Typ av åtgärd"
        choices={actionTypeChoices}
        helperText={false}
      />
      <TextInput
        source="next_action_note"
        label="Anteckning"
        multiline
        helperText={false}
      />
    </div>
  );
};

const CompanyAddressInputs = () => {
  const translate = useTranslate();
  return (
    <div className="flex flex-col gap-4">
      <h6 className="text-lg font-semibold">
        {translate("resources.companies.field_categories.address", {
          _: "Address",
        })}
      </h6>
      <TextInput source="address" helperText={false} />
      <TextInput source="city" helperText={false} />
      <TextInput source="zipcode" helperText={false} />
      <TextInput source="state_abbr" helperText={false} />
      <TextInput source="country" helperText={false} />
    </div>
  );
};

const CompanyAdditionalInformationInputs = () => {
  const translate = useTranslate();

  const websiteQualityChoices = [
    {
      id: "none",
      name: translate("resources.companies.website_quality.none", {
        _: "Ingen",
      }),
    },
    {
      id: "poor",
      name: translate("resources.companies.website_quality.poor", {
        _: "Dålig",
      }),
    },
    {
      id: "ok",
      name: translate("resources.companies.website_quality.ok", { _: "OK" }),
    },
    {
      id: "good",
      name: translate("resources.companies.website_quality.good", { _: "Bra" }),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h6 className="text-lg font-semibold">
        {translate("resources.companies.field_categories.additional_info", {
          _: "Additional information",
        })}
      </h6>
      <TextInput source="description" multiline helperText={false} />
      <TextInput
        source="google_business_url"
        label={translate("resources.companies.fields.google_business_url", {
          _: "Google Business URL",
        })}
        helperText={false}
        validate={isUrl}
      />
      <SelectInput
        source="website_quality"
        label={translate("resources.companies.fields.website_quality", {
          _: "Webbplatskvalitet",
        })}
        choices={websiteQualityChoices}
        helperText={false}
      />
      <TextInput
        source="employees_estimate"
        type="number"
        label={translate("resources.companies.fields.employees_estimate", {
          _: "Uppskattad storlek (anställda)",
        })}
        helperText={false}
      />
      <ArrayInput source="context_links" helperText={false}>
        <SimpleFormIterator disableReordering fullWidth getItemLabel={false}>
          <TextInput
            source=""
            label={false}
            helperText={false}
            validate={isUrl}
          />
        </SimpleFormIterator>
      </ArrayInput>
      <ReferenceInput
        source="sales_id"
        reference="sales"
        filter={{
          "disabled@neq": true,
        }}
      >
        <SelectInput helperText={false} optionText={saleOptionRenderer} />
      </ReferenceInput>
      <ReferenceInput
        source="assigned_to"
        reference="sales"
        label={translate("resources.companies.fields.assigned_to", {
          _: "Tilldelad till",
        })}
        filter={{
          "disabled@neq": true,
        }}
      >
        <SelectInput helperText={false} optionText={saleOptionRenderer} />
      </ReferenceInput>
    </div>
  );
};

const saleOptionRenderer = (choice: Sale) =>
  `${choice.first_name} ${choice.last_name}`;
