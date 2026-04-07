import { AlertTriangle, Building2, ChevronRight } from "lucide-react";
import { ResourceContextProvider, useGetIdentity, useGetList } from "ra-core";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SimpleList } from "../simple-list/SimpleList";
import type { Company } from "../types";

export const LeadsMissingNextStep = () => {
  const { identity } = useGetIdentity();
  const {
    data: companies,
    total,
    isPending,
  } = useGetList<Company>(
    "companies",
    {
      pagination: { page: 1, perPage: 10 },
      sort: { field: "last_touch_at", order: "ASC" },
      filter: {
        "data_quality_status@eq": "missing_next_step",
      },
    },
    { enabled: Number.isInteger(identity?.id) },
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center">
        <div className="mr-3 flex">
          <AlertTriangle className="text-orange-500 w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-muted-foreground">
          Leads utan nästa steg
        </h2>
        {total != null && total > 0 && (
          <Badge variant="destructive" className="ml-auto">
            {total}
          </Badge>
        )}
      </div>
      <Card className="overflow-hidden">
        <ResourceContextProvider value="companies">
          <SimpleList<Company>
            data={companies}
            total={total}
            isPending={isPending}
            primaryText={(company) => company.name}
            secondaryText={(company) =>
              company.lead_status
                ? leadStatusLabel(company.lead_status)
                : "Ingen status"
            }
            leftIcon={() => (
              <Building2 className="w-5 h-5 text-muted-foreground" />
            )}
            rightIcon={() => (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            linkType={(record) => `/companies/${record.id}/show`}
            empty={
              <div className="p-4 text-sm text-muted-foreground text-center">
                Alla leads har ett planerat nästa steg
              </div>
            }
          />
        </ResourceContextProvider>
      </Card>
    </div>
  );
};

const leadStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    new: "Ny",
    contacted: "Kontaktad",
    interested: "Intresserad",
    callback_requested: "Ring upp igen",
    meeting_booked: "Möte bokat",
    not_interested: "Inte intresserad",
    proposal_sent: "Offert skickad",
    negotiation: "Förhandling",
    closed_won: "Vunnen",
    closed_lost: "Förlorad",
    bad_fit: "Dålig match",
  };
  return labels[status] || status;
};
