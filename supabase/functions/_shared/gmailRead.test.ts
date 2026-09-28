import { describe, expect, it } from "vitest";
import {
  bouncedRecipient,
  classifyMessage,
  decodePlainText,
  headerValue,
  isNegativeReply,
  parseAddress,
  signatureForAddress,
  stripQuotedReply,
  type GmailApiMessage,
  type GmailPayload,
  bounceSeverity,
  shouldSuppressOnBounce,
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

describe("signatureForAddress", () => {
  const aliases = [
    {
      sendAsEmail: "info@axonadigital.se",
      displayName: "Axona Digital",
      signature: "<p>KONTOTS signatur</p>",
      isDefault: true,
      isPrimary: true,
      verificationStatus: "accepted",
    },
    {
      sendAsEmail: "rasmus@axonadigital.com",
      displayName: "Rasmus Joonsson",
      signature: "<p>ALIASETS signatur</p>",
      isDefault: false,
      isPrimary: false,
      verificationStatus: "accepted",
    },
  ];

  it("tar aliasets signatur, inte kontots", () => {
    // Kontot är info@ och aliaset rasmus@ — utkorgen ska bära aliasets.
    expect(signatureForAddress(aliases, "rasmus@axonadigital.com")).toBe(
      "<p>ALIASETS signatur</p>",
    );
  });

  it("är skiftlägesokänslig", () => {
    expect(signatureForAddress(aliases, "  Rasmus@AxonaDigital.COM ")).toBe(
      "<p>ALIASETS signatur</p>",
    );
  });

  it("faller tillbaka på standardadressen när aliaset saknar signatur", () => {
    const utan = [aliases[0], { ...aliases[1], signature: "" }];
    expect(signatureForAddress(utan, "rasmus@axonadigital.com")).toBe(
      "<p>KONTOTS signatur</p>",
    );
  });

  it("tom sträng när ingen signatur finns alls", () => {
    expect(signatureForAddress([], "rasmus@axonadigital.com")).toBe("");
  });
});

// --- Studsens allvarlighetsgrad -------------------------------------------

/** Bygger ett meddelande med en riktig message/delivery-status-del. */
function dsnMessage(dsnBody: string, subject = "Delivery Status Notification"): GmailApiMessage {
  return {
    id: "m1",
    threadId: "t1",
    labelIds: ["INBOX"],
    payload: {
      mimeType: "multipart/report",
      headers: [
        { name: "From", value: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>" },
        { name: "Subject", value: subject },
        { name: "Content-Type", value: 'multipart/report; report-type=delivery-status; boundary="b"' },
      ],
      parts: [
        {
          mimeType: "text/plain",
          headers: [],
          body: { data: b64("Ditt meddelande kunde inte levereras.") },
        },
        {
          mimeType: "message/delivery-status",
          headers: [],
          body: { data: b64(dsnBody) },
        },
      ],
    },
  };
}

describe("bounceSeverity", () => {
  // Gmail, adressen finns inte. Permanent — ska spärras.
  it("5.x.x med Action: failed är hård studs", () => {
    const msg = dsnMessage(
      [
        "Reporting-MTA: dns; googlemail.com",
        "",
        "Final-Recipient: rfc822; finnsinte@exempel.se",
        "Action: failed",
        "Status: 5.1.1",
        "Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.",
      ].join("\n"),
    );
    expect(bounceSeverity(msg)).toBe("hard");
  });

  // Microsoft 365 avvisar. Också permanent.
  it("5.4.1 från Microsoft är hård studs", () => {
    const msg = dsnMessage(
      [
        "Final-Recipient: rfc822;user@contoso.com",
        "Action: failed",
        "Status: 5.4.1",
        "Diagnostic-Code: smtp;550 5.4.1 Recipient address rejected: Access denied.",
      ].join("\n"),
    );
    expect(bounceSeverity(msg)).toBe("hard");
  });

  // HELA POÄNGEN: en fördröjningsnotis får ALDRIG spärra adressen.
  it("4.x.x med Action: delayed är mjuk studs", () => {
    const msg = dsnMessage(
      [
        "Reporting-MTA: dns; googlemail.com",
        "",
        "Final-Recipient: rfc822; fungerar@exempel.se",
        "Action: delayed",
        "Status: 4.4.7",
        "Diagnostic-Code: smtp; Server busy, will retry",
      ].join("\n"),
      "Delivery Status Notification (Delay)",
    );
    expect(bounceSeverity(msg)).toBe("soft");
  });

  it("full brevlåda (4.2.2) är mjuk — den töms i morgon", () => {
    const msg = dsnMessage(
      ["Final-Recipient: rfc822; full@exempel.se", "Action: delayed", "Status: 4.2.2"].join("\n"),
    );
    expect(bounceSeverity(msg)).toBe("soft");
  });

  it("en leveranskvittens (2.x.x) är ingen studs alls", () => {
    const msg = dsnMessage(
      ["Final-Recipient: rfc822; ok@exempel.se", "Action: delivered", "Status: 2.0.0"].join("\n"),
    );
    expect(bounceSeverity(msg)).toBe("receipt");
  });

  it("Status väger tyngre än Action när de säger emot varandra", () => {
    const msg = dsnMessage(
      ["Final-Recipient: rfc822; a@b.se", "Action: delayed", "Status: 5.1.1"].join("\n"),
    );
    expect(bounceSeverity(msg)).toBe("hard");
  });

  // Flera mottagare i samma rapport: en permanent räcker för att spärra den.
  it("tar den allvarligaste graden när rapporten rör flera mottagare", () => {
    const msg = dsnMessage(
      [
        "Final-Recipient: rfc822; ok@exempel.se",
        "Action: delayed",
        "Status: 4.4.7",
        "",
        "Final-Recipient: rfc822; dod@exempel.se",
        "Action: failed",
        "Status: 5.1.1",
      ].join("\n"),
    );
    expect(bounceSeverity(msg)).toBe("hard");
  });

  it("faller tillbaka på ämnesraden när DSN-delen saknas", () => {
    const fail: GmailApiMessage = {
      id: "m2", threadId: "t2", labelIds: ["INBOX"],
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "mailer-daemon@googlemail.com" },
          { name: "Subject", value: "Delivery Status Notification (Failure)" },
        ],
        body: { data: b64("Address not found") },
      },
    };
    expect(bounceSeverity(fail)).toBe("hard");

    const delay: GmailApiMessage = {
      ...fail,
      payload: {
        ...fail.payload!,
        headers: [
          { name: "From", value: "mailer-daemon@googlemail.com" },
          { name: "Subject", value: "Delivery Status Notification (Delay)" },
        ],
      },
    };
    expect(bounceSeverity(delay)).toBe("soft");
  });

  it("hittar 550-koden i brödtexten när strukturen saknas", () => {
    const msg: GmailApiMessage = {
      id: "m3", threadId: "t3", labelIds: ["INBOX"],
      payload: {
        mimeType: "text/plain",
        headers: [{ name: "From", value: "postmaster@exempel.se" }],
        body: { data: b64("550 5.1.1 User unknown in virtual mailbox table") },
      },
    };
    expect(bounceSeverity(msg)).toBe("hard");
  });

  // Går det inte att avgöra spärrar vi INTE. En felaktig spärr är tyst och
  // permanent; att mejla en död adress en gång till syns och går att rätta.
  it("okänt format ger unknown, aldrig hard", () => {
    const msg: GmailApiMessage = {
      id: "m4", threadId: "t4", labelIds: ["INBOX"],
      payload: {
        mimeType: "text/plain",
        headers: [{ name: "From", value: "mailer-daemon@exempel.se" }],
        body: { data: b64("Något gick fel med ditt meddelande.") },
      },
    };
    expect(bounceSeverity(msg)).toBe("unknown");
  });

  it("tål meddelande helt utan innehåll", () => {
    expect(bounceSeverity({ id: "x", threadId: "y" })).toBe("unknown");
  });
});

describe("shouldSuppressOnBounce", () => {
  it("spärrar BARA vid hård studs", () => {
    expect(shouldSuppressOnBounce("hard")).toBe(true);
    expect(shouldSuppressOnBounce("soft")).toBe(false);
    expect(shouldSuppressOnBounce("receipt")).toBe(false);
    expect(shouldSuppressOnBounce("unknown")).toBe(false);
  });
});

describe("headerValue för Message-ID", () => {
  // fetchMessageIdHeader normaliserar till vinkelparenteser; den delen
  // testas här via headerValue eftersom nätanropet inte går att testa rent.
  it("läser Message-ID oavsett skiftläge i huvudnamnet", () => {
    const payload: GmailPayload = {
      mimeType: "text/plain",
      headers: [{ name: "Message-Id", value: "<abc@mail.gmail.com>" }],
    };
    expect(headerValue(payload, "Message-ID")).toBe("<abc@mail.gmail.com>");
  });
});
