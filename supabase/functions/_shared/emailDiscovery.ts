/**
 * Hittar en företagsadress på företagets egen hemsida.
 *
 * Bakgrund (2026-09-11): 37 av 55 högpoängsföretag i CRM:et saknade e-post
 * helt och föll därför ur leadkretsen, trots att adressen i de allra flesta
 * fall stod på deras egen kontaktsida. Den enda källan vi hade var Serpers
 * söksnuttar, som nästan aldrig innehåller en adress.
 *
 * Modulen är avsiktligt REN (inga nätanrop, ingen databas) så den kan testas
 * mot riktig markup. discover_emails-funktionen sköter hämtningen.
 *
 * De tre fällor som kostade mest att upptäcka:
 *  1. Retina-bildnamn (logo@2x.png) matchar en naiv e-postregex.
 *  2. Cloudflares Email Obfuscation byter ut adressen mot hex — utan
 *     avkodning tappar vi varje sajt som har den påslagen.
 *  3. Plattformarnas egna adresser (wixpress, sentry, squarespace) ligger
 *     inbakade i mallarna och ser ut som riktiga träffar.
 */

/** Toppdomäner som i själva verket är filändelser. */
const FILE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico", "bmp",
  "css", "js", "mjs", "json", "xml", "pdf", "zip", "woff", "woff2", "ttf",
  "eot", "mp4", "webm", "mp3", "min",
]);

/** Domäner som tillhör plattformen, inte företaget. */
const VENDOR_DOMAINS = [
  "example.com", "example.org", "example.se", "domain.com", "yourdomain.com",
  "yourdomain.se", "email.com", "test.com",
  "sentry.io", "wixpress.com", "wix.com", "squarespace.com", "godaddy.com",
  "shopify.com", "wordpress.com", "wordpress.org", "w3.org", "schema.org",
  "googleapis.com", "gstatic.com", "cloudflare.com", "jquery.com",
  "sentry-next.wixpress.com", "one.com", "loopia.se",
];

/** Lådor ingen människa läser. */
const NOREPLY_LOCALS = new Set([
  "noreply", "donotreply", "nereply", "notifications", "notification",
  "mailer", "mailerdaemon", "bounce", "bounces", "automated",
]);

/** Förstahandsval — den gemensamma brevlådan. */
const PRIMARY_ROLES = new Set([
  "info", "kontakt", "hej", "mail", "post", "office", "hello", "contact",
  "kontakta", "order", "bokning", "boka",
]);

/** Rätt bolag, fel människa. */
const LOW_VALUE_ROLES = new Set([
  "webmaster", "admin", "administrator", "faktura", "fakturor", "invoice",
  "ekonomi", "accounting", "support", "helpdesk", "jobb", "career", "careers",
  "rekrytering", "press", "gdpr", "dataskydd", "abuse", "postmaster",
]);

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** "www.Foo.se" → "foo.se". */
function bareDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, "")
    .split(/[/?#]/)[0]
    .replace(/^www\./, "");
  return value.includes(".") ? value : null;
}

/**
 * Avkodar Cloudflares hex-skyddade adress. Första byten är nyckeln, resten
 * är XOR:ade med den. Returnerar null på skräp i stället för att kasta.
 */
export function decodeCloudflareEmail(hex: string): string | null {
  const clean = hex.trim().toLowerCase();
  if (clean.length < 4 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/.test(clean)) {
    return null;
  }
  const key = Number.parseInt(clean.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < clean.length; i += 2) {
    const code = Number.parseInt(clean.slice(i, i + 2), 16) ^ key;
    if (code < 32 || code > 126) return null;
    out += String.fromCharCode(code);
  }
  return out.includes("@") ? out : null;
}

/** Är adressen värd att spara? */
export function isUsableEmail(raw: string): boolean {
  const email = raw.trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return false;

  const [local, domain] = email.split("@");
  if (!local || !domain) return false;

  const tld = domain.split(".").pop() ?? "";
  if (FILE_EXTENSIONS.has(tld)) return false;

  // "no-reply" och "no.reply" är samma låda som "noreply".
  const flatLocal = local.replace(/[._-]/g, "");
  if (NOREPLY_LOCALS.has(flatLocal)) return false;

  return !VENDOR_DOMAINS.some((v) => domain === v || domain.endsWith(`.${v}`));
}

/**
 * Plockar ut alla e-postkandidater ur rå HTML — mailto-länkar, brödtext,
 * JSON-LD och Cloudflare-skyddade adresser. Gemener, utan dubbletter,
 * i den ordning de står på sidan.
 */
export function extractEmailCandidates(html: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const email = value.trim().toLowerCase();
    if (!isUsableEmail(email) || seen.has(email)) return;
    seen.add(email);
    found.push(email);
  };

  // Cloudflare först — annars ligger hexen kvar och skräpar i brödtexten.
  const cfRe = /(?:email-protection#|data-cfemail=["'])([0-9a-fA-F]+)/g;
  for (const match of html.matchAll(cfRe)) {
    const decoded = decodeCloudflareEmail(match[1]);
    if (decoded) add(decoded);
  }

  // Entiteter som CMS:er skriver ut i stället för tecknen själva.
  const decoded = html
    .replace(/&#0*64;|&#x0*40;|&commat;/gi, "@")
    .replace(/&#0*46;|&#x0*2e;|&period;/gi, ".");

  // mailto: först — de är alltid riktiga adresser.
  for (const match of decoded.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    add(decodeURIComponent(match[1]));
  }

  for (const match of decoded.matchAll(EMAIL_RE)) add(match[0]);

  return found;
}

/**
 * Poängsätter en kandidat. Egen domän väger tyngst — en adress på företagets
 * eget domännamn är nästan alltid rätt, även när den är personlig.
 */
export function rankEmail(
  email: string,
  companyDomain: string | null | undefined,
): number {
  const value = email.trim().toLowerCase();
  const [local, domain] = value.split("@");
  if (!local || !domain) return 0;

  let score = 0;
  const own = bareDomain(companyDomain);
  if (own && (domain === own || domain.endsWith(`.${own}`))) score += 100;

  const flatLocal = local.replace(/[._-]/g, "");
  if (PRIMARY_ROLES.has(flatLocal) || PRIMARY_ROLES.has(local)) score += 30;
  else if (LOW_VALUE_ROLES.has(flatLocal) || LOW_VALUE_ROLES.has(local)) score += 5;
  else score += 20;

  return score;
}

/**
 * Bästa adressen på sidan, eller null. En främmande domän accepteras hellre
 * än ingen adress alls — grinden fångar email_domain_mismatch senare, och
 * att kasta den här vore att slänga ett lead ingen människa fått bedöma.
 */
export function bestEmailFromHtml(
  html: string,
  companyDomain: string | null | undefined,
): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const candidate of extractEmailCandidates(html)) {
    const score = rankEmail(candidate, companyDomain);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Sajter som inte är företagets egen — kataloger, sociala medier,
 * bokningsplattformar, nyhetsartiklar. Adressen på en sådan sida tillhör
 * portalen, inte bolaget, och skulle bli ett falskt lead.
 *
 * Listan speglar auto_scrapes NOT_A_REAL_WEBSITE och utökar den med de
 * portaler som faktiskt låg registrerade som "hemsida" i CRM:et 2026-09-11
 * (utbildning.se för O. Sergel Talarkonst, ltz.se för Heimjord).
 */
const THIRD_PARTY_HOSTS = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "tiktok.com", "youtube.com",
  "bokadirekt.se", "voady.com", "voady.se", "boka.se", "bokamera.se",
  "timecenter.se", "cliento.com", "wondr.se", "marketbooking.se",
  "booksy.com", "fresha.com", "treatwell.se", "treatwell.com",
  "mindbodyonline.com", "mindbody.io", "calendly.com", "acuityscheduling.com",
  "google.com", "maps.google.com", "hitta.se", "eniro.se", "gulasidorna.se",
  "allabolag.se", "ratsit.se", "merinfo.se", "bolagsfakta.se", "yelp.com",
  "tripadvisor.com", "tripadvisor.se", "proff.se", "largestcompanies.com",
  "linktr.ee", "linktree.com", "bio.link", "beacons.ai", "carrd.co",
  // Nyhets- och utbildningsportaler som legat registrerade som "hemsida".
  "ltz.se", "op.se", "svt.se", "utbildning.se", "yrkeshogskolan.se",
  "blocket.se", "indeed.com", "arbetsformedlingen.se",
];

/** Är adressen en portal snarare än företagets egen hemsida? */
export function isThirdPartySite(url: string | null | undefined): boolean {
  const host = bareDomain(url);
  if (!host) return false;
  return THIRD_PARTY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const CONTACT_HINTS = [
  "kontakt", "kontakta", "contact", "om-oss", "omoss", "about",
];

/**
 * Kontaktsidor att hämta när startsidan inte gav något. Max tre, så en
 * körning inte skenar på en sajt med hundra länkar.
 */
export function contactPageUrls(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const href = match[1];
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) {
      continue;
    }
    const path = url.pathname.toLowerCase();
    if (path === "/" || !CONTACT_HINTS.some((hint) => path.includes(hint))) continue;

    const clean = `${url.origin}${url.pathname}`.replace(/\/$/, "");
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 3) break;
  }
  return out;
}
