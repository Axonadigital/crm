import { Building, Handshake, Sparkles, Truck, Users } from "lucide-react";
import { FilterLiveForm, useGetIdentity, useTranslate } from "ra-core";
import { ToggleFilterButton } from "@/components/admin/toggle-filter-button";
import { SearchInput } from "@/components/admin/search-input";

import { FilterCategory } from "../filters/FilterCategory";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { getTranslatedCompanySizeLabel } from "./getTranslatedCompanySizeLabel";
import { sizes } from "./sizes";

const activeCustomersFilter = {
  "lead_status@eq": "closed_won",
};

const companiesUnderNegotiationFilter = {
  "lead_status@in": "(proposal_sent,negotiation)",
};

const companiesForFollowupFilter = {
  "lead_status@in": "(contacted,interested,meeting_booked)",
};

const neverContactedFilter = {
  "lead_status@eq": "new",
};

const contactedNoResponseFilter = {
  "lead_status@eq": "contacted",
};

const notInterestedFilter = {
  "lead_status@in": "(not_interested,bad_fit)",
};

export const CompanyListFilter = () => {
  const { identity } = useGetIdentity();
  const { companySectors } = useConfigurationContext();
  const translate = useTranslate();
  const translatedSizes = sizes.map((size) => ({
    ...size,
    name: getTranslatedCompanySizeLabel(size, translate),
  }));
  return (
    <div className="w-52 min-w-52 flex flex-col gap-8">
      <FilterLiveForm>
        <SearchInput source="q" />
      </FilterLiveForm>

      <FilterCategory
        icon={<Building className="h-4 w-4" />}
        label="resources.companies.fields.size"
      >
        {translatedSizes.map((size) => (
          <ToggleFilterButton
            className="w-full justify-between"
            label={size.name}
            key={size.name}
            value={{ size: size.id }}
          />
        ))}
      </FilterCategory>

      <FilterCategory
        icon={<Truck className="h-4 w-4" />}
        label="resources.companies.fields.sector"
      >
        {companySectors.map((sector) => (
          <ToggleFilterButton
            className="w-full justify-between"
            label={sector.label}
            key={sector.value}
            value={{ sector: sector.value }}
          />
        ))}
      </FilterCategory>

      <FilterCategory
        icon={<Users className="h-4 w-4" />}
        label="resources.companies.fields.sales_id"
      >
        <ToggleFilterButton
          className="w-full justify-between"
          label={translate("crm.common.me")}
          value={{ sales_id: identity?.id }}
        />
      </FilterCategory>

      <FilterCategory
        icon={<Sparkles className="h-4 w-4" />}
        label="Lead Segment"
      >
        <ToggleFilterButton
          className="w-full justify-between"
          label="Heta leads"
          value={{ "segment@eq": "hot_lead" }}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label="Varma leads"
          value={{ "segment@eq": "warm_lead" }}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label="Kalla leads"
          value={{ "segment@eq": "cold_lead" }}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label="Har Facebook"
          value={{ "has_facebook@eq": true }}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label="Har Instagram"
          value={{ "has_instagram@eq": true }}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label="Saknar hemsida"
          value={{ "website_quality@eq": "none" }}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label="Dålig hemsida"
          value={{ "website_quality@eq": "poor" }}
        />
      </FilterCategory>

      <FilterCategory
        icon={<Handshake className="h-4 w-4" />}
        label="Relationsstatus"
      >
        <ToggleFilterButton
          className="w-full justify-between"
          label={translate("resources.companies.filters.active_customers", {
            _: "Aktiva kunder",
          })}
          value={activeCustomersFilter}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label={translate("resources.companies.filters.under_negotiation", {
            _: "Under förhandling",
          })}
          value={companiesUnderNegotiationFilter}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label={translate("resources.companies.filters.follow_up", {
            _: "Att följa upp",
          })}
          value={companiesForFollowupFilter}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label="Aldrig kontaktade"
          value={neverContactedFilter}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label="Kontaktade, inget svar"
          value={contactedNoResponseFilter}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label="Inte intresserade"
          value={notInterestedFilter}
        />
      </FilterCategory>
    </div>
  );
};
