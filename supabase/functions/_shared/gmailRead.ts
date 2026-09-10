/**
 * Inläsning av svar och studsar från Gmail-brevlådan.
 *
 * Vi skickar utkorgen via Gmail-API:t (se gmail.ts) och sparar trådens id på
 * varje utskick. Därför behöver vi ingen spårningspixel och ingen webhook från
 * en plattform: allt som händer med ett mejl hamnar i samma tråd. Ett svar är
 * ett nytt meddelande i tråden, och en studs är ett meddelande från
 * mailer-daemon i samma tråd.
 *
 * Det ger oss tre saker som Resend-webhooken gav förut, plus en fjärde:
 *   studsar · svar · avregistreringar i klartext · och trådens hela historik.
 *
 * Spammarkeringar går INTE att läsa här — ingen leverantör rapporterar dem per
 * mottagare. Den siffran finns bara aggregerat i Google Postmaster Tools.
 *
 * Läsning kräver scopet gmail.readonly utöver gmail.send.
 */

const THREAD_URL = "https://gmail.googleapis.com/gmail/v1/users/me/threads";

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailPayload {
  mimeType?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPayload[];
}

export interface GmailApiMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  /** Millisekunder sedan epoch, som sträng. Gmails eget format. */
  internalDate?: string;
  payload?: GmailPayload;
}

export interface GmailThread {
  id: string;
  messages?: GmailApiMessage[];
}

/**
 * "ours" = vårt eget utskick. "bounce" = studs. "auto_reply" = frånvaromejl,
 * som varken är ett svar eller ett fel och därför inte får pausa sekvensen.
 * "reply" = en människa har svarat.
 */
export type IncomingKind = "ours" | "bounce" | "auto_reply" | "reply";

/** Rubrikvärde, skiftlägesokänsligt. Tom sträng när rubriken saknas. */
export function headerValue(
  payload: GmailPayload | undefined,
  name: string,
): string {
  const wanted = name.toLowerCase();
  const hit = payload?.headers?.find((h) => h.name?.toLowerCase() === wanted);
  return hit?.value?.trim() ?? "";
}

/** "Rasmus Joonsson <a@b.se>" → "a@b.se". Gemener, utan vinkelparenteser. */
export function parseAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const angle = raw.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : raw).trim().toLowerCase();
  return candidate.includes("@") ? candidate : null;
}

/** Gmails base64url, med de radbrytningar som API:t stoppar in. */
function decodeBase64Url(data: string): string {
  const normalized = data
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/\s/g, "");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

/** De entiteter som faktiskt dyker upp i svensk affärspost. */
const HTML_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  aring: "\u00e5",
  auml: "\u00e4",
  ouml: "\u00f6",
  Aring: "\u00c5",
  Auml: "\u00c4",
  Ouml: "\u00d6",
  eacute: "\u00e9",
  oslash: "\u00f8",
  aelig: "\u00e6",
};

/**
 * Plockar ut brödtexten. Ren text vinner alltid över HTML — vi vill läsa vad
 * någon skrev, inte deras mallmarkup.
 */
export function decodePlainText(payload: GmailPayload | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  for (const part of payload.parts ?? []) {
    const found = decodePlainText(part);
    if (found) return found;
  }
  // Ingen ren text alls i mejlet — ta HTML och strippa taggarna.
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
        String.fromCodePoint(Number.parseInt(hex, 16)),
      )
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
      .replace(
        /&(nbsp|amp|lt|gt|quot|apos|aring|auml|ouml|Aring|Auml|Ouml|eacute|oslash|aelig);/g,
        (whole, name) => HTML_ENTITIES[name] ?? whole,
      );
  }
  return "";
}

const DAEMON =
  /(mailer-daemon|postmaster|no-?reply@.*(google|outlook|protection))/i;

const AUTO_SUBJECT =
  /(auto(matiskt)?[\s-]*svar|autosvar|automatic reply|auto[\s-]*reply|out of office|frånvar|semester|föräldraledig|tjänstledig|ur kontoret)/i;

/**
 * Avgör vad ett meddelande i tråden är.
 *
 * Ordningen spelar roll: vårt eget utskick först (annars läser vi vår egen
 * mall som ett svar), sedan studs, sedan frånvaro, och allt annat är ett
 * riktigt svar. Fail-safe åt "reply"-hållet — ett falskt svar pausar bara
 * sekvensen och skapar en uppgift, medan ett missat svar betyder att vi
 * fortsätter mejla någon som redan hört av sig.
 */
export function classifyMessage(
  message: GmailApiMessage,
  ourEmails: readonly string[],
): IncomingKind {
  const payload = message.payload;
  const from = parseAddress(headerValue(payload, "From"));
  const ours = ourEmails.map((e) => e.toLowerCase());

  if (message.labelIds?.includes("SENT")) return "ours";
  if (from && ours.includes(from)) return "ours";

  const contentType = headerValue(payload, "Content-Type");
  const hasDeliveryStatus =
    /report-type=delivery-status/i.test(contentType) ||
    (payload?.parts ?? []).some((p) =>
      /message\/delivery-status/i.test(p.mimeType ?? ""),
    );
  if (
    hasDeliveryStatus ||
    (from && DAEMON.test(from)) ||
    headerValue(payload, "X-Failed-Recipients") !== ""
  ) {
    return "bounce";
  }

  const autoSubmitted = headerValue(payload, "Auto-Submitted").toLowerCase();
  if (
    (autoSubmitted !== "" && autoSubmitted !== "no") ||
    headerValue(payload, "X-Autoreply") !== "" ||
    headerValue(payload, "X-Autorespond") !== "" ||
    AUTO_SUBJECT.test(headerValue(payload, "Subject"))
  ) {
    return "auto_reply";
  }

  return "reply";
}

/**
 * Klipper bort den citerade delen av ett svar.
 *
 * Utan detta läser vi vår egen mall som om mottagaren skrivit den — och våra
 * mallar slutar med "Vill du inte höra mer från mig är det bara att säga
 * till", vilket hade fått varje enskilt svar att räknas som ett nej.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  const cut = lines.findIndex((line) => {
    const l = line.trim();
    return (
      l.startsWith(">") ||
      /^-{2,}\s*(ursprungligt meddelande|original message|vidarebefordrat)/i.test(
        l,
      ) ||
      /^(den|on)\s.+\b(skrev|wrote)\b.*:\s*$/i.test(l) ||
      /^från:\s|^from:\s/i.test(l)
    );
  });
  return (cut === -1 ? lines : lines.slice(0, cut)).join("\n").trim();
}

const NEGATIVE =
  /(nej tack|inte intresserad|ointresserad|ej intresserad|inget intresse|avregistrera|avbeställ|ta bort (mig|oss|vår)|sluta (mejla|maila|skicka|kontakta)|hör inte av (er|dig)|vill inte (ha|bli)|undanbe|inte aktuellt|ej aktuellt|not interested|no thanks|unsubscribe|remove me|stop emailing)/i;

/**
 * Ett tydligt nej. Konservativ med flit: den ska hitta klara avböjanden, inte
 * gissa på tveksamma. Ett missat nej fångas ändå av att svaret pausar
 * sekvensen och lägger en uppgift till en människa.
 */
export function isNegativeReply(text: string): boolean {
  const body = stripQuotedReply(text);
  if (!body) return false;
  if (/^nej[\s.!]*$/i.test(body)) return true;
  return NEGATIVE.test(body);
}

/** Adressen som studsade, när servern angav den. */
export function bouncedRecipient(message: GmailApiMessage): string | null {
  const explicit = headerValue(message.payload, "X-Failed-Recipients");
  if (explicit) return parseAddress(explicit.split(",")[0]);
  const text = `${decodePlainText(message.payload)}\n${message.snippet ?? ""}`;
  const match = text.match(
    /(?:Final-Recipient:\s*rfc822;\s*|address not found|couldn't be delivered to\s*)([^\s<>,;]+@[^\s<>,;]+)/i,
  );
  return match ? parseAddress(match[1]) : null;
}

export interface SendAsAlias {
  sendAsEmail: string;
  displayName: string;
  /** Signaturen som HTML, exakt som den ser ut i Gmails inställningar. */
  signature: string;
  isDefault: boolean;
  isPrimary: boolean;
  verificationStatus: string;
}

/**
 * Hämtar avsändaradresserna och deras signaturer ur Gmail-inställningarna.
 *
 * Varför läsa i stället för att sätta: Gmails signatur läggs på av KLIENTEN
 * när någon skriver i webbläsaren, inte av servern vid sändning. Vi skickar
 * färdig MIME direkt till servern, så en signatur i inställningarna kommer
 * aldrig med av sig själv. Däremot kan vi hämta den Rasmus redan designat och
 * rendera in den själva — då slipper han underhålla den på två ställen, och
 * ändrar han i Gmail följer det med vid nästa synk.
 *
 * Kräver gmail.settings.basic eller gmail.readonly beroende på konto.
 */
export async function fetchSendAsAliases(
  accessToken: string,
): Promise<SendAsAlias[]> {
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      response.status === 403
        ? "Gmail nekar läsning av inställningarna — token saknar scopet " +
          "gmail.settings.basic. Auktorisera om med det tillagt."
        : `Gmail-inställningarna kunde inte läsas (${response.status}): ${body.slice(0, 200)}`,
    );
  }
  const json = (await response.json()) as { sendAs?: Record<string, unknown>[] };
  return (json.sendAs ?? []).map((a) => ({
    sendAsEmail: String(a.sendAsEmail ?? "").toLowerCase(),
    displayName: String(a.displayName ?? ""),
    signature: String(a.signature ?? ""),
    isDefault: a.isDefault === true,
    isPrimary: a.isPrimary === true,
    verificationStatus: String(a.verificationStatus ?? ""),
  }));
}

/**
 * Väljer signaturen för den adress vi faktiskt skickar från.
 *
 * Ett Workspace-konto har flera avsändaradresser — kontot självt plus varje
 * alias — och de har olika signaturer. Vi vill ha aliasets, inte kontots.
 */
export function signatureForAddress(
  aliases: readonly SendAsAlias[],
  fromEmail: string,
): string {
  const wanted = fromEmail.trim().toLowerCase();
  const exact = aliases.find((a) => a.sendAsEmail === wanted);
  if (exact?.signature) return exact.signature;
  const fallback = aliases.find((a) => a.isDefault && a.signature);
  return fallback?.signature ?? "";
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
}

/**
 * Brevlådans profil. Kräver gmail.readonly — med bara gmail.send svarar
 * Google 403 "insufficient authentication scopes".
 *
 * Därför duger den som hälsokoll: så länge den går igenom vet vi att
 * svarsläsningen kan läsa, även de dygn då ingen tråd behövde kollas.
 */
export async function fetchProfile(accessToken: string): Promise<GmailProfile> {
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      response.status === 403
        ? "Gmail nekar läsning — refresh-token saknar scopet gmail.readonly. " +
          "Auktorisera om med både gmail.send och gmail.readonly."
        : `Gmail-profilen kunde inte läsas (${response.status}): ${body.slice(0, 200)}`,
    );
  }
  const json = (await response.json()) as Partial<GmailProfile>;
  return {
    emailAddress: json.emailAddress ?? "",
    messagesTotal: json.messagesTotal ?? 0,
    threadsTotal: json.threadsTotal ?? 0,
  };
}

/** Hämtar en hel tråd med rubriker och brödtext. */
export async function fetchThread(
  accessToken: string,
  threadId: string,
): Promise<GmailThread | null> {
  const response = await fetch(`${THREAD_URL}/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // Tråden kan vara raderad i brevlådan. Det är inte ett fel värt att stoppa
  // hela körningen för.
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Gmail-tråd ${threadId} kunde inte läsas (${response.status}): ${body.slice(0, 200)}`,
    );
  }
  return (await response.json()) as GmailThread;
}
