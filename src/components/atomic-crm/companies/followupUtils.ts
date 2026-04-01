import { differenceInCalendarDays } from "date-fns";

export type FollowupUrgency = "overdue" | "today" | "soon" | "future";

export const getFollowupUrgency = (
  dateString: string | undefined | null,
): FollowupUrgency | null => {
  if (!dateString) return null;

  const date = new Date(dateString);
  const today = new Date();
  const diff = differenceInCalendarDays(date, today);

  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 3) return "soon";
  return "future";
};

export const getFollowupUrgencyColor = (
  urgency: FollowupUrgency | null,
): string => {
  switch (urgency) {
    case "overdue":
      return "bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200";
    case "today":
      return "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900 dark:text-orange-200";
    case "soon":
      return "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200";
    case "future":
      return "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400";
    default:
      return "";
  }
};

export const getFollowupRelativeLabel = (
  dateString: string | undefined | null,
): string => {
  if (!dateString) return "";

  const date = new Date(dateString);
  const today = new Date();
  const diff = differenceInCalendarDays(date, today);

  if (diff < -1) return `Försenad ${Math.abs(diff)} dagar`;
  if (diff === -1) return "Försenad 1 dag";
  if (diff === 0) return "Idag";
  if (diff === 1) return "Imorgon";
  if (diff <= 7) return `Om ${diff} dagar`;
  return new Date(dateString).toLocaleDateString("sv-SE");
};

export const getNextActionTypeLabel = (
  type: string | undefined | null,
): string => {
  if (!type) return "";

  const labels: Record<string, string> = {
    call: "Ring",
    email: "Mejla",
    meeting: "Möte",
    follow_up: "Följ upp",
    send_quote: "Skicka offert",
    other: "Övrigt",
  };

  return labels[type] || type;
};
