import type {
  CalendarEvent,
  Company,
  Contact,
  ContactNote,
  Deal,
  DealNote,
  Sale,
  SalesEntry,
  Tag,
  Task,
} from "../../../types";
import type { ConfigurationContextValue } from "../../../root/ConfigurationContext";

export interface Db {
  companies: Required<Company>[];
  contacts: Required<Contact>[];
  contact_notes: ContactNote[];
  deals: Deal[];
  deal_notes: DealNote[];
  sales: Sale[];
  sales_entries: SalesEntry[];
  tags: Tag[];
  tasks: Task[];
  calendar_events: CalendarEvent[];
  configuration: Array<{ id: number; config: ConfigurationContextValue }>;
}
