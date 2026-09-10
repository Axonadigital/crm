import { describe, expect, it } from "vitest";
import {
  bouncedRecipient,
  classifyMessage,
  decodePlainText,
  headerValue,
  isNegativeReply,
  parseAddress,
  stripQuotedReply,
  type GmailApiMessage,
  type GmailPayload,
} from "./gmailRead";

const OURS = ["rasmus@axonadigital.com", "info@axonadigital.se"];

/** Kodar text som Gmail gör: base64url i body.data. */
function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function msg(
  headers: Record<string, string>,
  extra: Partial<GmailApiMessage> = {},
  payload: Partial<GmailPayload> = {},
): GmailApiMessage {
  return {
    id: "m1",
    threadId: "t1",
    ...extra,
    payload: {
      mimeType: "text/plain",
      headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
      ...payload,
    },
  };
}

describe("parseAddress", () => {
  it("plockar adressen ur ett namn-och-adress-fält", () => {
    expect(parseAddress("Rasmus Joonsson <Rasmus@Axonadigital.com>")).toBe(
      "rasmus@axonadigital.com",
    );
  });

  it("klarar en bar adress", () => {
    expect(parseAddress("  INFO@Exempel.se ")).toBe("info@exempel.se");
  });

  it("returnerar null för skräp i stället för att kasta", () => {
    expect(parseAddress("mailer-daemon")).toBeNull();
    expect(parseAddress(null)).toBeNull();
  });
});

describe("headerValue", () => {
  it("är skiftlägesokänsligt", () => {
    const m = msg({ "MESSAGE-ID": "<abc>" });
    expect(headerValue(m.payload, "message-id")).toBe("<abc>");
  });

  it("ger tom sträng när rubriken saknas", () => {
    expect(headerValue(msg({}).payload, "Subject")).toBe("");
  });
});

describe("classifyMessage", () => {
  it("känner igen vårt eget utskick på SENT-etiketten", () => {
    const m = msg({ From: "Rasmus <rasmus@axonadigital.com>" }, {
      labelIds: ["SENT"],
    });
    expect(classifyMessage(m, OURS)).toBe("ours");
  });

  it("känner igen vårt eget utskick på avsändaradressen", () => {
    const m = msg({ From: "Rasmus <rasmus@axonadigital.com>" });
    expect(classifyMessage(m, OURS)).toBe("ours");
  });

  it("känner igen en studs från mailer-daemon", () => {
    const m = msg({
      From: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      Subject: "Delivery Status Notification (Failure)",
    });
    expect(classifyMessage(m, OURS)).toBe("bounce");
  });

  it("känner igen en studs på delivery-status-delen", () => {
    const m = msg(
      { From: "postmaster@exempel.se" },
      {},
      {
        mimeType: "multipart/report",
        parts: [
          { mimeType: "text/plain" },
          { mimeType: "message/delivery-status" },
        ],
      },
    );
    expect(classifyMessage(m, OURS)).toBe("bounce");
  });

  it("känner igen ett frånvaromejl på rubriken", () => {
    const m = msg({
      From: "anna@exempel.se",
      Subject: "Automatiskt svar: Kan man boka utan att ringa?",
    });
    expect(classifyMessage(m, OURS)).toBe("auto_reply");
  });

  it("känner igen ett frånvaromejl på Auto-Submitted", () => {
    const m = msg({
      From: "anna@exempel.se",
      Subject: "Re: Hej",
      "Auto-Submitted": "auto-replied",
    });
    expect(classifyMessage(m, OURS)).toBe("auto_reply");
  });

  it("låter Auto-Submitted: no passera som riktigt svar", () => {
    const m = msg({
      From: "anna@exempel.se",
      Subject: "Re: Hej",
      "Auto-Submitted": "no",
    });
    expect(classifyMessage(m, OURS)).toBe("reply");
  });

  it("räknar allt annat som ett riktigt svar", () => {
    const m = msg({ From: "Anna <anna@exempel.se>", Subject: "Re: Hej" });
    expect(classifyMessage(m, OURS)).toBe("reply");
  });
});

describe("decodePlainText", () => {
  it("avkodar ren text med svenska tecken", () => {
    const m = msg({}, {}, { body: { data: b64("Hej! Låter bra, hör av dig.") } });
    expect(decodePlainText(m.payload)).toBe("Hej! Låter bra, hör av dig.");
  });

  it("väljer text/plain framför text/html", () => {
    const payload: GmailPayload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64("ren text") } },
        { mimeType: "text/html", body: { data: b64("<p>html</p>") } },
      ],
    };
    expect(decodePlainText(payload)).toBe("ren text");
  });

  it("faller tillbaka på HTML utan taggar när ren text saknas", () => {
    const payload: GmailPayload = {
      mimeType: "text/html",
      body: { data: b64("<p>Hej</p><p>d&aring; kör vi</p>") },
    };
    expect(decodePlainText(payload).replace(/\n+/g, " ").trim()).toBe(
      "Hej då kör vi",
    );
  });
});

describe("stripQuotedReply", () => {
  it("klipper vid citatmarkörer", () => {
    const text = [
      "Låter intressant, ring gärna.",
      "",
      "Den ons 10 sep 2026 kl 09:12 skrev Rasmus:",
      "> Vill du inte höra mer från mig är det bara att säga till.",
    ].join("\n");
    expect(stripQuotedReply(text)).toBe("Låter intressant, ring gärna.");
  });

  it("klipper vid Outlooks ursprungliga meddelande", () => {
    const text = "Nej tack.\n\n-----Ursprungligt meddelande-----\nFrån: Rasmus";
    expect(stripQuotedReply(text)).toBe("Nej tack.");
  });
});

describe("isNegativeReply", () => {
  it("hittar tydliga avböjanden", () => {
    for (const text of [
      "Nej",
      "Nej tack, vi har redan en byrå.",
      "Vi är inte intresserade.",
      "Ta bort oss från er lista.",
      "Sluta mejla mig.",
      "Not interested, please remove me.",
    ]) {
      expect(isNegativeReply(text), text).toBe(true);
    }
  });

  it("räknar INTE vår egen avslutningsrad i citatet som ett nej", () => {
    const text = [
      "Hej Rasmus, absolut — hör av dig på måndag!",
      "",
      "> Vill du inte höra mer från mig är det bara att säga till.",
    ].join("\n");
    expect(isNegativeReply(text)).toBe(false);
  });

  it("räknar inte ett positivt svar som nej", () => {
    expect(isNegativeReply("Ja, skicka gärna listan!")).toBe(false);
    expect(isNegativeReply("Låter spännande, vad kostar det?")).toBe(false);
  });

  it("tomt svar är inte ett nej", () => {
    expect(isNegativeReply("   ")).toBe(false);
  });
});

describe("bouncedRecipient", () => {
  it("läser X-Failed-Recipients", () => {
    const m = msg({ "X-Failed-Recipients": "info@borta.se" });
    expect(bouncedRecipient(m)).toBe("info@borta.se");
  });

  it("läser Final-Recipient ur studsens brödtext", () => {
    const m = msg(
      { From: "mailer-daemon@googlemail.com" },
      {},
      {
        body: {
          data: b64("Final-Recipient: rfc822; kontakt@finnsinte.se\nAction: failed"),
        },
      },
    );
    expect(bouncedRecipient(m)).toBe("kontakt@finnsinte.se");
  });

  it("returnerar null när adressen inte går att utläsa", () => {
    const m = msg({ From: "mailer-daemon@googlemail.com" }, { snippet: "fel" });
    expect(bouncedRecipient(m)).toBeNull();
  });
});
