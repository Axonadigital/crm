/**
 * Mapping between Fortnox vouchers (verifikationer / bokföring) and the
 * `fortnox_vouchers` + `fortnox_voucher_rows` mirror.
 *
 * This is the cost side that supplier invoices can't see: the company runs on
 * the cash method (kontantmetod), so most costs are subscriptions drawn
 * straight from the bank account and never become supplier invoices. Every one
 * of them IS a voucher, and the voucher's `Description` already names the
 * vendor ("OPENAI", "CLAUDE.AI SUBSCRIPTION") — which is exactly what makes
 * named-subscription tracking possible.
 *
 * The mapper stays dumb on purpose: it stores accounts, debits and credits
 * faithfully and lets the SQL views do all the accounting (revenue vs cost,
 * result, per-account, named recurring). Fortnox is loose about types the same
 * way it is for invoices, so every value is normalised through the shared
 * `toNumber` / `toDate` helpers.
 */

import { toDate, toNumber } from "./invoices.ts";

export type FortnoxVoucherListItem = Record<string, unknown>;

/** Minimal identity of a voucher — all that's needed to diff list vs mirror. */
export type VoucherKey = {
  series: string;
  number: number;
  year: number;
};

export type FortnoxVoucherRowRecord = {
  voucher_series: string;
  voucher_number: number;
  financial_year: number;
  row_index: number;
  account: number;
  account_description: string | null;
  debit: number;
  credit: number;
};

export type FortnoxVoucherRecord = {
  voucher_series: string;
  voucher_number: number;
  financial_year: number;
  voucher_date: string | null;
  description: string | null;
  reference_number: string | null;
  reference_type: string | null;
  raw: FortnoxVoucherListItem;
  synced_at: string;
};

export type MappedVoucher = {
  voucher: FortnoxVoucherRecord;
  rows: FortnoxVoucherRowRecord[];
};

function toText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number") return String(value);
  return null;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return value === "true";
}

/**
 * The voucher LIST endpoint returns just enough to identify each voucher
 * (series + number + year + date + description) but no rows or amounts — the
 * detail endpoint is needed for those. This extracts the key so the sync can
 * diff "what exists in Fortnox" against "what we've already mirrored".
 *
 * `defaultYear` is the financial-year id the list was queried with; the list
 * item carries `Year` too but not on every API version, so we fall back.
 */
export function voucherKeyFromList(
  raw: FortnoxVoucherListItem,
  defaultYear: number,
): VoucherKey | null {
  const series = toText(raw.VoucherSeries);
  const number = toNumber(raw.VoucherNumber);
  const year = toNumber(raw.Year) ?? defaultYear;
  if (series === null || number === null || year === null) return null;
  return { series, number, year };
}

/**
 * Maps a voucher DETAIL response (`{ Voucher: {...} }` or the bare voucher)
 * into the mirror shape. Rows flagged `Removed` are skipped — a posted
 * voucher shouldn't carry them, but a corrected one might, and a removed row
 * must never count toward a cost.
 *
 * `financialYear` is the id the detail was fetched under; it's part of the
 * primary key because voucher numbers restart per year.
 */
export function mapVoucherDetail(
  payload: Record<string, unknown>,
  financialYear: number,
  nowIso: string,
): MappedVoucher | null {
  const v = (payload.Voucher ?? payload) as FortnoxVoucherListItem;

  const series = toText(v.VoucherSeries);
  const number = toNumber(v.VoucherNumber);
  if (series === null || number === null) return null;

  const year = toNumber(v.Year) ?? financialYear;

  const rawRows = Array.isArray(v.VoucherRows) ? v.VoucherRows : [];
  const rows: FortnoxVoucherRowRecord[] = [];

  rawRows.forEach((rawRow, index) => {
    const row = rawRow as Record<string, unknown>;
    if (toBool(row.Removed)) return;

    const account = toNumber(row.Account);
    if (account === null) return;

    rows.push({
      voucher_series: series,
      voucher_number: number,
      financial_year: year,
      row_index: index,
      account,
      account_description: toText(row.Description),
      debit: toNumber(row.Debit) ?? 0,
      credit: toNumber(row.Credit) ?? 0,
    });
  });

  return {
    voucher: {
      voucher_series: series,
      voucher_number: number,
      financial_year: year,
      voucher_date: toDate(v.TransactionDate),
      description: toText(v.Description),
      reference_number: toText(v.ReferenceNumber),
      reference_type: toText(v.ReferenceType),
      raw: v,
      synced_at: nowIso,
    },
    rows,
  };
}
