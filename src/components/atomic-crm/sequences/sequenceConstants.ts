/**
 * Shared status/trigger presentation for sequences, used by both the desktop
 * table (SequenceList) and the mobile list (MobileSequencesList) so the colored
 * badges and labels stay in sync across breakpoints.
 */

export const sequenceStatusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  paused:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

export const sequenceStatusLabels: Record<string, string> = {
  draft: "Utkast",
  active: "Aktiv",
  paused: "Pausad",
};

export const sequenceTriggerLabels: Record<string, string> = {
  manual: "Manuell",
  new_lead: "Ny lead",
  segment_change: "Segmentändring",
};
