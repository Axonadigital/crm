// Jev som domare över sökträffarna i leadverifieringen.
//
// Varför (2026-09-28): verifieringen i leadVerify.ts gissar med regler om en
// sökträff är bolagets egen hemsida eller en katalog. Reglerna missade
// Norderåsens kedjesida (bad-varme.se), tog alltombolag.se och
// brabyggfirmor.se för hemsidor, och flaggade o-mek.se som främmande domän
// fast det troligen är Ovikens Mekaniska. Idén kommer från Jev Search
// (github.com/superagents-lab/jev-search): sökmotorn hämtar, Jev bedömer
// relevansen. Här bedömer Jev en enda sak: har bolaget en egen hemsida, och
// hör mejladressen till bolaget.
//
// Jev svarar med sannolikhet OCH egen säkerhet per fråga. Låg säkerhet =
// Jev vet att den inte vet; då avgör vi åt det säkra hållet (mejlet stoppas).
// Anropet går via Vercel AI Gateway med rå fetch (ingen SDK i edge-runtime),
// egen retry på 408/425/429/5xx (gatewayen 503:ar under last, mätt 2026-09-24).

import type { SearchHit } from "./leadVerify.ts";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v4/ai/evaluation-model";
const MODEL = "typesafe-ai/jev";
const RETRY_WAITS_MS = [1500, 4000];
const TIMEOUT_MS = 20000;
export const MAX_JUDGED_HITS = 8;

export interface JevQuestion {
  type: "boolean";
  instructions: string;
  criteria?: { true?: string; false?: string };
}

export interface JevVerdict {
  /** Sannolikhet 0–1 för ja. */
  p: number;
  /** Jevs säkerhet 0–1; null när gatewayen inte skickar den. */
  confidence: number | null;
}

export interface WebsiteJudgement {
  hasSite: JevVerdict | null;
  /** Den träff Jev tror mest på som egen hemsida, och hur mycket. */
  best: { url: string; p: number } | null;
  emailBelongs: JevVerdict | null;
}

export function buildWebsiteQuestions(input: {
  company: string;
  city: string | null;
  email: string | null;
  emailDomainTitle: string | null;
  hits: SearchHit[];
}): { state: Record<string, unknown>; questions: Record<string, JevQuestion> } {
  const hits = input.hits.slice(0, MAX_JUDGED_HITS);
  const state = {
    bolag: input.company,
    ort: input.city ?? "okänd",
    mejladress: input.email ?? "saknas",
    mejldomanens_startsida: input.emailDomainTitle ?? "svarar inte eller saknas",
    sokträffar: hits.map((h, i) => ({ nr: i, url: h.link, titel: h.title ?? "", utdrag: h.snippet ?? "" })),
  };
  const questions: Record<string, JevQuestion> = {
    has_site: {
      type: "boolean",
      instructions:
        "Har bolaget en egen hemsida, enligt sökträffarna? Räkna även en sida som ett utdrag uttryckligen anger som bolagets hemsida, " +
        "och en egen sida hos en kedja eller franchise där bolaget är medlem (t.ex. Bad & Värme). " +
        "Räkna INTE kataloger (allabolag, hitta, eniro, bolagsfakta med flera), leverantörers återförsäljarlistor, Facebook-sidor eller andra bolag med liknande namn.",
      criteria: { true: "Minst en träff är eller anger bolagets egen hemsida.", false: "Bara kataloger, sociala medier eller andra bolag." },
    },
    email_belongs: {
      type: "boolean",
      instructions:
        "Hör mejladressen till just det här bolaget? Jämför domänen och mejldomänens startsida med bolagsnamnet. " +
        "En förkortning av namnet (O-Mek för Ovikens Mekaniska) räknas som samma bolag. En adress på ett annat bolags domän räknas inte.",
      criteria: { true: "Adressen är bolagets egen eller en fri brevlåda som bolaget uppenbart använder.", false: "Adressen tillhör ett annat bolag eller en katalog." },
    },
  };
  hits.forEach((_, i) => {
    questions[`own_${i}`] = {
      type: "boolean",
      instructions: `Är sökträff nr ${i} bolagets egen hemsida (eller dess egen sida hos en kedja), och inte en katalog, leverantörslista eller ett annat bolag?`,
    };
  });
  return { state, questions };
}

type GatewayAnswer = { type?: string; probability?: number };

/** Gatewayens svar → våra domar. Tål saknade fält. */
export function readWebsiteJudgement(body: unknown, hits: SearchHit[]): WebsiteJudgement {
  const b = (body ?? {}) as { answers?: Record<string, GatewayAnswer>; providerMetadata?: { typesafe?: { confidence?: Record<string, number> } } };
  const answers = b.answers ?? {};
  const conf = b.providerMetadata?.typesafe?.confidence ?? {};
  const verdict = (id: string): JevVerdict | null => {
    const p = answers[id]?.probability;
    if (typeof p !== "number" || !Number.isFinite(p)) return null;
    const c = conf[id];
    return { p, confidence: typeof c === "number" && Number.isFinite(c) ? c : null };
  };
  let best: { url: string; p: number } | null = null;
  hits.slice(0, MAX_JUDGED_HITS).forEach((h, i) => {
    const v = verdict(`own_${i}`);
    if (v && (!best || v.p > best.p)) best = { url: h.link, p: v.p };
  });
  return { hasSite: verdict("has_site"), best, emailBelongs: verdict("email_belongs") };
}

/** Säkert nej: låg sannolikhet OCH Jev är säker på sin sak. */
export function confidentNo(v: JevVerdict | null, maxP = 0.25, minConfidence = 0.6): boolean {
  if (!v) return false;
  return v.p <= maxP && (v.confidence == null || v.confidence >= minConfidence);
}

/** Säkert ja, samma princip. */
export function confidentYes(v: JevVerdict | null, minP = 0.75, minConfidence = 0.6): boolean {
  if (!v) return false;
  return v.p >= minP && (v.confidence == null || v.confidence >= minConfidence);
}

/** Ett anrop till Jev. null = gick inte (saknad nyckel, fel, timeout). */
export async function askJev(
  state: Record<string, unknown>,
  questions: Record<string, JevQuestion>,
  apiKey: string | undefined,
): Promise<unknown | null> {
  if (!apiKey) return null;
  for (let attempt = 0; attempt <= RETRY_WAITS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_WAITS_MS[attempt - 1]));
    try {
      const res = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "ai-gateway-auth-method": "api-key",
          "ai-gateway-protocol-version": "0.0.1",
          "ai-evaluation-model-specification-version": "4",
          "ai-model-id": MODEL,
        },
        body: JSON.stringify({ state, questions }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return await res.json();
      // En felaktig nyckel eller fråga blir inte rätt av att skickas igen.
      if (![408, 425, 429].includes(res.status) && res.status < 500) {
        console.warn(`jev: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
        return null;
      }
    } catch (e) {
      console.warn("jev:", e instanceof Error ? e.message : e);
    }
  }
  return null;
}
