import { describe, expect, it, vi } from "vitest";
import {
  deepMergeSections,
  SaveQuoteContentError,
  saveQuoteContent,
} from "./saveQuoteContent.ts";

describe("deepMergeSections", () => {
  it("replaces top-level primitive values", () => {
    const existing = { summary_pitch: "old", total: 1000 };
    const patch = { summary_pitch: "new" };
    expect(deepMergeSections(existing, patch)).toEqual({
      summary_pitch: "new",
      total: 1000,
    });
  });

  it("deep-merges nested plain objects so non-editable sub-fields survive", () => {
    const existing = {
      upgrade_package: {
        title: "Old title",
        price: "5000 kr",
        includes: ["a", "b"],
      },
    };
    const patch = {
      upgrade_package: { title: "New title" },
    };
    expect(deepMergeSections(existing, patch)).toEqual({
      upgrade_package: {
        title: "New title",
        price: "5000 kr",
        includes: ["a", "b"],
      },
    });
  });

  it("replaces arrays wholesale (not by index, not by merge)", () => {
    const existing = {
      problem_cards: [
        { number: "01", title: "A", text: "x" },
        { number: "02", title: "B", text: "y" },
      ],
    };
    const patch = {
      problem_cards: [{ number: "01", title: "Only one", text: "kept" }],
    };
    expect(deepMergeSections(existing, patch)).toEqual({
      problem_cards: [{ number: "01", title: "Only one", text: "kept" }],
    });
  });

  it("reference_projects is merged by index so url/link survive", () => {
    const existing = {
      reference_projects: [
        {
          type: "Web",
          title: "Old title",
          description: "Old desc",
          url: "https://keep-me.example",
        },
        {
          type: "Shop",
          title: "Second",
          description: "Second desc",
          link: "https://also-keep-me.example",
        },
      ],
    };
    const patch = {
      reference_projects: [
        { type: "Web", title: "New title", description: "New desc" },
        { type: "Shop", title: "Second edited", description: "desc2" },
      ],
    };
    const merged = deepMergeSections(existing, patch);
    expect(merged.reference_projects).toEqual([
      {
        type: "Web",
        title: "New title",
        description: "New desc",
        url: "https://keep-me.example",
      },
      {
        type: "Shop",
        title: "Second edited",
        description: "desc2",
        link: "https://also-keep-me.example",
      },
    ]);
  });

  it("reference_projects extends when patch has more entries than existing", () => {
    const existing = {
      reference_projects: [
        { type: "Web", title: "first", url: "https://a.example" },
      ],
    };
    const patch = {
      reference_projects: [
        { type: "Web", title: "first edited" },
        { type: "Shop", title: "second new" },
      ],
    };
    const merged = deepMergeSections(existing, patch) as {
      reference_projects: Array<Record<string, unknown>>;
    };
    expect(merged.reference_projects).toHaveLength(2);
    expect(merged.reference_projects[0]).toEqual({
      type: "Web",
      title: "first edited",
      url: "https://a.example",
    });
    expect(merged.reference_projects[1]).toEqual({
      type: "Shop",
      title: "second new",
    });
  });

  it("does not mutate the inputs", () => {
    const existing: Record<string, unknown> = {
      upgrade_package: { title: "A", price: "1" },
    };
    const patch: Record<string, unknown> = {
      upgrade_package: { title: "B" },
    };
    const existingSnap = JSON.parse(JSON.stringify(existing));
    const patchSnap = JSON.parse(JSON.stringify(patch));

    deepMergeSections(existing, patch);

    expect(existing).toEqual(existingSnap);
    expect(patch).toEqual(patchSnap);
  });

  it("keys present only in existing are preserved", () => {
    const existing = { a: 1, b: 2 };
    const patch = { a: 99 };
    expect(deepMergeSections(existing, patch)).toEqual({ a: 99, b: 2 });
  });

  it("null values in patch overwrite existing values", () => {
    const existing = { price_summary_bullets: ["one", "two"] };
    const patch = { price_summary_bullets: null };
    expect(deepMergeSections(existing, patch)).toEqual({
      price_summary_bullets: null,
    });
  });
});

describe("saveQuoteContent", () => {
  function makeSupabaseStub(options: {
    quote?: { id: number; generated_sections: unknown; status: string } | null;
    loadError?: unknown;
    updateError?: unknown;
  }) {
    const recordedUpdates: Array<Record<string, unknown>> = [];

    const client = {
      from: (_table: string) => ({
        select: (_columns: string) => ({
          eq: (_column: string, _value: unknown) => ({
            single: async () => ({
              data: options.quote ?? null,
              error: options.loadError ?? null,
            }),
          }),
        }),
        update: (values: Record<string, unknown>) => {
          recordedUpdates.push(values);
          return {
            eq: async (_column: string, _value: unknown) => ({
              data: null,
              error: options.updateError ?? null,
            }),
          };
        },
      }),
    };

    return { client, recordedUpdates };
  }

  it("throws SaveQuoteContentError(400) when sections is missing", async () => {
    const { client } = makeSupabaseStub({
      quote: { id: 1, generated_sections: {}, status: "generated" },
    });
    await expect(
      saveQuoteContent({
        supabase: client,
        quoteId: 1,
        // @ts-expect-error deliberately invalid
        sections: null,
        initiator: { source: "crm_seller", userId: "u1" },
      }),
    ).rejects.toThrow(SaveQuoteContentError);
  });

  it("throws 404 when the quote does not exist", async () => {
    const { client } = makeSupabaseStub({ quote: null });
    await expect(
      saveQuoteContent({
        supabase: client,
        quoteId: 42,
        sections: { summary_pitch: "x" },
        initiator: { source: "crm_seller", userId: "u1" },
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: "quote_not_found",
    });
  });

  it("throws 409 when the quote is already signed", async () => {
    const { client } = makeSupabaseStub({
      quote: { id: 1, generated_sections: {}, status: "signed" },
    });
    await expect(
      saveQuoteContent({
        supabase: client,
        quoteId: 1,
        sections: { summary_pitch: "x" },
        initiator: { source: "crm_seller", userId: "u1" },
      }),
    ).rejects.toMatchObject({ status: 409, code: "quote_locked" });
  });

  it("throws 409 when the quote is already declined", async () => {
    const { client } = makeSupabaseStub({
      quote: { id: 1, generated_sections: {}, status: "declined" },
    });
    await expect(
      saveQuoteContent({
        supabase: client,
        quoteId: 1,
        sections: { summary_pitch: "x" },
        initiator: { source: "public_editor", writeTokenVerified: true },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("merges incoming sections with existing and writes the merged result", async () => {
    const { client, recordedUpdates } = makeSupabaseStub({
      quote: {
        id: 7,
        generated_sections: {
          summary_pitch: "old",
          upgrade_package: { title: "A", price: "1" },
        },
        status: "generated",
      },
    });

    const result = await saveQuoteContent({
      supabase: client,
      quoteId: 7,
      sections: { upgrade_package: { title: "B" } },
      initiator: { source: "crm_seller", userId: "u1" },
    });

    expect(result.success).toBe(true);
    expect(result.mergedSections).toEqual({
      summary_pitch: "old",
      upgrade_package: { title: "B", price: "1" },
    });
    expect(recordedUpdates).toHaveLength(1);
    expect(recordedUpdates[0]).toEqual({
      generated_sections: {
        summary_pitch: "old",
        upgrade_package: { title: "B", price: "1" },
      },
    });
  });

  it("regeneratePdf is called after a successful save", async () => {
    const { client } = makeSupabaseStub({
      quote: { id: 9, generated_sections: {}, status: "generated" },
    });
    const regeneratePdf = vi
      .fn<(id: number | string) => Promise<string | null>>()
      .mockResolvedValue("https://example.com/new.html");

    const result = await saveQuoteContent({
      supabase: client,
      quoteId: 9,
      sections: { summary_pitch: "x" },
      initiator: { source: "crm_seller", userId: "u1" },
      regeneratePdf,
    });

    expect(regeneratePdf).toHaveBeenCalledWith(9);
    expect(result.pdfUrl).toBe("https://example.com/new.html");
  });

  it("swallows a failing regeneratePdf and still reports save success", async () => {
    const { client } = makeSupabaseStub({
      quote: { id: 10, generated_sections: {}, status: "generated" },
    });
    const regeneratePdf = vi
      .fn<(id: number | string) => Promise<string | null>>()
      .mockRejectedValue(new Error("PDF service down"));

    const result = await saveQuoteContent({
      supabase: client,
      quoteId: 10,
      sections: { summary_pitch: "x" },
      initiator: { source: "public_editor", writeTokenVerified: true },
      regeneratePdf,
    });

    expect(result.success).toBe(true);
    expect(result.pdfUrl).toBeNull();
  });

  it("public_editor and crm_seller initiators produce identical merged output", async () => {
    const existing = {
      summary_pitch: "existing",
      problem_cards: [{ number: "01", title: "A", text: "a" }],
      upgrade_package: {
        title: "Old",
        price: "1000",
        includes: ["keep"],
      },
      reference_projects: [
        { type: "Web", title: "Ref", url: "https://keep-me.example" },
      ],
    };

    const patch = {
      summary_pitch: "new summary",
      upgrade_package: { title: "New" },
      reference_projects: [
        { type: "Web", title: "Ref edited", description: "added" },
      ],
    };

    const pubStub = makeSupabaseStub({
      quote: { id: 1, generated_sections: existing, status: "generated" },
    });
    const crmStub = makeSupabaseStub({
      quote: { id: 1, generated_sections: existing, status: "generated" },
    });

    const [pubResult, crmResult] = await Promise.all([
      saveQuoteContent({
        supabase: pubStub.client,
        quoteId: 1,
        sections: patch,
        initiator: { source: "public_editor", writeTokenVerified: true },
      }),
      saveQuoteContent({
        supabase: crmStub.client,
        quoteId: 1,
        sections: patch,
        initiator: { source: "crm_seller", userId: "u1" },
      }),
    ]);

    expect(pubResult.mergedSections).toEqual(crmResult.mergedSections);
    expect(pubStub.recordedUpdates[0]).toEqual(crmStub.recordedUpdates[0]);
  });
});
