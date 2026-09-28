export type LineItemInput = {
  quantity?: number;
  unit_price?: number;
};

export type QuoteTotals = {
  subtotal: number;
  discountAmount: number;
  afterDiscount: number;
  vatAmount: number;
  total: number;
};

export function calculateLineTotal(
  quantity: number | undefined,
  unitPrice: number | undefined,
): number {
  return (Number(quantity) || 0) * (Number(unitPrice) || 0);
}

export function calculateQuoteTotals(
  lineItems: LineItemInput[],
  vatRate: number,
  discountPct: number,
): QuoteTotals {
  const subtotal = (lineItems || []).reduce(
    (sum, item) =>
      sum + (Number(item?.quantity) || 0) * (Number(item?.unit_price) || 0),
    0,
  );

  const discountAmount = subtotal * (discountPct / 100);
  const afterDiscount = subtotal - discountAmount;
  const vatAmount = afterDiscount * (vatRate / 100);
  const total = afterDiscount + vatAmount;

  return { subtotal, discountAmount, afterDiscount, vatAmount, total };
}

export function formatCurrency(n: number): string {
  return n.toLocaleString("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
