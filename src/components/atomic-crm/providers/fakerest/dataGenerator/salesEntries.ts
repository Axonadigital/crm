import { random } from "faker/locale/en_US";
import { startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";

import type { SalesEntry } from "../../../types";
import type { Db } from "./types";

export const generateSalesEntries = (db: Db): SalesEntry[] => {
  const entries: SalesEntry[] = [];
  let id = 0;
  const now = new Date();

  // Generate 12 monthly entries
  for (let i = 0; i < 12; i++) {
    const periodDate = startOfMonth(subMonths(now, i));
    const sale = random.arrayElement(db.sales);
    entries.push({
      id: id++,
      amount: random.number({ min: 10000, max: 150000 }),
      period_type: "month",
      period_date: periodDate.toISOString().split("T")[0],
      description: i === 0 ? "Pågående månad" : undefined,
      sales_id: sale.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // Generate 8 weekly entries
  for (let i = 0; i < 8; i++) {
    const periodDate = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
    const sale = random.arrayElement(db.sales);
    entries.push({
      id: id++,
      amount: random.number({ min: 5000, max: 50000 }),
      period_type: "week",
      period_date: periodDate.toISOString().split("T")[0],
      description: i === 0 ? "Pågående vecka" : undefined,
      sales_id: sale.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return entries;
};
