/**
 * Builders for CREATING Fortnox vouchers (POST /3/vouchers).
 *
 * Why this exists: Fortnox's public API exposes no bank feed (bankhändelser),
 * so card subscriptions drawn from the bank account can only be booked by
 * posting the voucher ourselves from a bank export. Everything here is pure so
 * the balancing and VAT maths can be unit tested without a tenant.
 *
 * Accounting conventions encoded here (BAS, kontantmetod):
 *   - Bank account 1930 is credited for every outgoing payment.
 *   - Foreign services use reverse-charge VAT: cost on 4531 (outside EU) or
 *     4535 (inside EU), plus 2614 (output VAT, credit) and 2645 (input VAT,
 *     debit) at 25 % — they net to zero but must both be present for the
 *     VAT return (ruta 21/22 + 48).
 *   - Swedish VAT-free fees (bank) go straight to a 6xxx account.
 */

export const BANK_ACCOUNT = 1930;
export const REVERSE_CHARGE_OUTPUT_VAT = 2614;
export const REVERSE_CHARGE_INPUT_VAT = 2645;
export const REVERSE_CHARGE_RATE = 0.25;

export type VoucherRowInput = {
  account: number;
  debit?: number;
  credit?: number;
};

export type VoucherInput = {
  /** Caller's own id, echoed back so results can be matched to bank rows. */
  external_id: string;
  description: string;
  /** ISO date, YYYY-MM-DD. */
  transaction_date: string;
  voucher_series?: string;
  rows: VoucherRowInput[];
};

export type FortnoxVoucherRowPayload = {
  Account: number;
  Debit: number;
  Credit: number;
};

export type FortnoxVoucherPayload = {
  Voucher: {
    Description: string;
    TransactionDate: string;
    VoucherSeries: string;
    VoucherRows: FortnoxVoucherRowPayload[];
  };
};

export const DEFAULT_VOUCHER_SERIES = "A";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Tolerance for floating point noise when checking debit = credit. */
const BALANCE_TOLERANCE = 0.005;

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Rows for a plain Swedish cost with no VAT split (e.g. bank fees):
 * cost account debit, bank credit.
 */
export function simpleCostRows(
  amount: number,
  costAccount: number,
): VoucherRowInput[] {
  const a = round2(amount);
  return [
    { account: BANK_ACCOUNT, credit: a },
    { account: costAccount, debit: a },
  ];
}

/**
 * Rows for a foreign service under reverse charge: the net amount on the
 * cost account, and 25 % computed VAT booked both as output (2614) and input
 * (2645) so the return shows it while the net effect on the result is zero.
 */
export function reverseChargeRows(
  amount: number,
  costAccount: number,
  rate: number = REVERSE_CHARGE_RATE,
): VoucherRowInput[] {
  const a = round2(amount);
  const vat = round2(a * rate);
  return [
    { account: BANK_ACCOUNT, credit: a },
    { account: costAccount, debit: a },
    { account: REVERSE_CHARGE_INPUT_VAT, debit: vat },
    { account: REVERSE_CHARGE_OUTPUT_VAT, credit: vat },
  ];
}

export function sumDebit(rows: VoucherRowInput[]): number {
  return round2(rows.reduce((s, r) => s + (r.debit ?? 0), 0));
}

export function sumCredit(rows: VoucherRowInput[]): number {
  return round2(rows.reduce((s, r) => s + (r.credit ?? 0), 0));
}

export function isBalanced(rows: VoucherRowInput[]): boolean {
  return Math.abs(sumDebit(rows) - sumCredit(rows)) < BALANCE_TOLERANCE;
}

/** The amount that left (or entered) the bank account, for duplicate checks. */
export function bankAmount(rows: VoucherRowInput[]): {
  debit: number;
  credit: number;
} {
  const bank = rows.filter((r) => r.account === BANK_ACCOUNT);
  return { debit: sumDebit(bank), credit: sumCredit(bank) };
}

/**
 * Validates one input and returns the Fortnox payload. Throws with a message
 * naming the external_id, so a batch caller can report which row is wrong.
 */
export function buildVoucherPayload(input: VoucherInput): FortnoxVoucherPayload {
  const id = input.external_id || "(no id)";

  if (!input.description || input.description.trim() === "") {
    throw new Error(`${id}: description is required`);
  }
  if (!ISO_DATE.test(input.transaction_date)) {
    throw new Error(`${id}: transaction_date must be YYYY-MM-DD`);
  }
  if (!Array.isArray(input.rows) || input.rows.length < 2) {
    throw new Error(`${id}: at least two rows are required`);
  }
  for (const row of input.rows) {
    if (!Number.isInteger(row.account) || row.account < 1000) {
      throw new Error(`${id}: invalid account ${String(row.account)}`);
    }
    const debit = row.debit ?? 0;
    const credit = row.credit ?? 0;
    if (debit < 0 || credit < 0) {
      throw new Error(`${id}: negative amounts are not allowed`);
    }
    if (debit > 0 && credit > 0) {
      throw new Error(`${id}: a row cannot have both debit and credit`);
    }
  }
  if (!isBalanced(input.rows)) {
    throw new Error(
      `${id}: unbalanced voucher (debit ${sumDebit(input.rows)} vs credit ${sumCredit(input.rows)})`,
    );
  }

  return {
    Voucher: {
      Description: input.description.trim().slice(0, 200),
      TransactionDate: input.transaction_date,
      VoucherSeries: input.voucher_series ?? DEFAULT_VOUCHER_SERIES,
      VoucherRows: input.rows
        // Fortnox rejects rows where both sides are zero.
        .filter((r) => (r.debit ?? 0) > 0 || (r.credit ?? 0) > 0)
        .map((r) => ({
          Account: r.account,
          Debit: round2(r.debit ?? 0),
          Credit: round2(r.credit ?? 0),
        })),
    },
  };
}
