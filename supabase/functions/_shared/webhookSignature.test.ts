import { describe, expect, it } from "vitest";
import {
  hexToBase64,
  hmacSha256Hex,
  normalizeSignature,
  svixTimestampValid,
  timingSafeEqual,
  verifySvixSignature,
  verifyWebhookSignature,
} from "./webhookSignature";

const SECRET = "hemlig-webhook-nyckel";
const BODY = '{"meetingId":"abc123","eventType":"Transcription completed"}';

describe("normalizeSignature", () => {
  it("tar bort sha256-prefixet", () => {
    expect(normalizeSignature("sha256=abcdef")).toBe("abcdef");
  });

  it("lämnar bar hex orörd", () => {
    expect(normalizeSignature("abcdef")).toBe("abcdef");
  });

  it("tål blanksteg runt värdet", () => {
    expect(normalizeSignature("  sha256=abcdef  ")).toBe("abcdef");
  });

  it("ger tom sträng för tomt, null och undefined", () => {
    expect(normalizeSignature("")).toBe("");
    expect(normalizeSignature(null)).toBe("");
    expect(normalizeSignature(undefined)).toBe("");
  });
});

describe("timingSafeEqual", () => {
  it("är sant för identiska strängar", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("är falskt vid olika innehåll och olika längd", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "a")).toBe(false);
  });
});

describe("hexToBase64", () => {
  it("kodar om hex till base64", () => {
    expect(hexToBase64("48656c6c6f")).toBe(btoa("Hello"));
  });

  it("ger tom sträng på ogiltig hex i stället för att kasta", () => {
    expect(hexToBase64("xyz")).toBe("");
    expect(hexToBase64("abc")).toBe("");
  });
});

describe("verifyWebhookSignature", () => {
  it("godkänner en korrekt hex-signatur", async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifyWebhookSignature(SECRET, BODY, sig)).toBe(true);
  });

  it("godkänner samma signatur med sha256-prefix", async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifyWebhookSignature(SECRET, BODY, `sha256=${sig}`)).toBe(true);
  });

  // Skälet som angavs för att INTE blockera var att formatet kunde variera.
  // Lösningen är att acceptera formaten, inte att släppa igenom allt.
  it("godkänner samma signatur base64-kodad", async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifyWebhookSignature(SECRET, BODY, hexToBase64(sig))).toBe(true);
  });

  it("godkänner versaler i hex", async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifyWebhookSignature(SECRET, BODY, sig.toUpperCase())).toBe(true);
  });

  // Det här är hela poängen: alla tre fallen gav tidigare HTTP 200.
  it("avvisar utan signaturhuvud", async () => {
    expect(await verifyWebhookSignature(SECRET, BODY, null)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, BODY, "")).toBe(false);
  });

  it("avvisar fel signatur", async () => {
    expect(await verifyWebhookSignature(SECRET, BODY, "0".repeat(64))).toBe(false);
  });

  it("avvisar signatur räknad på en ANNAN kropp", async () => {
    const sig = await hmacSha256Hex(SECRET, '{"meetingId":"annat"}');
    expect(await verifyWebhookSignature(SECRET, BODY, sig)).toBe(false);
  });

  it("avvisar signatur räknad med fel hemlighet", async () => {
    const sig = await hmacSha256Hex("fel-nyckel", BODY);
    expect(await verifyWebhookSignature(SECRET, BODY, sig)).toBe(false);
  });

  // Saknad hemlighet får ALDRIG tolkas som "ingen kontroll behövs".
  it("avvisar när hemligheten saknas, även med signatur", async () => {
    const sig = await hmacSha256Hex(SECRET, BODY);
    expect(await verifyWebhookSignature(null, BODY, sig)).toBe(false);
    expect(await verifyWebhookSignature("", BODY, sig)).toBe(false);
  });
});

describe("svixTimestampValid", () => {
  const now = 1_760_000_000;

  it("godkänner en färsk tidsstämpel", () => {
    expect(svixTimestampValid(String(now), now)).toBe(true);
    expect(svixTimestampValid(String(now - 120), now)).toBe(true);
  });

  it("avvisar för gammal eller för framtida tidsstämpel", () => {
    expect(svixTimestampValid(String(now - 3600), now)).toBe(false);
    expect(svixTimestampValid(String(now + 3600), now)).toBe(false);
  });

  it("avvisar saknad eller oparsbar tidsstämpel", () => {
    expect(svixTimestampValid(null, now)).toBe(false);
    expect(svixTimestampValid("", now)).toBe(false);
    expect(svixTimestampValid("inte-ett-tal", now)).toBe(false);
  });
});

describe("verifySvixSignature", () => {
  const now = 1_760_000_000;
  const SECRET = "whsec_" + btoa("svix-hemlig-nyckel-32-tecken-lang");
  const ID = "msg_2abc";
  const TS = String(now);
  const PAYLOAD = '{"type":"email.bounced","data":{"email_id":"x"}}';

  /** Bygger en äkta signatur på samma sätt som Svix gör. */
  async function sign(body: string, id = ID, ts = TS): Promise<string> {
    const raw = atob(SECRET.slice(6));
    const key = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) key[i] = raw.charCodeAt(i);
    const cryptoKey = await crypto.subtle.importKey(
      "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC", cryptoKey, new TextEncoder().encode(`${id}.${ts}.${body}`),
    );
    let binary = "";
    for (const b of new Uint8Array(sig)) binary += String.fromCharCode(b);
    return `v1,${btoa(binary)}`;
  }

  it("godkänner en äkta Svix-signatur", async () => {
    const signature = await sign(PAYLOAD);
    expect(
      await verifySvixSignature(SECRET, PAYLOAD, { id: ID, timestamp: TS, signature }, now),
    ).toBe(true);
  });

  it("godkänner när huvudet innehåller flera versioner", async () => {
    const real = await sign(PAYLOAD);
    const signature = `v1,ZmFrZQ== ${real}`;
    expect(
      await verifySvixSignature(SECRET, PAYLOAD, { id: ID, timestamp: TS, signature }, now),
    ).toBe(true);
  });

  // Exakt det anrop som gav HTTP 200 i prod innan fixen.
  it("avvisar när BARA svix-id finns — hela buggen", async () => {
    expect(
      await verifySvixSignature(
        SECRET, PAYLOAD,
        { id: "vilket-varde-som-helst", timestamp: null, signature: null },
        now,
      ),
    ).toBe(false);
  });

  it("avvisar fel signatur", async () => {
    expect(
      await verifySvixSignature(
        SECRET, PAYLOAD, { id: ID, timestamp: TS, signature: "v1,ZmFrZQ==" }, now,
      ),
    ).toBe(false);
  });

  it("avvisar signatur räknad på en annan kropp", async () => {
    const signature = await sign('{"type":"email.delivered"}');
    expect(
      await verifySvixSignature(SECRET, PAYLOAD, { id: ID, timestamp: TS, signature }, now),
    ).toBe(false);
  });

  it("avvisar när id eller tidsstämpel bytts ut efteråt", async () => {
    const signature = await sign(PAYLOAD);
    expect(
      await verifySvixSignature(SECRET, PAYLOAD, { id: "msg_annat", timestamp: TS, signature }, now),
    ).toBe(false);
    expect(
      await verifySvixSignature(SECRET, PAYLOAD, { id: ID, timestamp: String(now - 1), signature }, now),
    ).toBe(false);
  });

  it("avvisar en återuppspelad men äkta signatur", async () => {
    const oldTs = String(now - 7200);
    const signature = await sign(PAYLOAD, ID, oldTs);
    expect(
      await verifySvixSignature(SECRET, PAYLOAD, { id: ID, timestamp: oldTs, signature }, now),
    ).toBe(false);
  });

  it("avvisar när hemligheten saknas", async () => {
    const signature = await sign(PAYLOAD);
    expect(
      await verifySvixSignature(null, PAYLOAD, { id: ID, timestamp: TS, signature }, now),
    ).toBe(false);
  });
});
