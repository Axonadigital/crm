import { describe, expect, it } from "vitest";
import { PAKET, PAKET_FOR_FAMILY, paketBody, paketSubject } from "./paketCopy.ts";
import { FAMILIES } from "./krokCopy.ts";

describe("paketCopy", () => {
  it("varje krokfamilj har ett paket", () => {
    for (const f of Object.keys(FAMILIES)) expect(PAKET_FOR_FAMILY[f as keyof typeof PAKET_FOR_FAMILY]).toBeDefined();
  });
  it("paketmejlet listar innehållet, pekar på tjänstesidan och föreslår ett samtal", () => {
    const body = paketBody({ greeting: "Hej Pär!", namn: "Nimoz Elinstallation", paket: "hemsida", assetUrl: "https://x.se/bild.png", resultatkort: "Ett exempel på vad det ger: Östersunds Elservice hade i augusti 2026 1 240 visningar.", referens: "Östersunds Elservice" });
    expect(body).toContain("Tack för svaret");
    expect(body).toContain("– Ny startsida");
    expect(body).toContain(PAKET.hemsida.url);
    expect(body).toContain("https://x.se/bild.png");
    expect(body).toContain("Östersunds Elservice");
    expect(body).toContain("15 minuter i telefon");
  });
  it("innehåller inga priser och inga löften om deras resultat", () => {
    for (const paket of ["hemsida", "infrastruktur"] as const) {
      const body = paketBody({ greeting: "Hej!", namn: "Bolaget AB", paket, assetUrl: null, resultatkort: null, referens: null });
      expect(body).not.toMatch(/\d+ ?kr|kronor|fler kunder|förfrågningar|garant/i);
      expect(body).not.toContain("axonadigital.se/referenser");
    }
  });
  it("ämnesraden trådar på det kalla mejlet", () => {
    expect(paketSubject("nimoz.se i mobilen?")).toBe("Re: nimoz.se i mobilen?");
  });
});
