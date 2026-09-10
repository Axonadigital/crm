import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  hasSignature,
  renderHtmlEmail,
  renderHtmlSignature,
  renderTextEmail,
  renderTextSignature,
  signatureConfigFromEnv,
  type SignatureConfig,
} from "./signature";

const full: SignatureConfig = {
  name: "Rasmus Joonsson",
  title: "Grundare, Axona Digital",
  phone: "070 123 45 67",
  email: "rasmus@axonadigital.com",
  website: "axonadigital.se",
  photoUrl: "https://axonadigital.se/rasmus.jpg",
  logoUrl: "https://axonadigital.se/logo.png",
  linkedinUrl: "https://linkedin.com/in/rasmus",
};

describe("signatureConfigFromEnv", () => {
  it("faller tillbaka på Gmail-avsändaren när signaturfälten saknas", () => {
    const env: Record<string, string> = {
      GMAIL_FROM_NAME: "Rasmus Joonsson",
      GMAIL_FROM_EMAIL: "rasmus@axonadigital.com",
    };
    const cfg = signatureConfigFromEnv((k) => env[k]);
    expect(cfg.name).toBe("Rasmus Joonsson");
    expect(cfg.email).toBe("rasmus@axonadigital.com");
    expect(cfg.photoUrl).toBe("");
  });

  it("tål att allt saknas", () => {
    const cfg = signatureConfigFromEnv(() => undefined);
    expect(hasSignature(cfg)).toBe(false);
  });
});

describe("renderTextSignature", () => {
  it("är mager — namn, titel, telefon och sajt", () => {
    expect(renderTextSignature(full)).toBe(
      "Rasmus Joonsson\nGrundare, Axona Digital\n070 123 45 67 · axonadigital.se",
    );
  });

  it("hoppar över tomma fält utan att lämna skiljetecken", () => {
    const bara = { ...full, title: "", phone: "", website: "" };
    expect(renderTextSignature(bara)).toBe("Rasmus Joonsson");
  });
});

describe("renderHtmlSignature", () => {
  it("visar porträttet med explicit storlek och alt-text", () => {
    const html = renderHtmlSignature(full);
    expect(html).toContain('width="56"');
    expect(html).toContain('height="56"');
    expect(html).toContain('alt="Rasmus Joonsson"');
  });

  it("utelämnar bilden helt när URL saknas — hellre ingen än trasig", () => {
    const html = renderHtmlSignature({ ...full, photoUrl: "", logoUrl: "" });
    expect(html).not.toContain("<img");
    expect(html).toContain("Rasmus Joonsson");
  });

  it("lägger till https på en bar domän", () => {
    expect(renderHtmlSignature(full)).toContain(
      'href="https://axonadigital.se"',
    );
  });

  it("använder tabell och inline-stilar för Outlooks skull", () => {
    const html = renderHtmlSignature(full);
    expect(html).toContain("<table");
    expect(html).toContain('role="presentation"');
    expect(html).not.toContain("<style");
    expect(html).not.toContain("class=");
  });
});

describe("escapeHtml", () => {
  it("escapar tecken som annars bryter markupen", () => {
    expect(escapeHtml('Bygg & Co <"test">')).toBe(
      "Bygg &amp; Co &lt;&quot;test&quot;&gt;",
    );
  });
});

describe("renderHtmlEmail", () => {
  it("gör stycken av tomrader och radbrytningar av enkla brytningar", () => {
    const html = renderHtmlEmail("Hej!\n\nRad ett\nRad två", full);
    expect(html).toContain("<p style=\"margin:0 0 14px 0;\">Hej!</p>");
    expect(html).toContain("Rad ett<br>Rad två");
  });

  it("escapar bolagsnamn med & så markupen inte går sönder", () => {
    const html = renderHtmlEmail("Hej Bygg & Co <AB>", full);
    expect(html).toContain("Bygg &amp; Co &lt;AB&gt;");
    expect(html).not.toContain("<AB>");
  });

  it("utan signatur blir det bara brödtexten", () => {
    const tom = signatureConfigFromEnv(() => undefined);
    const html = renderHtmlEmail("Hej!", tom);
    expect(html).not.toContain("<table");
  });
});

describe("renderTextEmail", () => {
  it("lägger signaturen efter brödtexten med tomrad", () => {
    expect(renderTextEmail("Hej!\n\nHälsningar", full)).toBe(
      "Hej!\n\nHälsningar\n\nRasmus Joonsson\nGrundare, Axona Digital\n070 123 45 67 · axonadigital.se",
    );
  });

  it("lämnar texten orörd när ingen signatur är konfigurerad", () => {
    const tom = signatureConfigFromEnv(() => undefined);
    expect(renderTextEmail("Hej!", tom)).toBe("Hej!");
  });
});
