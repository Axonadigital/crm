import { LeadImportRunList } from "./LeadImportRunList";
import { LeadImportSourceList } from "./LeadImportSourceList";

export const leadImportSources = {
  list: LeadImportSourceList,
  recordRepresentation: (record: { name: string }) => record.name,
};

export const leadImportRuns = {
  list: LeadImportRunList,
  recordRepresentation: (record: { id: number }) => `Run #${record.id}`,
};
