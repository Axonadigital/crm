import { useGetList } from "ra-core";

import type { Contact, ContactNote } from "../types";
import { CallStatsWidget } from "./CallStatsWidget";
import { DashboardActivityLog } from "./DashboardActivityLog";
import { DashboardStepper } from "./DashboardStepper";
import { FinancialKpiRow } from "./FinancialKpiRow";
import { FollowUpsDueToday } from "./FollowUpsDueToday";
import { KpiSummaryRow } from "./KpiSummaryRow";
import { MoneyToCollect } from "./MoneyToCollect";
import { UpcomingInvoices } from "./UpcomingInvoices";
import { LeadsMissingNextStep } from "./LeadsMissingNextStep";
import { PipelineDonut } from "./PipelineDonut";
import { RevenueGoalsTracker } from "./RevenueGoalsTracker";
import { RevenueTrendChart } from "./RevenueTrendChart";
import { SalesTrackingWidget } from "./SalesTrackingWidget";
import { TasksList } from "./TasksList";
import { UpcomingMeetings } from "./UpcomingMeetings";
import { Welcome } from "./Welcome";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";

export const Dashboard = () => {
  const {
    data: dataContact,
    total: totalContact,
    isPending: isPendingContact,
  } = useGetList<Contact>("contacts", {
    pagination: { page: 1, perPage: 1 },
  });

  const { total: totalContactNotes, isPending: isPendingContactNotes } =
    useGetList<ContactNote>("contact_notes", {
      pagination: { page: 1, perPage: 1 },
    });

  const { total: totalDeal, isPending: isPendingDeal } = useGetList<Contact>(
    "deals",
    {
      pagination: { page: 1, perPage: 1 },
    },
  );

  const isPending = isPendingContact || isPendingContactNotes || isPendingDeal;

  if (isPending) {
    return null;
  }

  if (!totalContact) {
    return <DashboardStepper step={1} />;
  }

  if (!totalContactNotes) {
    return <DashboardStepper step={2} contactId={dataContact?.[0]?.id} />;
  }

  return (
    <div className="flex flex-col gap-6 mt-1">
      {import.meta.env.VITE_IS_DEMO === "true" ? <Welcome /> : null}

      {totalDeal ? (
        <div data-tour="dashboard-kpi">
          <WidgetErrorBoundary>
            <KpiSummaryRow />
          </WidgetErrorBoundary>
        </div>
      ) : null}

      <div data-tour="dashboard-financial">
        <WidgetErrorBoundary>
          <FinancialKpiRow />
        </WidgetErrorBoundary>
      </div>

      {/* Hero: monthly revenue bars + pipeline distribution donut */}
      {totalDeal ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div data-tour="dashboard-revenue">
            <WidgetErrorBoundary>
              <RevenueTrendChart />
            </WidgetErrorBoundary>
          </div>
          <div data-tour="dashboard-pipeline">
            <WidgetErrorBoundary>
              <PipelineDonut />
            </WidgetErrorBoundary>
          </div>
        </div>
      ) : null}

      {/* Secondary: tracking charts + activity (2/3) alongside action lists (1/3) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <WidgetErrorBoundary>
            <SalesTrackingWidget />
          </WidgetErrorBoundary>
          <WidgetErrorBoundary>
            <CallStatsWidget />
          </WidgetErrorBoundary>
          <WidgetErrorBoundary>
            <DashboardActivityLog />
          </WidgetErrorBoundary>
        </div>

        <div className="flex flex-col gap-6">
          <div data-tour="dashboard-money">
            <WidgetErrorBoundary>
              <MoneyToCollect />
            </WidgetErrorBoundary>
          </div>
          <WidgetErrorBoundary>
            <UpcomingInvoices />
          </WidgetErrorBoundary>
          <WidgetErrorBoundary>
            <RevenueGoalsTracker />
          </WidgetErrorBoundary>
          <WidgetErrorBoundary>
            <FollowUpsDueToday />
          </WidgetErrorBoundary>
          <WidgetErrorBoundary>
            <LeadsMissingNextStep />
          </WidgetErrorBoundary>
          <WidgetErrorBoundary>
            <UpcomingMeetings />
          </WidgetErrorBoundary>
          <div data-tour="dashboard-tasks">
            <WidgetErrorBoundary>
              <TasksList />
            </WidgetErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
};
