import { describe, expect, it } from "vitest";
import {
  base64UrlEncode,
  buildMimeMessage,
  encodeHeader,
  gmailConfigFromEnv,
  type GmailConfig,
} from "./gmail";

const config: GmailConfig = {
  clientId: "id",
  clientSecret: "secret",
  refreshToken: "refresh",
  fromEmail: "rasmus@axonadigital.com",
  fromName: "Rasmus Joonsson",
};

/** Plockar ut ett rubrikvärde ur det byggda meddelandet. */
function header(mime: string, name: string): string {
  const line = mime
    .split("\r\n\r\n")[0]
    .split("\r\n")
    .find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  return line ? line.slice(name.length + 1).trim() : "";
}

/** Avkodar base64-kroppen tillbaka till text. */
function body(mime: string): string {
  const raw = mime.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n/g, "");
  return new TextDecoder().decode(
    Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)),
  );
}

describe("encodeHeader", () => {
  it("lämnar ren ASCII orörd", () => {
    expect(encodeHeader("Hello there")).toBe("Hello there");
  });

  it("kodar svenska tecken enligt RFC 2047", () => {
    const encoded = encodeHeader("Hemsidan får 42 av 100");
    expect(encoded).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    const b64 = encoded.slice(10, -2);
    expect(
      new TextDecoder().decode(
        Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      ),
    ).toBe("Hemsidan får 42 av 100");
  });
});

describe("buildMimeMessage", () => {
  it("sätter avsändare, mottagare och ren text", () => {
    const mime = buildMimeMessage(config, {
      to: "info@exempel.se",
      subject: "Test",
      text: "Hej\nRad två",
    });
    expect(header(mime, "From")).toBe("Rasmus Joonsson <rasmus@axonadigital.com>");
    expect(header(mime, "To")).toBe("info@exempel.se");
    expect(header(mime, "Content-Type")).toBe('text/plain; charset="UTF-8"');
    expect(body(mime)).toBe("Hej\r\nRad två");
  });

  it("skickar INTE List-Unsubscribe — det signalerar massutskick", () => {
    const mime = buildMimeMessage(config, {
      to: "info@exempel.se",
      subject: "Test",
      text: "Hej",
    });
    expect(mime.toLowerCase()).not.toContain("list-unsubscribe");
  });

  it("är ren text när ingen HTML anges", () => {
    const mime = buildMimeMessage(config, {
      to: "info@exempel.se",
      subject: "Test",
      text: "Hej",
    });
    expect(mime).not.toContain("text/html");
    expect(mime).not.toContain("multipart");
    expect(header(mime, "Content-Type")).toBe('text/plain; charset="UTF-8"');
  });

  it("skickar multipart/alternative med TEXTEN FÖRST när HTML anges", () => {
    const mime = buildMimeMessage(config, {
      to: "info@exempel.se",
      subject: "Test",
      text: "Hej i text",
      html: "<p>Hej i html</p>",
    });
    expect(header(mime, "Content-Type")).toMatch(
      /^multipart\/alternative; boundary="axona_[a-f0-9]{32}"$/,
    );
    // RFC 2046: sista delen är den mest önskade. Text före HTML.
    expect(mime.indexOf("text/plain")).toBeLessThan(mime.indexOf("text/html"));
    expect(mime.trimEnd().endsWith("--")).toBe(true);
  });

  it("aldrig HTML utan textdel — det poängsätts av filter", () => {
    const mime = buildMimeMessage(config, {
      to: "a@b.se",
      subject: "x",
      text: "riktig text",
      html: "<p>x</p>",
    });
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
  });

  it("behåller svenska tecken i kroppen", () => {
    const mime = buildMimeMessage(config, {
      to: "info@exempel.se",
      subject: "Test",
      text: "Åsa på Öbergs bygg fick 42 poäng",
    });
    expect(body(mime)).toBe("Åsa på Öbergs bygg fick 42 poäng");
  });

  it("lägger till Reply-To bara när den anges", () => {
    const utan = buildMimeMessage(config, { to: "a@b.se", subject: "x", text: "y" });
    expect(header(utan, "Reply-To")).toBe("");
    const med = buildMimeMessage(config, {
      to: "a@b.se",
      subject: "x",
      text: "y",
      replyTo: "rasmus@axonadigital.se",
    });
    expect(header(med, "Reply-To")).toBe("rasmus@axonadigital.se");
  });

  it("citerar avsändarnamn som annars skulle dela adressen", () => {
    const mime = buildMimeMessage(
      { ...config, fromName: "Joonsson, Rasmus" },
      { to: "a@b.se", subject: "x", text: "y" },
    );
    expect(header(mime, "From")).toBe(
      '"Joonsson, Rasmus" <rasmus@axonadigital.com>',
    );
  });

  it("radbryter base64-kroppen på 76 tecken", () => {
    const mime = buildMimeMessage(config, {
      to: "a@b.se",
      subject: "x",
      text: "x".repeat(500),
    });
    const lines = mime.split("\r\n\r\n").slice(1).join("").split("\r\n");
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(76);
  });
});

describe("base64UrlEncode", () => {
  it("använder Gmails alfabet utan utfyllnad", () => {
    const out = base64UrlEncode(new TextEncoder().encode("??>>>>"));
    expect(out).not.toMatch(/[+/=]/);
  });
});

describe("gmailConfigFromEnv", () => {
  const full: Record<string, string> = {
    GMAIL_CLIENT_ID: "id",
    GMAIL_CLIENT_SECRET: "secret",
    GMAIL_REFRESH_TOKEN: "refresh",
    GMAIL_FROM_EMAIL: "rasmus@axonadigital.com",
    GMAIL_FROM_NAME: "Rasmus Joonsson",
  };

  it("läser hela konfigurationen", () => {
    expect(gmailConfigFromEnv((k) => full[k])?.fromEmail).toBe(
      "rasmus@axonadigital.com",
    );
  });

  it("returnerar null när en nyckel saknas i stället för att kasta", () => {
    const utan = { ...full };
    delete utan.GMAIL_REFRESH_TOKEN;
    expect(gmailConfigFromEnv((k) => utan[k])).toBeNull();
  });

  it("avsändarnamn är valfritt", () => {
    const utan = { ...full };
    delete utan.GMAIL_FROM_NAME;
    expect(gmailConfigFromEnv((k) => utan[k])?.fromName).toBe("");
  });
});
