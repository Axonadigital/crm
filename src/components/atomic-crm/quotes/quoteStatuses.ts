import type { QuoteStatus } from "../types";

export const quoteStatusColors: Record<
  QuoteStatus,
  "secondary" | "outline" | "default" | "destructive"
> = {
  draft: "secondary",
  generated: "outline",
  sent: "default",
  viewed: "default",
  signed: "default",
  declined: "destructive",
  expired: "secondary",
};

export const quoteStatusList: QuoteStatus[] = [
  "draft",
  "generated",
  "sent",
  "viewed",
  "signed",
  "declined",
  "expired",
];
