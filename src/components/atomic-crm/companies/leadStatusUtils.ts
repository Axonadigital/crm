import type { Company } from "../types";

type LeadStatus = NonNullable<Company["lead_status"]>;

export const getLeadStatusBadgeVariant = (
  status: LeadStatus,
): "default" | "secondary" | "destructive" | "outline" => {
  const statusColorMap: Record<
    LeadStatus,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    new: "secondary",
    contacted: "default",
    no_response: "secondary",
    info_sent: "outline",
    interested: "outline",
    meeting_booked: "outline",
    proposal_sent: "outline",
    closed_won: "outline",
    closed_lost: "destructive",
    not_interested: "destructive",
    bad_fit: "secondary",
  };

  return statusColorMap[status] || "secondary";
};

export const getLeadStatusColor = (status: LeadStatus): string => {
  const colorMap: Record<LeadStatus, string> = {
    new: "bg-gray-100 text-gray-800 border-gray-300",
    contacted: "bg-blue-100 text-blue-800 border-blue-300",
    no_response: "bg-slate-100 text-slate-800 border-slate-300",
    info_sent: "bg-cyan-100 text-cyan-800 border-cyan-300",
    interested: "bg-yellow-100 text-yellow-800 border-yellow-300",
    meeting_booked: "bg-purple-100 text-purple-800 border-purple-300",
    proposal_sent: "bg-orange-100 text-orange-800 border-orange-300",
    closed_won: "bg-green-100 text-green-800 border-green-300",
    closed_lost: "bg-red-100 text-red-800 border-red-300",
    not_interested: "bg-red-100 text-red-800 border-red-300",
    bad_fit: "bg-gray-100 text-gray-800 border-gray-300",
  };

  return colorMap[status] || "bg-gray-100 text-gray-800 border-gray-300";
};
