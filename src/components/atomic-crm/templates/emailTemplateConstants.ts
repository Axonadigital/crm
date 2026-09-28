/**
 * Shared category presentation for e-mail templates, used by both the desktop
 * table (EmailTemplateList) and the mobile list (MobileEmailTemplatesList) so
 * the colored badges and labels stay in sync across breakpoints.
 */

export const emailTemplateCategoryColors: Record<string, string> = {
  outreach: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  followup:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  meeting_request:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  proposal: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  thank_you: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
};

export const emailTemplateCategoryLabels: Record<string, string> = {
  outreach: "Outreach",
  followup: "Uppföljning",
  meeting_request: "Mötesförfrågan",
  proposal: "Offert",
  thank_you: "Tack",
};
