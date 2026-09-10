/**
 * Utgående mejl via Gmail-API:t i stället för en e-postplattform.
 *
 * Bakgrund (2026-09-10): Resends villkor förbjuder ordagrant "cold outreach,
 * purchased lists, or scraped contact data" och skiljer inte på marknadsföring
 * och transaktionsmejl. Samma konto skickar våra offerter, DocuSeal-avtal och
 * kundrapporter, så ett stängt konto hade tagit allt det med sig. Mailchimp,
 * Brevo och HubSpot har samma förbud. Det finns ingen plattform som välsignar
 * kall utkorg.
 *
 * Lösningen är att skicka som en människa gör: från en riktig brevlåda, i en
 * riktig tråd. Trettio relevanta mejl om dagen från ett Workspace-konto är
 * vanlig affärskorrespondens, inte massutskick.
 *
 * Avsändardomänen är axonadigital.com (domänalias, gratis) med egen DKIM-nyckel,
 * så .se-domänens anseende är skyddat. Verifierat 2026-09-10:
 *   dkim=pass header.i=@axonadigital.com · spf=pass · dmarc=pass
 *
 * MEDVETET UTELÄMNAT:
 *  - List-Unsubscribe (RFC 8058). Kravet gäller avsändare över 5 000/dag. På ett
 *    1-till-1-mejl signalerar huvudet massutskick och gör mer skada än nytta.
 *    Lagkravet i 20 § MFL uppfylls av en fungerande svarsadress plus en rad i
 *    klartext, vilket mallarna har.
 *  - Spårningspixel. Apples bildproxy förhandshämtar, så ungefär halva
 *    öppningssiffran är påhittad, och pixeln sänker leveransbarheten. Klick på
 *    rapportlänken mäter samma sak ärligare.
 *  - HTML-del. Ren text ser ut som ett personligt mejl, vilket det ska.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Avsändaradress. Måste vara verifierad som "Skicka e-post som". */
  fromEmail: string;
  fromName: string;
}

export interface GmailMessage {
  to: string;
  subject: string;
  /** Ren text. Radbrytningar normaliseras till CRLF. */
  text: string;
  replyTo?: string;
}

export interface GmailSendResult {
  messageId: string;
  /** Trådens id — nyckeln till att upptäcka svar utan spårningspixel. */
  threadId: string;
}

/** Läser konfigurationen ur miljön. Saknas något returneras null, inte kasta. */
export function gmailConfigFromEnv(
  get: (k: string) => string | undefined,
): GmailConfig | null {
  const clientId = get("GMAIL_CLIENT_ID");
  const clientSecret = get("GMAIL_CLIENT_SECRET");
  const refreshToken = get("GMAIL_REFRESH_TOKEN");
  const fromEmail = get("GMAIL_FROM_EMAIL");
  if (!clientId || !clientSecret || !refreshToken || !fromEmail) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    fromEmail,
    fromName: get("GMAIL_FROM_NAME") || "",
  };
}

/** base64url utan utfyllnad — Gmail-API:t vill ha rå MIME i det formatet. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * RFC 2047 för rubriker med å, ä eller ö. Utan detta blir "Hemsidan får 42 av
 * 100" obegripligt hos mottagaren.
 */
export function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  const b64 = base64UrlEncode(new TextEncoder().encode(value))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return `=?UTF-8?B?${padded}?=`;
}

/** Ett namn med komma eller citattecken måste citeras för att inte dela adressen. */
function formatAddress(name: string, email: string): string {
  if (!name) return email;
  const encoded = encodeHeader(name);
  const needsQuotes = /[",:;<>@\\]/.test(name) && encoded === name;
  return needsQuotes
    ? `"${name.replace(/(["\\])/g, "\\$1")}" <${email}>`
    : `${encoded} <${email}>`;
}

/** Bygger ett RFC 5322-meddelande i ren text. */
export function buildMimeMessage(
  config: GmailConfig,
  message: GmailMessage,
): string {
  const body = message.text.replace(/\r?\n/g, "\r\n");
  const headers = [
    `From: ${formatAddress(config.fromName, config.fromEmail)}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  if (message.replyTo) headers.push(`Reply-To: ${message.replyTo}`);

  // Base64 i rader om 76 tecken, som standarden kräver.
  const encoded = base64UrlEncode(new TextEncoder().encode(body))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
  const wrapped = padded.match(/.{1,76}/g)?.join("\r\n") ?? padded;

  return `${headers.join("\r\n")}\r\n\r\n${wrapped}`;
}

/**
 * Växlar in refresh-token mot en access-token. Access-tokens lever en timme;
 * sekvensmotorn tickar var femte minut och hämtar en ny per körning, vilket är
 * enklare och säkrare än att cacha den i en funktion som ändå startas om.
 */
export async function getAccessToken(config: GmailConfig): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    // Vanligaste orsaken: scope gmail.send saknas, eller att token återkallats
    // för att OAuth-appen ligger kvar i testläge.
    throw new Error(`Gmail-token nekades (${response.status}): ${text.slice(0, 300)}`);
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Gmail-token saknade access_token");
  return json.access_token;
}

export async function sendViaGmail(
  config: GmailConfig,
  message: GmailMessage,
): Promise<GmailSendResult> {
  const accessToken = await getAccessToken(config);
  const raw = base64UrlEncode(
    new TextEncoder().encode(buildMimeMessage(config, message)),
  );

  const response = await fetch(SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gmail-sändning misslyckades (${response.status}): ${text.slice(0, 300)}`);
  }
  const json = (await response.json()) as { id?: string; threadId?: string };
  if (!json.id || !json.threadId) {
    throw new Error("Gmail svarade utan meddelande-id");
  }
  return { messageId: json.id, threadId: json.threadId };
}
