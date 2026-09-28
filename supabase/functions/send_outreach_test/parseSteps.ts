// Tolkning av stegen i ett testutskick. Egen modul så den kan testas utan Deno.serve.

type Row = Record<string, unknown>;

const MAX_STEPS = 6;

interface Step {
  body: string;
  imageUrl: string | null;
  imageAlt: string;
}

/** Tolkar och validerar anropet. Fel ⇒ text, annars stegen. */
export function parseSteps(raw: unknown): { steps: Step[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "steps måste vara en lista med minst ett steg" };
  if (raw.length > MAX_STEPS) return { error: `högst ${MAX_STEPS} steg` };
  const steps: Step[] = [];
  for (const item of raw) {
    const r = (item && typeof item === "object" ? item : {}) as Row;
    const body = typeof r.body === "string" ? r.body.trim() : "";
    if (!body) return { error: "varje steg behöver en body" };
    const imageUrl = typeof r.image_url === "string" && /^https:\/\/\S+$/.test(r.image_url.trim()) ? r.image_url.trim() : null;
    steps.push({ body, imageUrl, imageAlt: typeof r.image_alt === "string" ? r.image_alt : "" });
  }
  return { steps };
}
