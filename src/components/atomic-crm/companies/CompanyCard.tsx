import { Calendar, Handshake, MapPin, Phone } from "lucide-react";
import { Link } from "react-router";
import {
  useCreatePath,
  useListContext,
  useRecordContext,
  useTranslate,
} from "ra-core";
import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { Avatar as ContactAvatar } from "../contacts/Avatar";
import { getContactDisplayName } from "../contacts/contactName";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company } from "../types";
import { CompanyAvatar } from "./CompanyAvatar";
import {
  getFollowupRelativeLabel,
  getFollowupUrgency,
  getFollowupUrgencyColor,
} from "./followupUtils";
import { getLeadStatusBadgeVariant } from "./leadStatusUtils";

type CompanyCardProps = {
  record?: Company;
  isSelected?: boolean;
  onToggleSelection?: (companyId: Company["id"]) => void;
};

export const CompanyCard = (props: CompanyCardProps) => {
  const createPath = useCreatePath();
  const record = useRecordContext<Company>(props);
  const translate = useTranslate();
  const { companySectors } = useConfigurationContext();
  if (!record) return null;

  const sector = companySectors.find((s) => s.value === record.sector);
  const sectorLabel = sector?.label;

  return (
    <div className="relative">
      <div className="absolute left-3 top-3 z-10">
        <Checkbox
          checked={props.isSelected}
          aria-label={`Välj ${record.name}`}
          className="cursor-pointer bg-background/90 shadow-sm"
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={() => props.onToggleSelection?.(record.id)}
        />
      </div>
      <Card
        className={cn(
          "h-[240px] overflow-hidden",
          props.isSelected && "ring-2 ring-primary bg-primary/5",
        )}
      >
        <Link
          to={createPath({
            resource: "companies",
            id: record.id,
            type: "show",
          })}
          className="block h-full no-underline"
        >
          <div className="flex h-full flex-col justify-between p-4 transition-colors hover:bg-muted">
            <div className="flex flex-col items-center gap-1">
              <CompanyAvatar />
              <div className="text-center mt-1">
                <h6 className="text-sm font-medium">{record.name}</h6>
                <p className="text-xs text-muted-foreground">{sectorLabel}</p>
                {record.lead_status && (
                  <Badge
                    variant={getLeadStatusBadgeVariant(record.lead_status)}
                    className="mt-1 text-[10px] px-1.5 py-0"
                  >
                    {translate(
                      `resources.companies.lead_status.${record.lead_status}`,
                      {
                        _: record.lead_status.replace(/_/g, " "),
                      },
                    )}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {record.city && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate">{record.city}</span>
                </div>
              )}
              {record.phone_number && (
                <div className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  <span className="truncate">{record.phone_number}</span>
                </div>
              )}
              {record.next_followup_date &&
                (() => {
                  const urgency = getFollowupUrgency(record.next_followup_date);
                  const colorClass = getFollowupUrgencyColor(urgency);
                  const label = getFollowupRelativeLabel(
                    record.next_followup_date,
                  );
                  return (
                    <Badge
                      className={cn("text-[10px] px-1.5 py-0", colorClass)}
                    >
                      <Calendar className="w-3 h-3 mr-0.5" />
                      {label}
                    </Badge>
                  );
                })()}
            </div>
            <div className="flex flex-row w-full justify-between gap-2">
              <div className="flex items-center">
                {record.nb_contacts ? (
                  <ReferenceManyField reference="contacts" target="company_id">
                    <AvatarGroupIterator />
                  </ReferenceManyField>
                ) : null}
              </div>
              {record.nb_deals ? (
                <div className="flex items-center ml-2 gap-0.5">
                  <Handshake className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{record.nb_deals}</span>
                  <span className="text-xs text-muted-foreground">
                    {translate("resources.deals.name", {
                      smart_count: record.nb_deals,
                      _: "Deal |||| Deals",
                    })}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </Link>
      </Card>
    </div>
  );
};

const AvatarGroupIterator = () => {
  const { data, total, error, isPending } = useListContext();
  if (isPending || error) return null;

  const MAX_AVATARS = 3;
  return (
    <div className="*:data-[slot=avatar]:ring-background flex -space-x-0.5 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:grayscale-50">
      {data.slice(0, MAX_AVATARS).map((record: any) => (
        <ContactAvatar
          key={record.id}
          record={record}
          width={25}
          height={25}
          title={getContactDisplayName(record)}
        />
      ))}
      {total > MAX_AVATARS && (
        <span
          className="relative flex size-8 shrink-0 overflow-hidden rounded-full w-[25px] h-[25px]"
          data-slot="avatar"
        >
          <span className="bg-muted flex size-full items-center justify-center rounded-full text-[10px]">
            +{total - MAX_AVATARS}
          </span>
        </span>
      )}
    </div>
  );
};
