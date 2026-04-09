export interface QuoteGeneratedSections {
  summary_pitch: string;
  highlight_cards: Array<{ icon: string; title: string; text: string }>;
  problem_cards: Array<{ number: string; title: string; text: string }>;
  design_demo_description: string | null;
  package_includes: string[];
  proposal_body: string;
}

export interface QuoteGenerationContextInput {
  companyName: string;
  contactName: string;
  sector?: string | null;
  industry?: string | null;
  companyDescription?: string | null;
  enrichmentContext?: string;
  quoteTitle: string;
  isWebProject: boolean;
  lineItemsText: string;
  meetingContext?: string;
  callLogsContext?: string;
  emailContext?: string;
  kbTemplate?: string;
}

export interface QuoteContextSourcesInput {
  summary?: string | null;
  customer_needs?: string[] | null;
  objections?: string[] | null;
  quote_context?: {
    budget_mentioned?: string | null;
    timeline?: string | null;
  } | null;
}

export interface QuoteEmailLog {
  subject: string;
  status: string;
  sent_at?: string | null;
}

export interface QuoteCallLog {
  created_at: string;
  call_outcome: string;
  notes?: string | null;
  followup_note?: string | null;
  followup_date?: string | null;
}

const CALL_OUTCOME_LABELS: Record<string, string> = {
  no_answer: "Ingen svarade",
  busy: "Upptagen",
  wrong_number: "Fel nummer",
  spoke_gatekeeper: "Pratade med växel/reception",
  spoke_decision_maker: "Pratade med beslutsfattare",
  interested: "Visade intresse",
  not_interested: "Inte intresserad",
  meeting_booked: "Möte bokat",
  send_info: "Skicka information",
  callback_requested: "Återkom senare",
};

export async function fetchRecentCallLogs(
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: unknown) => unknown;
      };
    };
  },
  input: {
    contactId?: number | string | null;
    companyId?: number | string | null;
    limit?: number;
  },
): Promise<QuoteCallLog[]> {
  const { contactId, companyId, limit = 4 } = input;
  if (!contactId && !companyId) {
    return [];
  }

  let query = supabase
    .from("call_logs")
    .select("created_at, call_outcome, notes, followup_note, followup_date");

  if (contactId) {
    query = (query as { eq: (column: string, value: unknown) => unknown }).eq(
      "contact_id",
      contactId,
    );
  } else if (companyId) {
    query = (query as { eq: (column: string, value: unknown) => unknown }).eq(
      "company_id",
      companyId,
    );
  }

  const result = await (
    query as {
      order: (
        column: string,
        options: { ascending: boolean },
      ) => { limit: (value: number) => Promise<{ data: QuoteCallLog[] | null }> };
    }
  )
    .order("created_at", { ascending: false })
    .limit(limit);

  return result.data || [];
}

export function buildEnrichmentContext(
  company?: {
    lead_score?: number | null;
    segment?: string | null;
    has_facebook?: boolean | null;
    facebook_url?: string | null;
    has_instagram?: boolean | null;
    instagram_url?: string | null;
    website_score?: number | null;
  } | null,
): string {
  if (!company) {
    return "";
  }

  const parts: string[] = [];
  if (company.lead_score) parts.push(`Lead score: ${company.lead_score}/100`);
  if (company.segment) parts.push(`Segment: ${company.segment}`);
  if (company.has_facebook && company.facebook_url) {
    parts.push(`Facebook: aktiv (${company.facebook_url})`);
  }
  if (company.has_instagram && company.instagram_url) {
    parts.push(`Instagram: aktiv (${company.instagram_url})`);
  }
  if (company.website_score !== undefined && company.website_score !== null) {
    const quality =
      company.website_score === 0
        ? "ingen hemsida"
        : company.website_score < 40
          ? "dålig hemsida"
          : company.website_score < 70
            ? "ok hemsida"
            : "bra hemsida";
    parts.push(`Hemsida: ${quality} (score ${company.website_score}/100)`);
  }

  return parts.length > 0 ? `\nDigital närvaro: ${parts.join(", ")}` : "";
}

export function buildMeetingContext(
  analysis?: QuoteContextSourcesInput | null,
): string {
  if (!analysis) {
    return "";
  }

  const parts: string[] = [];
  if (analysis.summary) {
    parts.push(`Mötessammanfattning: ${analysis.summary}`);
  }
  if (Array.isArray(analysis.customer_needs) && analysis.customer_needs.length) {
    parts.push(`Identifierade behov: ${analysis.customer_needs.join(", ")}`);
  }
  if (Array.isArray(analysis.objections) && analysis.objections.length) {
    parts.push(`Invändningar: ${analysis.objections.join(", ")}`);
  }
  if (analysis.quote_context?.budget_mentioned) {
    parts.push(`Nämnd budget: ${analysis.quote_context.budget_mentioned}`);
  }
  if (analysis.quote_context?.timeline) {
    parts.push(`Önskad tidsram: ${analysis.quote_context.timeline}`);
  }

  return parts.length > 0
    ? `\n\nFRÅN SENASTE MÖTET:\n${parts.join("\n")}`
    : "";
}

export function buildEmailContext(emails: QuoteEmailLog[] | null | undefined) {
  if (!emails?.length) {
    return "";
  }

  const emailLines = emails.map(
    (email) =>
      `- "${email.subject}" (${email.status}, ${
        email.sent_at
          ? new Date(email.sent_at).toLocaleDateString("sv-SE")
          : "ej skickat"
      })`,
  );
  return `\n\nSENASTE E-POSTKOMMUNIKATION:\n${emailLines.join("\n")}`;
}

export function buildCallLogsContext(
  callLogs: QuoteCallLog[] | null | undefined,
): string {
  if (!callLogs?.length) {
    return "";
  }

  const lines = callLogs
    .map((log) => {
      const parts: string[] = [];
      const label = CALL_OUTCOME_LABELS[log.call_outcome] || log.call_outcome;
      const date = new Date(log.created_at).toLocaleDateString("sv-SE");
      parts.push(`${date}: ${label}`);

      if (log.notes?.trim()) {
        parts.push(`Anteckning: ${log.notes.trim()}`);
      }
      if (log.followup_note?.trim()) {
        parts.push(`Uppföljning: ${log.followup_note.trim()}`);
      }
      if (log.followup_date) {
        parts.push(
          `Planerad uppföljning: ${new Date(log.followup_date).toLocaleDateString("sv-SE")}`,
        );
      }

      return `- ${parts.join(" | ")}`;
    })
    .filter(Boolean);

  return lines.length > 0
    ? `\n\nFRÅN SAMTALSLOGGAR:\n${lines.join("\n")}`
    : "";
}

export function buildQuoteGenerationPrompts(
  input: QuoteGenerationContextInput,
): {
  prompt: string;
  systemPrompt: string;
} {
  const kbTemplateContext = input.kbTemplate
    ? `\n\nREFERENSOFFERT (imitera ton, struktur och detaljnivå — men INTE innehållet):\n---\n${input.kbTemplate}\n---`
    : "";

  const prompt = `Du ska generera strukturerat innehåll för en premium offert-PDF.

KONTEXT:
Kund: ${input.companyName || "Okänt företag"}
Kontaktperson: ${input.contactName}
${input.sector ? `Bransch: ${input.sector}` : ""}
${input.industry ? `Industri: ${input.industry}` : ""}
${input.companyDescription ? `Om kunden: ${input.companyDescription}` : ""}${input.enrichmentContext || ""}
Offertens titel: ${input.quoteTitle}
Projekttyp: ${input.isWebProject ? "Webbprojekt (hemsida/e-handel)" : "Övrigt digitalt projekt"}

Tjänster vi offererar:
${input.lineItemsText || "Inga specificerade tjänster"}${input.meetingContext || ""}${input.callLogsContext || ""}${input.emailContext || ""}${kbTemplateContext}

Svara med EXAKT detta JSON-format (inget annat):

{
  "summary_pitch": "2-3 meningar som sammanfattar projektet och vad kunden får. Fokus på värde och resultat, inte teknik.",
  "highlight_cards": [
    {
      "icon": "lucide-ikonnamn (välj bland: palette, layout, smartphone, search, zap, rocket, users, globe, shield, bar-chart, heart, mail, phone, clock, award)",
      "title": "Kort titel (2-3 ord)",
      "text": "En mening som beskriver vad kunden får"
    },
    {
      "icon": "...",
      "title": "...",
      "text": "..."
    },
    {
      "icon": "...",
      "title": "...",
      "text": "..."
    }
  ],
  "problem_cards": [
    {
      "number": "01",
      "title": "Kort problemtitel (2-4 ord)",
      "text": "2-3 meningar om problemet, anpassat efter kundens situation, språk och bransch."
    },
    {
      "number": "02",
      "title": "Kort problemtitel",
      "text": "2-3 meningar om nästa problem eller flaskhals som kunden faktiskt verkar ha."
    },
    {
      "number": "03",
      "title": "Kort problemtitel",
      "text": "2-3 meningar om risk, tappad effekt eller förlorade möjligheter om inget görs."
    }
  ],
  ${
    input.isWebProject
      ? `"design_demo_description": "Kort beskrivning av vad designdemon visar, anpassad till kundens bransch och konkreta behov.",`
      : `"design_demo_description": null,`
  }
  "package_includes": [
    "Punkt 1 som ingår i paketet",
    "Punkt 2",
    "Punkt 3",
    "Punkt 4",
    "Punkt 5"
  ],
  "proposal_body": "Fullständig offertext (se instruktioner nedan)"
}

INSTRUKTIONER FÖR proposal_body:
1. Kort, personlig hälsning till ${input.contactName} (en mening)
2. Visa att ni förstår kundens situation, nuläge och behov (2-3 meningar)
3. Beskriv varje tjänst med fokus på värdet för kunden
4. Väva in signaler från mötestranskript och samtalsloggar om de finns
5. Bemöt invändningar, osäkerheter eller önskemål som nämnts
6. Avsluta med ett tydligt nästa steg

REGLER:
- Skriv på svenska
- Inga priser, belopp eller moms i texten
- Inga signaturer eller hälsningsfraser
- Tonen ska vara direkt, kompetent och personlig
- ALDRIG emojis
- Använd konkreta detaljer från mötet och samtalsloggar när de finns
- Om kontexten visar specifika behov, invändningar, tidplaner eller beslutsmönster ska det märkas i texten
- Undvik generiska formuleringar som hade kunnat passa vilken kund som helst
${input.kbTemplate ? "- IMITERA tonen från referensofferten" : ""}- Max 250 ord i proposal_body
- highlight_cards ska ha EXAKT 3 kort
- problem_cards ska ha EXAKT 3 kort och kännas skrivna för just den här kunden
- package_includes ska ha 4-6 punkter som beskriver vad som faktiskt ingår i paketet
- Välj ikoner som passar innehållet`;

  const systemPrompt = `Du skriver offerttexter för Axona Digital AB, en webb- och AI-byrå i Östersund.

TONALITET:
- Professionell men jordnära, aldrig stel eller byråkratisk
- Rak och tydlig kommunikation, korta meningar
- Fokus på nytta och resultat, inte teknisk jargong
- Tilltala kunden med "ni/er" (liten bokstav)
- ALDRIG emojis
- ALDRIG floskler som "vi ser fram emot", "tveka inte att kontakta oss", "stärka er digitala närvaro"
- Skriv som en senior konsult som pratar med en jämlike
- Varje text ska kännas skriven för just den kunden, aldrig som en mall
- Om mötestranskript eller samtalsloggar visar prioriteringar, invändningar eller språkbruk ska du använda det för att göra texten mer träffsäker
${input.kbTemplate ? "- Du har fått en referensoffert att imitera — matcha dess ton, flöde och detaljnivå exakt, men skriv unikt innehåll" : ""}

SVARA ALLTID med ENBART giltig JSON — inget annat.`;

  return { prompt, systemPrompt };
}
