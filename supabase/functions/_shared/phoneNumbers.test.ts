// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  choosePrimaryPhone,
  createPhoneEntries,
  extractPhoneNumbersFromText,
  mergePhoneNumbers,
  parseStoredPhoneNumbers,
} from "./phoneNumbers";

describe("phoneNumbers helpers", () => {
  it("extracts multiple phone numbers from text", () => {
    expect(
      extractPhoneNumbersFromText(
        "Ring oss på 08-123 45 67 eller +46 70 123 45 67 redan idag.",
      ),
    ).toEqual(["08 123 45 67", "+46 70 123 45 67"]);
  });

  it("merges and deduplicates phone numbers while preserving order", () => {
    const merged = mergePhoneNumbers(
      createPhoneEntries(["08-123 45 67"], "google_places"),
      createPhoneEntries(["08 123 45 67", "+46 70 123 45 67"], "serper"),
    );

    expect(merged).toEqual([
      { number: "08 123 45 67", source: "google_places" },
      { number: "+46 70 123 45 67", source: "serper" },
    ]);
  });

  it("prefers existing primary phone over discovered numbers", () => {
    const phones = createPhoneEntries(["08-123 45 67"], "google_places");

    expect(choosePrimaryPhone("010-555 12 34", phones)).toBe("010 555 12 34");
    expect(choosePrimaryPhone(null, phones)).toBe("08 123 45 67");
  });

  it("parses stored phone arrays defensively", () => {
    expect(
      parseStoredPhoneNumbers([
        { number: "08-123 45 67", source: "existing" },
        { foo: "bar" },
        null,
      ]),
    ).toEqual([{ number: "08 123 45 67", source: "existing" }]);
  });

  it("tar inte datum, postnummer eller för korta nummer", () => {
    expect(extractPhoneNumbersFromText("Registrerat 2025-09-29, Östersund")).toEqual([]);
    expect(extractPhoneNumbersFromText("Postadress 835 97 Offerdal, reg 2026-08-10")).toEqual([]);
    expect(extractPhoneNumbersFromText("Ring 063-10 20 50 eller 070-362 58 42")).toEqual(["063 10 20 50", "070 362 58 42"]);
  });
});
