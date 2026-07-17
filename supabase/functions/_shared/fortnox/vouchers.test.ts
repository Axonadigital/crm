import { describe, expect, it } from "vitest";

import { mapVoucherDetail, voucherKeyFromList } from "./vouchers.ts";

const NOW = "2026-07-17T12:00:00.000Z";

describe("voucherKeyFromList", () => {
  it("extracts series + number + year from a list item", () => {
    const key = voucherKeyFromList(
      { VoucherSeries: "A", VoucherNumber: 4, Year: 1 },
      1,
    );
    expect(key).toEqual({ series: "A", number: 4, year: 1 });
  });

  it("falls back to the queried year when the item omits Year", () => {
    const key = voucherKeyFromList({ VoucherSeries: "A", VoucherNumber: 4 }, 7);
    expect(key).toEqual({ series: "A", number: 4, year: 7 });
  });

  it("returns null when series or number is missing", () => {
    expect(voucherKeyFromList({ VoucherNumber: 4 }, 1)).toBeNull();
    expect(voucherKeyFromList({ VoucherSeries: "A" }, 1)).toBeNull();
  });
});

describe("mapVoucherDetail", () => {
  it("maps a Claude subscription voucher (reverse-charge VAT) into voucher + rows", () => {
    const mapped = mapVoucherDetail(
      {
        Voucher: {
          VoucherSeries: "A",
          VoucherNumber: 4,
          Year: 1,
          TransactionDate: "2026-07-05",
          Description: "CLAUDE.AI SUBSCRIPTION",
          VoucherRows: [
            {
              Account: 1930,
              Description: "Företagskonto",
              Debit: 0,
              Credit: 855,
            },
            {
              Account: 4531,
              Description: "Inköp tjänst utanför EU",
              Debit: 855,
              Credit: 0,
            },
          ],
        },
      },
      1,
      NOW,
    );

    expect(mapped).not.toBeNull();
    expect(mapped!.voucher).toMatchObject({
      voucher_series: "A",
      voucher_number: 4,
      financial_year: 1,
      voucher_date: "2026-07-05",
      description: "CLAUDE.AI SUBSCRIPTION",
      synced_at: NOW,
    });
    expect(mapped!.rows).toEqual([
      {
        voucher_series: "A",
        voucher_number: 4,
        financial_year: 1,
        row_index: 0,
        account: 1930,
        account_description: "Företagskonto",
        debit: 0,
        credit: 855,
      },
      {
        voucher_series: "A",
        voucher_number: 4,
        financial_year: 1,
        row_index: 1,
        account: 4531,
        account_description: "Inköp tjänst utanför EU",
        debit: 855,
        credit: 0,
      },
    ]);
  });

  it("accepts a bare voucher object (no Voucher wrapper)", () => {
    const mapped = mapVoucherDetail(
      {
        VoucherSeries: "A",
        VoucherNumber: 3,
        TransactionDate: "2026-07-02",
        Description: "OPENAI",
        VoucherRows: [{ Account: 4531, Debit: 59.97, Credit: 0 }],
      },
      1,
      NOW,
    );

    expect(mapped!.voucher.description).toBe("OPENAI");
    expect(mapped!.rows).toHaveLength(1);
    expect(mapped!.rows[0]).toMatchObject({ account: 4531, debit: 59.97 });
  });

  it("skips rows flagged Removed and rows without an account", () => {
    const mapped = mapVoucherDetail(
      {
        Voucher: {
          VoucherSeries: "A",
          VoucherNumber: 9,
          TransactionDate: "2026-07-10",
          Description: "CORRECTED",
          VoucherRows: [
            { Account: 4531, Debit: 100, Credit: 0 },
            { Account: 4531, Debit: 100, Credit: 0, Removed: true },
            { Debit: 50, Credit: 0 },
          ],
        },
      },
      1,
      NOW,
    );

    expect(mapped!.rows).toHaveLength(1);
    expect(mapped!.rows[0].row_index).toBe(0);
  });

  it("defaults missing debit/credit to 0 and coerces string amounts", () => {
    const mapped = mapVoucherDetail(
      {
        Voucher: {
          VoucherSeries: "A",
          VoucherNumber: 12,
          Description: "FIGMA",
          VoucherRows: [{ Account: "4531", Debit: "329.00" }],
        },
      },
      1,
      NOW,
    );

    expect(mapped!.rows[0]).toMatchObject({
      account: 4531,
      debit: 329,
      credit: 0,
    });
  });

  it("returns null when the voucher has no series or number", () => {
    expect(
      mapVoucherDetail({ Voucher: { VoucherNumber: 1 } }, 1, NOW),
    ).toBeNull();
  });
});
