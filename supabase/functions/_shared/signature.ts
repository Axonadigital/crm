/**
 * Avsändarsignatur för utkorgen, i både ren text och HTML.
 *
 * Bakgrund (2026-09-10): Gmails webbsignatur appliceras INTE på meddelanden
 * som skickas via API:t — vi bygger meddelandet själva. Ska mejlen bära Axonas
 * signatur måste den byggas här.
 *
 * Är det säkert att skicka HTML och bild i kall utkorg? Ja, så långt någon har
 * mätt det. Hunter, 31 miljoner mejl: bilder och bilagor har INGEN mätbar
 * effekt på svarsfrekvensen. SpamAssassins tränade poänguppsättning sätter
 * bild-mot-text-reglerna (HTML_IMAGE_RATIO_*) till 0,001 — förhållandet
 * mellan bild och text är alltså mätt till noll betydelse. Varken Google,
 * Yahoo eller Microsoft nämner signaturer, loggor eller bildmängd i sin
 * avsändardokumentation.
 *
 * TVÅ saker är däremot mätta och styr designen här:
 *  - Mejl som består av ENBART bild utan text poängsätts (HTML_IMAGE_ONLY_12
 *    = 2,059). Därför skickas alltid en riktig textdel, aldrig bara HTML.
 *  - MIME_HTML_ONLY (HTML utan textalternativ) = 0,1. Litet, men gratis att
 *    undvika med multipart/alternative.
 *
 * Bilden måste ligga på en URL. Data-URI:er strippas av Gmail. Saknas URL
 * renderas signaturen utan porträtt i stället för med trasig bildikon.
 */

export interface SignatureConfig {
  name: string;
  title: string;
  phone: string;
  email: string;
  website: string;
  /** Porträtt. Utelämnas helt om tom — hellre ingen bild än en trasig. */
  photoUrl: string;
  logoUrl: string;
  linkedinUrl: string;
}

export function signatureConfigFromEnv(
  get: (k: string) => string | undefined,
): SignatureConfig {
  const v = (k: string) => (get(k) || "").trim();
  return {
    name: v("SIGNATURE_NAME") || v("GMAIL_FROM_NAME"),
    title: v("SIGNATURE_TITLE"),
    phone: v("SIGNATURE_PHONE"),
    email: v("SIGNATURE_EMAIL") || v("GMAIL_FROM_EMAIL"),
    website: v("SIGNATURE_WEBSITE"),
    photoUrl: v("SIGNATURE_PHOTO_URL"),
    logoUrl: v("SIGNATURE_LOGO_URL"),
    linkedinUrl: v("SIGNATURE_LINKEDIN_URL"),
  };
}

/** true när det finns tillräckligt för att rendera något vettigt. */
export function hasSignature(cfg: SignatureConfig): boolean {
  return cfg.name !== "";
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Textsignaturen. Medvetet mager — den ska se ut som något en människa
 * skrivit, inte som en genererad fotnot.
 */
export function renderTextSignature(cfg: SignatureConfig): string {
  const lines = [cfg.name];
  if (cfg.title) lines.push(cfg.title);
  const contact = [cfg.phone, cfg.website].filter(Boolean).join(" · ");
  if (contact) lines.push(contact);
  return lines.join("\n");
}

/** Ren text → HTML-stycken. Escapar först; bolagsnamn kan innehålla &. */
function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 14px 0;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`,
    )
    .join("\n");
}

/**
 * Signaturblocket.
 *
 * Tabellayout och inline-stilar, för att Outlook inte stödjer modern CSS.
 * Explicit width och height på bilden så layouten inte hoppar innan den
 * laddats, och alt-text så den som blockerar bilder ändå ser vem som skrivit.
 */
export function renderHtmlSignature(cfg: SignatureConfig): string {
  const rows: string[] = [];
  rows.push(
    `<div style="font-weight:600;color:#111827;">${escapeHtml(cfg.name)}</div>`,
  );
  if (cfg.title) {
    rows.push(
      `<div style="color:#6b7280;">${escapeHtml(cfg.title)}</div>`,
    );
  }
  const contact: string[] = [];
  if (cfg.phone) {
    contact.push(
      `<a href="tel:${escapeHtml(cfg.phone.replace(/\s/g, ""))}" style="color:#374151;text-decoration:none;">${escapeHtml(cfg.phone)}</a>`,
    );
  }
  if (cfg.email) {
    contact.push(
      `<a href="mailto:${escapeHtml(cfg.email)}" style="color:#374151;text-decoration:none;">${escapeHtml(cfg.email)}</a>`,
    );
  }
  if (cfg.website) {
    const href = /^https?:\/\//i.test(cfg.website)
      ? cfg.website
      : `https://${cfg.website}`;
    contact.push(
      `<a href="${escapeHtml(href)}" style="color:#374151;text-decoration:none;">${escapeHtml(cfg.website.replace(/^https?:\/\//i, ""))}</a>`,
    );
  }
  if (cfg.linkedinUrl) {
    contact.push(
      `<a href="${escapeHtml(cfg.linkedinUrl)}" style="color:#374151;text-decoration:none;">LinkedIn</a>`,
    );
  }
  if (contact.length > 0) {
    rows.push(
      `<div style="margin-top:4px;color:#6b7280;">${contact.join(' <span style="color:#d1d5db;">·</span> ')}</div>`,
    );
  }

  const photoCell = cfg.photoUrl
    ? `<td style="padding-right:14px;vertical-align:top;">` +
      `<img src="${escapeHtml(cfg.photoUrl)}" width="56" height="56" alt="${escapeHtml(cfg.name)}" ` +
      `style="display:block;width:56px;height:56px;border-radius:28px;border:0;outline:none;">` +
      `</td>`
    : "";

  const logo = cfg.logoUrl
    ? `<div style="margin-top:10px;">` +
      `<img src="${escapeHtml(cfg.logoUrl)}" height="18" alt="Axona Digital" ` +
      `style="display:block;height:18px;border:0;outline:none;">` +
      `</div>`
    : "";

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ` +
    `style="margin-top:22px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.5;">` +
    `<tr>${photoCell}<td style="vertical-align:top;">${rows.join("")}${logo}</td></tr>` +
    `</table>`
  );
}

/**
 * Skriver om avsändaradressen i signaturen till den vi FAKTISKT skickar från.
 *
 * Inte kosmetik. Signaturen pekade på rasmus@axonadigital.se medan utkorgen
 * går från rasmus@axonadigital.com. Klickar mottagaren på adressen i
 * signaturen i stället för att svara, kommer svaret som ett nytt meddelande
 * utanför tråden — och svarsläsaren matchar på tråd. Då fortsätter sekvensen
 * mejla någon som redan hört av sig, vilket är precis det fel svarsläsaren
 * finns för att undvika.
 *
 * Nyckeln är den lokala delen: rasmus@vilken-domän-som-helst blir
 * rasmus@rätt-domän. info@ och isak@ rörs inte.
 */
export function rewriteSenderAddress(html: string, fromEmail: string): string {
  const local = fromEmail.split("@")[0];
  if (!local || !fromEmail.includes("@")) return html;

  // Gmail stoppar in <wbr> i långa adresser som brytpunkter för radbrytning.
  // Utan att ta bort dem först matchar mönstret bara fram till taggen och
  // ersätter en HALV adress — vilket gav "rasmus@axonadigital.comcom" i prod.
  // <wbr> är rent typografiskt och kan tas bort utan att något går förlorat.
  const cleaned = html.replace(/<wbr\s*\/?>/gi, "");

  const pattern = new RegExp(
    `${local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}@[A-Za-z0-9.-]+`,
    "g",
  );
  return cleaned.replace(pattern, (match) =>
    // En träff som slutar på punkt eller bindestreck är en avhuggen adress,
    // inte en riktig. Rör den inte — hellre orörd än trasig.
    /[.-]$/.test(match) ? match : fromEmail,
  );
}

/**
 * Tar bort en textrad ur signaturen utan att röra resten av raden.
 *
 * Behövs för att taglinen och P.S.-raden ligger i SAMMA div — Rasmus vill
 * behålla den ena och stryka den andra. Funktionen klipper därför texten
 * plus det inledande inline-elementet (Gmails "//"-span) och de omedelbart
 * följande radbrytningarna, i stället för att kasta hela elementet.
 */
export function removeTextRun(html: string, phrase: string): string {
  const needle = phrase.replace(/&/g, "&amp;");
  const at = html.indexOf(needle);
  if (at === -1) return html;

  // Vänster: tillbaka till slutet av föregående tagg …
  let start = html.lastIndexOf(">", at);
  start = start === -1 ? 0 : start + 1;
  // … och förbi ett inledande inline-element som bara är dekor ("//").
  const before = html.slice(0, start);
  const decor = before.match(/<span\b[^>]*>[^<]{0,8}<\/span>\s*$/i);
  if (decor) start -= decor[0].length;

  // Höger: HELA textnoden, inte bara den matchade frasen. Frasen är en
  // sökterm — raden fortsätter ofta efter den ("— byggt för svenska
  // företag") och att lämna den resten kvar vore värre än att inte klippa.
  const nextTag = html.indexOf("<", at + needle.length);
  let end = nextTag === -1 ? html.length : nextTag;
  const rest = html.slice(end);
  const breaks = rest.match(/^(?:\s*<br\s*\/?>){1,2}\s*/i);
  if (breaks) end += breaks[0].length;

  return html.slice(0, start) + html.slice(end);
}

/**
 * Outreach-varianten av signaturen: samma design, rätt adress, och de rader
 * Rasmus inte vill ha i kall utkorg borttagna.
 *
 * Härleds vid varje synk i stället för att underhållas separat, så han
 * fortfarande bara har EN signatur att designa i Gmail.
 */
export function toOutreachSignature(
  html: string,
  fromEmail: string,
  removePhrases: readonly string[],
): string {
  let out = rewriteSenderAddress(html, fromEmail);
  for (const phrase of removePhrases) out = removeTextRun(out, phrase);
  return out;
}

/**
 * Städar HTML:en från ett mejl som bara innehåller signaturen.
 *
 * Gmail lindar brödtexten i <div dir="ltr"> och lägger till en osynlig
 * <div class="gmail_signature"> runt signaturen. Vi plockar ut just den när
 * den finns, och faller annars tillbaka på hela kroppen — mejlet innehöll
 * ändå bara signaturen.
 *
 * Skript, stilblock och spårningspixlar strippas: de hör inte hemma i en
 * signatur och det vore oansvarigt att vidarebefordra dem till mottagare.
 */
export function extractSignatureHtml(messageHtml: string): string {
  if (!messageHtml.trim()) return "";

  let html = messageHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Gmails egen signaturbehållare, när den finns.
  const marked = html.match(
    /<div[^>]*class="[^"]*gmail_signature[^"]*"[^>]*>([\s\S]*)$/i,
  );
  if (marked) html = marked[1];

  // Allt från en citatmarkör och framåt är inte signatur.
  html = html.split(/<div[^>]*class="[^"]*gmail_quote/i)[0];

  // Bilder utan storlek hoppar när de laddas. En signaturbild ska ha båda.
  return html
    .replace(/<body[^>]*>|<\/body>|<html[^>]*>|<\/html>/gi, "")
    .trim();
}

/**
 * Gör en läsbar textrad-signatur av Gmails HTML.
 *
 * Behövs för att textdelen av mejlet ska bära samma avsändarinformation som
 * HTML-delen. Utan den skulle den som läser i ren text få ett mejl utan
 * avsändare — och textdelen är den vi ALLTID skickar.
 */
export function htmlSignatureToText(html: string): string {
  if (!html.trim()) return "";
  return html
    // Bilder blir inget alls i text — inte "[bild]".
    .replace(/<img[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(
      /&(nbsp|amp|lt|gt|quot|apos|aring|auml|ouml|Aring|Auml|Ouml);/g,
      (whole, name) => TEXT_ENTITIES[name] ?? whole,
    )
    .split("\n")
    .map((line) => line.trim())
    .filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n")
    .trim();
}

const TEXT_ENTITIES: Record<string, string> = {
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
};

/**
 * Bygger mejlet från Gmails egen signatur-HTML i stället för konfigurationen.
 *
 * Det här är den väg vi vill gå: Rasmus designar signaturen i Gmail som
 * vanligt, och den följer med hit. Ett ställe att underhålla, inte två.
 */
export function renderWithGmailSignature(
  bodyText: string,
  signatureHtml: string,
): { text: string; html: string } {
  const font =
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;" +
    "font-size:15px;line-height:1.55;color:#111827;";
  const sigText = htmlSignatureToText(signatureHtml);
  return {
    text: sigText ? `${bodyText.trimEnd()}\n\n${sigText}` : bodyText,
    html:
      `<div style="${font}max-width:560px;">` +
      paragraphs(bodyText) +
      (signatureHtml ? `<div style="margin-top:22px;">${signatureHtml}</div>` : "") +
      `</div>`,
  };
}

/** Hela HTML-mejlet: brödtexten som stycken plus signaturen. */
export function renderHtmlEmail(
  bodyText: string,
  cfg: SignatureConfig,
): string {
  const font =
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;" +
    "font-size:15px;line-height:1.55;color:#111827;";
  return (
    `<div style="${font}max-width:560px;">` +
    paragraphs(bodyText) +
    (hasSignature(cfg) ? renderHtmlSignature(cfg) : "") +
    `</div>`
  );
}

/** Textdelen: brödtext plus den magra textsignaturen. */
export function renderTextEmail(
  bodyText: string,
  cfg: SignatureConfig,
): string {
  if (!hasSignature(cfg)) return bodyText;
  return `${bodyText.trimEnd()}\n\n${renderTextSignature(cfg)}`;
}
