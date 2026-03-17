import { Building, Handshake, Truck, Users } from "lucide-react";
import { FilterLiveForm, useGetIdentity, useTranslate } from "ra-core";
import { ToggleFilterButton } from "@/components/admin/toggle-filter-button";
import { SearchInput } from "@/components/admin/search-input";

import { FilterCategory } from "../filters/FilterCategory";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { getTranslatedCompanySizeLabel } from "./getTranslatedCompanySizeLabel";
import { sizes } from "./sizes";

const companiesInProgressFilter = {
  "lead_status@in": "(contacted,interested,meeting_booked,proposal_sent,negotiation)",
};

const companiesClosedFilter = {
  "lead_status@in": "(closed_won,closed_lost)",
};

const companiesNotActiveFilter = {
  "lead_status@in": "(new,not_interested,bad_fit,closed_lost)",
};

const wonCustomersFilter = {
  "lead_status@eq": "closed_won",
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

      <FilterCategory icon={<Handshake className="h-4 w-4" />} label="Relationsstatus">
        <ToggleFilterButton
          className="w-full justify-between"
          label={translate("resources.companies.filters.in_progress", {
            _: "Kunder vi jobbar med",
          })}
          value={companiesInProgressFilter}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label={translate("resources.companies.filters.closed", {
            _: "Stängda kunder",
          })}
          value={companiesClosedFilter}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label={translate("resources.companies.filters.won", {
            _: "Vunna kunder",
          })}
          value={wonCustomersFilter}
        />
        <ToggleFilterButton
          className="w-full justify-between"
          label={translate("resources.companies.filters.not_active", {
            _: "Företag vi inte jobbar med",
          })}
          value={companiesNotActiveFilter}
        />
      </FilterCategory>
    </div>
  );
};
