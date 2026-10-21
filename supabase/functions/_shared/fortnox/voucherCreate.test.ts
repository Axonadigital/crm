import { describe, expect, it } from "vitest";

import {
  bankAmount,
  buildVoucherPayload,
  isBalanced,
  reverseChargeRows,
  round2,
  simpleCostRows,
} from "./voucherCreate.ts";

// Synthetic amounts only — never real tenant data in fixtures.

describe("reverseChargeRows", () => {
  it("books net on the cost account and 25 % VAT on both 2645 and 2614", () => {
    const rows = reverseChargeRows(400, 4531);
    expect(rows).toEqual([
      { account: 1930, credit: 400 },
      { account: 4531, debit: 400 },
      { account: 2645, debit: 100 },
      { account: 2614, credit: 100 },
    ]);
    expect(isBalanced(rows)).toBe(true);
  });

  it("rounds the VAT to two decimals", () => {
    const rows = reverseChargeRows(123.45, 4535);
    expect(rows[2]).toEqual({ account: 2645, debit: 30.86 });
    expect(rows[3]).toEqual({ account: 2614, credit: 30.86 });
    expect(isBalanced(rows)).toBe(true);
  });
});

describe("simpleCostRows", () => {
  it("credits the bank and debits the cost account", () => {
    expect(simpleCostRows(39, 6570)).toEqual([
      { account: 1930, credit: 39 },
      { account: 6570, debit: 39 },
    ]);
  });
});

describe("buildVoucherPayload", () => {
  const base = {
    external_id: "tx-1",
    description: "EXEMPELTJÄNST",
    transaction_date: "2026-10-18",
    rows: reverseChargeRows(100, 4531),
  };

  it("produces the Fortnox Voucher envelope with series A by default", () => {
    const payload = buildVoucherPayload(base);
    expect(payload.Voucher.VoucherSeries).toBe("A");
    expect(payload.Voucher.TransactionDate).toBe("2026-10-18");
    expect(payload.Voucher.Description).toBe("EXEMPELTJÄNST");
    expect(payload.Voucher.VoucherRows).toEqual([
      { Account: 1930, Debit: 0, Credit: 100 },
      { Account: 4531, Debit: 100, Credit: 0 },
      { Account: 2645, Debit: 25, Credit: 0 },
      { Account: 2614, Debit: 0, Credit: 25 },
    ]);
  });

  it("drops rows where both sides are zero", () => {
    const payload = buildVoucherPayload({
      ...base,
      rows: [...base.rows, { account: 6570, debit: 0 }],
    });
    expect(payload.Voucher.VoucherRows).toHaveLength(4);
  });

  it("rejects an unbalanced voucher and names the external id", () => {
    expect(() =>
      buildVoucherPayload({
        ...base,
        rows: [
          { account: 1930, credit: 100 },
          { account: 6540, debit: 99 },
        ],
      }),
    ).toThrow(/tx-1: unbalanced/);
  });

  it("rejects bad dates, missing descriptions and single-row vouchers", () => {
    expect(() =>
      buildVoucherPayload({ ...base, transaction_date: "18/10/2026" }),
    ).toThrow(/YYYY-MM-DD/);
    expect(() => buildVoucherPayload({ ...base, description: " " })).toThrow(
      /description/,
    );
    expect(() =>
      buildVoucherPayload({ ...base, rows: [{ account: 1930, credit: 1 }] }),
    ).toThrow(/two rows/);
  });

  it("rejects a row with both debit and credit, and negative amounts", () => {
    expect(() =>
      buildVoucherPayload({
        ...base,
        rows: [
          { account: 1930, credit: 10, debit: 10 },
          { account: 6540, debit: 0 },
        ],
      }),
    ).toThrow(/both debit and credit/);
    expect(() =>
      buildVoucherPayload({
        ...base,
        rows: [
          { account: 1930, credit: -10 },
          { account: 6540, debit: -10 },
        ],
      }),
    ).toThrow(/negative/);
  });
});

describe("bankAmount / round2", () => {
  it("extracts the bank movement for duplicate detection", () => {
    expect(bankAmount(reverseChargeRows(57.5, 4531))).toEqual({
      debit: 0,
      credit: 57.5,
    });
  });

  it("round2 handles classic float noise", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
