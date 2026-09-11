/**
 * HMAC-verifiering för inkommande webhooks.
 *
 * Bakgrund (2026-09-11): fireflies_webhook RÄKNADE ut signaturen, jämförde
 * den, loggade "signature mismatch (proceeding anyway)" och körde vidare.
 * Kommentaren angav som skäl att Fireflies signaturformat kunde variera.
 *
 * Följden var en öppen endpoint. Verifierat med curl från öppet internet
 * utan signatur: HTTP 200, och funktionen anropade dessutom Fireflies
 * GraphQL med vår API-nyckel. Vem som helst kunde bränna vår kvot och,
 * med ett giltigt transkript-id, trigga betalda Claude-anrop.
 *
 * Lösningen på "formatet kan variera" är att acceptera de format som
 * faktiskt förekommer — inte att släppa igenom allt. Modulen tar därför
 * både "sha256=<hex>", bar hex och base64, men kräver att någon av dem
 * stämmer.
 */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC-SHA256 av input med secret, som gemen hex. */
export async function hmacSha256Hex(
  secret: string,
  input: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(input),
  );
  return toHex(signature);
}

/** "sha256=abc" → "abc". Tomt in ger tomt ut. */
export function normalizeSignature(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input.trim();
  const withoutPrefix = trimmed.startsWith("sha256=")
    ? trimmed.slice(7)
    : trimmed;
  return withoutPrefix.trim();
}

/** hex → base64, för avsändare som skickar signaturen base64-kodad. */
export function hexToBase64(hex: string): string {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return "";
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Jämförelse i konstant tid. En vanlig !== avbryter vid första olika tecken,
 * vilket i teorin läcker hur många tecken som stämde.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Stämmer signaturen i huvudet med kroppen?
 *
 * Saknas hemligheten eller huvudet är svaret ALLTID false — en webhook utan
 * verifierbar avsändare ska avvisas, aldrig släppas igenom.
 */
export async function verifyWebhookSignature(
  secret: string | null | undefined,
  rawBody: string,
  header: string | null | undefined,
): Promise<boolean> {
  if (!secret) return false;
  const provided = normalizeSignature(header);
  if (!provided) return false;

  const expectedHex = await hmacSha256Hex(secret, rawBody);
  if (timingSafeEqual(provided.toLowerCase(), expectedHex)) return true;

  // Samma signatur, base64-kodad i stället för hex.
  const expectedBase64 = hexToBase64(expectedHex);
  return expectedBase64 !== "" && timingSafeEqual(provided, expectedBase64);
}

// --- Svix (Resend, Clerk m.fl.) ---------------------------------------------

/**
 * Svix signerar `{svix-id}.{svix-timestamp}.{body}` med HMAC-SHA256 och en
 * nyckel som ligger base64-kodad efter prefixet "whsec_". Signaturhuvudet kan
 * innehålla flera versioner, mellanslagsseparerade: "v1,<b64> v1,<b64>".
 *
 * Bakgrund (2026-09-11): resend_events hade villkoret
 *   if (!svixId && providedSecret !== webhookSecret) return 401;
 * vilket betyder att BARA NÄRVARON av ett svix-id-huvud stängde av
 * kontrollen. Verifierat med curl: "svix-id: vilket-varde-som-helst" gav
 * HTTP 200. Endpointen skriver studsar till outreach_suppressions, så en
 * främling kunde spärra godtyckliga adresser i vår utkorg.
 */
export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/** Tidsfönster i sekunder. Svix rekommenderar fem minuter. */
const SVIX_TOLERANCE_SECONDS = 300;

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacBase64(key: Uint8Array, input: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(input),
  );
  let binary = "";
  for (const b of new Uint8Array(sig)) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Ligger tidsstämpeln inom tillåtet fönster? Skyddar mot återuppspelning. */
export function svixTimestampValid(
  timestamp: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = SVIX_TOLERANCE_SECONDS,
): boolean {
  if (!timestamp) return false;
  const parsed = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(parsed)) return false;
  return Math.abs(nowSeconds - parsed) <= toleranceSeconds;
}

/**
 * Verifierar en Svix-signerad webhook. Allt som saknas eller inte stämmer
 * ger false — aldrig "släpp igenom för säkerhets skull".
 */
export async function verifySvixSignature(
  secret: string | null | undefined,
  rawBody: string,
  headers: SvixHeaders,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) {
    return false;
  }
  if (!svixTimestampValid(headers.timestamp, nowSeconds)) return false;

  const keyBytes = base64ToBytes(
    secret.startsWith("whsec_") ? secret.slice(6) : secret,
  );
  if (!keyBytes || keyBytes.length === 0) return false;

  const expected = await hmacBase64(
    keyBytes,
    `${headers.id}.${headers.timestamp}.${rawBody}`,
  );

  for (const part of headers.signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    if (timingSafeEqual(value, expected)) return true;
  }
  return false;
}
