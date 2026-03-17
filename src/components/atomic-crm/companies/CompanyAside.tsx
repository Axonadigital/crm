import { Globe, Linkedin, Phone, Calendar, Building2, Tag } from "lucide-react";
import {
  useGetIdentity,
  useLocaleState,
  useRecordContext,
  useTranslate,
} from "ra-core";
import { EditButton } from "@/components/admin/edit-button";
import { DeleteButton } from "@/components/admin/delete-button";
import { ShowButton } from "@/components/admin/show-button";
import { TextField } from "@/components/admin/text-field";
import { UrlField } from "@/components/admin/url-field";
import { SelectField } from "@/components/admin/select-field";
import { Badge } from "@/components/ui/badge";

import { formatLocalizedDate } from "../misc/RelativeDate";
import { AsideSection } from "../misc/AsideSection";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company } from "../types";
import { getTranslatedCompanySizeLabel } from "./getTranslatedCompanySizeLabel";
import { sizes } from "./sizes";
import { useGetSalesName } from "../sales/useGetSalesName";
import { getLeadStatusColor } from "./leadStatusUtils";

interface CompanyAsideProps {
  link?: string;
}

export const CompanyAside = ({ link = "edit" }: CompanyAsideProps) => {
  const record = useRecordContext<Company>();
  const translate = useTranslate();
  if (!record) return null;

  return (
    <div className="hidden sm:block w-92 min-w-92 space-y-4">
      <div className="flex flex-row space-x-1">
        {link === "edit" ? (
          <EditButton label={translate("resources.companies.action.edit")} />
        ) : (
          <ShowButton label={translate("resources.companies.action.show")} />
        )}
      </div>

      <CompanyInfo record={record} />

      <SwedishCrmInfo record={record} />

      <AddressInfo record={record} />

      <ContextInfo record={record} />

      <AdditionalInfo record={record} />

      {link !== "edit" && (
        <div className="mt-6 pt-6 border-t hidden sm:flex flex-col gap-2">
          <DeleteButton
            label={translate("ra.action.delete")}
            variant="destructive"
            size="default"
            className="w-full"
          />
        </div>
      )}
    </div>
  );
};

export const CompanyInfo = ({ record }: { record: Company }) => {
  const translate = useTranslate();
  if (!record.website && !record.linkedin_url && !record.phone_number) {
    return null;
  }

  return (
    <AsideSection
      title={translate("resources.companies.field_categories.contact")}
    >
      {record.website && (
        <div className="flex flex-row items-center gap-1 min-h-[24px]">
          <Globe className="w-4 h-4" />
          <UrlField
            source="website"
            target="_blank"
            rel="noopener"
            content={record.website
              .replace("http://", "")
              .replace("https://", "")}
          />
        </div>
      )}
      {record.linkedin_url && (
        <div className="flex flex-row items-center gap-1 min-h-[24px]">
          <Linkedin className="w-4 h-4" />
          <a
            className="underline hover:no-underline"
            href={record.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            title={record.linkedin_url}
          >
            LinkedIn
          </a>
        </div>
      )}
      {record.phone_number && (
        <div className="flex flex-row items-center gap-1 min-h-[24px]">
          <Phone className="w-4 h-4" />
          <TextField source="phone_number" />
        </div>
      )}
    </AsideSection>
  );
};

export const ContextInfo = ({ record }: { record: Company }) => {
  const { companySectors } = useConfigurationContext();
  const translate = useTranslate();
  if (!record.revenue && !record.id) {
    return null;
  }

  const sector = companySectors.find((s) => s.value === record.sector);
  const sectorLabel = sector?.label;
  const translatedSizes = sizes.map((size) => ({
    ...size,
    name: getTranslatedCompanySizeLabel(size, translate),
  }));

  return (
    <AsideSection
      title={translate("resources.companies.field_categories.context")}
    >
      {sectorLabel && (
        <span>
          {translate("resources.companies.fields.sector")}: {sectorLabel}
        </span>
      )}
      {record.size && (
        <span>
          {translate("resources.companies.fields.size")}:{" "}
          <SelectField source="size" choices={translatedSizes} />
        </span>
      )}
      {record.revenue && (
        <span>
          {translate("resources.companies.fields.revenue")}:{" "}
          <TextField source="revenue" />
        </span>
      )}
      {record.tax_identifier && (
        <span>
          {translate("resources.companies.fields.tax_identifier", {})}
          : <TextField source="tax_identifier" />
        </span>
      )}
    </AsideSection>
  );
};

export const AddressInfo = ({ record }: { record: Company }) => {
  const translate = useTranslate();
  if (
    !record.address &&
    !record.city &&
    !record.zipcode &&
    !record.state_abbr
  ) {
    return null;
  }

  return (
    <AsideSection
      title={translate("resources.companies.field_categories.address")}
      noGap
    >
      <TextField source="address" />
      <TextField source="city" />
      <TextField source="zipcode" />
      <TextField source="state_abbr" />
      <TextField source="country" />
    </AsideSection>
  );
};

export const SwedishCrmInfo = ({ record }: { record: Company }) => {
  const translate = useTranslate();
  const assignedToName = useGetSalesName(record.assigned_to, {
    enabled: !!record.assigned_to,
  });

  if (
    !record.lead_status &&
    !record.org_number &&
    !record.source &&
    !record.industry &&
    !record.next_followup_date &&
    !record.assigned_to &&
    !record.tags?.length &&
    !record.employees_estimate
  ) {
    return null;
  }

  return (
    <AsideSection title="Lead Information">
      {record.lead_status && (
        <div className="flex items-center gap-2 mb-2">
          <Badge className={getLeadStatusColor(record.lead_status)}>
            {translate(
              `resources.companies.lead_status.${record.lead_status}`,
              {
                _: record.lead_status.replace(/_/g, " "),
              },
            )}
          </Badge>
        </div>
      )}
      {record.org_number && (
        <div className="text-sm mb-1">
          <span className="font-medium">Org.nr:</span> {record.org_number}
        </div>
      )}
      {record.industry && (
        <div className="flex items-center gap-1 text-sm mb-1">
          <Building2 className="w-4 h-4" />
          <span>{record.industry}</span>
        </div>
      )}
      {record.source && (
        <div className="text-sm mb-1">
          <span className="font-medium">Källa:</span>{" "}
          {translate(`resources.companies.source.${record.source}`, {
            _: record.source.replace(/_/g, " "),
          })}
        </div>
      )}
      {record.next_followup_date && (
        <div className="flex items-center gap-1 text-sm mb-1 text-orange-600 font-medium">
          <Calendar className="w-4 h-4" />
          <span>
            Följ upp:{" "}
            {new Date(record.next_followup_date).toLocaleDateString("sv-SE")}
          </span>
        </div>
      )}
      {record.assigned_to && (
        <div className="text-sm mb-1">
          <span className="font-medium">Tilldelad:</span> {assignedToName}
        </div>
      )}
      {record.employees_estimate && (
        <div className="text-sm mb-1">
          <span className="font-medium">Anställda:</span> ~
          {record.employees_estimate}
        </div>
      )}
      {record.tags && record.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {record.tags.map((tag, index) => (
            <Badge key={index} variant="outline" className="text-xs">
              <Tag className="w-3 h-3 mr-1" />
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </AsideSection>
  );
};

export const AdditionalInfo = ({ record }: { record: Company }) => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const { identity } = useGetIdentity();
  const isCurrentUser = record.sales_id === identity?.id;
  const salesName = useGetSalesName(record.sales_id, {
    enabled: !isCurrentUser,
  });
  if (
    !record.created_at &&
    !record.sales_id &&
    !record.description &&
    !record.context_links &&
    !record.google_business_url &&
    !record.website_quality
  ) {
    return null;
  }
  const getBaseURL = (url: string) => {
    const urlObject = new URL(url.startsWith("http") ? url : `https://${url}`);
    return urlObject.hostname;
  };

  return (
    <AsideSection
      title={translate("resources.companies.field_categories.additional_info")}
    >
      {record.description && (
        <p className="text-sm  mb-1">{record.description}</p>
      )}
      {record.google_business_url && (
        <div className="mb-1">
          <a
            className="text-sm underline hover:no-underline"
            href={record.google_business_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Business Profile
          </a>
        </div>
      )}
      {record.website_quality && (
        <div className="text-sm mb-1">
          <span className="font-medium">Webbplatskvalitet:</span>{" "}
          {translate(
            `resources.companies.website_quality.${record.website_quality}`,
            {
              _: record.website_quality,
            },
          )}
        </div>
      )}
      {record.context_links && (
        <div className="flex flex-col">
          {record.context_links.map((link, index) =>
            link ? (
              <a
                key={index}
                className="text-sm underline hover:no-underline mb-1"
                href={link.startsWith("http") ? link : `https://${link}`}
                target="_blank"
                rel="noopener noreferrer"
                title={link}
              >
                {getBaseURL(link)}
              </a>
            ) : null,
          )}
        </div>
      )}
      {record.sales_id !== null && (
        <div className="inline-flex text-sm text-muted-foreground mb-1">
          {translate(
            isCurrentUser
              ? "resources.companies.followed_by_you"
              : "resources.companies.followed_by",
            { name: salesName },
          )}
        </div>
      )}
      {record.created_at && (
        <p className="text-sm text-muted-foreground mb-1">
          {translate("resources.companies.added_on", {
            date: formatLocalizedDate(record.created_at, locale),
          })}{" "}
        </p>
      )}
    </AsideSection>
  );
};
