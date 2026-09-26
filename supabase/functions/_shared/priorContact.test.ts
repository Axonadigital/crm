import { describe, expect, it } from "vitest";
import {
  crmHistoryEvents,
  domainOf,
  gmailHistoryQuery,
  latestEvent,
  parseWarmDraft,
  summarizeHistory,
  warmFollowupPrompt,
  warmTaskText,
} from "./priorContact.ts";

describe("gmailHistoryQuery", () => {
  it("söker hela domänen när företaget har egen, bara adressen vid fri brevlåda", () => {
    expect(gmailHistoryQuery("par@elkompetens.nu", "http://www.elkompetens.nu/")).toBe(
      "{from:par@elkompetens.nu to:par@elkompetens.nu from:@elkompetens.nu to:@elkompetens.nu} -in:draft -in:spam",
    );
    const q = gmailHistoryQuery("bodalsvvs@gmail.com", "https://bodalsvvs.se/") ?? "";
    expect(q).toContain("from:bodalsvvs@gmail.com");
    expect(q).not.toContain("@gmail.com}");
    expect(q).not.toContain("from:@gmail.com");
    expect(q).toContain("from:@bodalsvvs.se");
  });
  it("ger null utan adress och sajt", () => {
    expect(gmailHistoryQuery(null, null)).toBeNull();
    expect(domainOf("https://www.nimoz.se/")).toBe("nimoz.se");
    expect(domainOf("Info@Nimoz.se")).toBe("nimoz.se");
    expect(domainOf("bara text")).toBeNull();
  });
});

describe("historik", () => {
  const rows = [
    { kind: "call", at: "2026-05-12T11:20:00Z", label: "no_answer", text: "" },
    { kind: "deal", at: "2026-04-07T11:46:00Z", label: "proposal-sent / Hemsida", text: "" },
    { kind: "call", at: "2026-04-07T12:36:00Z", label: "meeting_booked", text: "Pratade med Per på nytt.  Han var på att ta mötet imorgon." },
    { kind: "skräp" },
  ];
  it("tolkar raderna och summerar äldst först med svenska etiketter", () => {
    const events = crmHistoryEvents(rows);
    expect(events).toHaveLength(3);
    const text = summarizeHistory(events);
    expect(text.split("\n")).toEqual([
      "2026-04-07 affär (proposal-sent / Hemsida)",
      "2026-04-07 samtal (möte bokat): Pratade med Per på nytt. Han var på att ta mötet imorgon.",
      "2026-05-12 samtal (inget svar)",
    ]);
    expect(latestEvent(events)?.label).toBe("no_answer");
  });
  it("klipper långa historiker och säger hur många som utelämnats", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ kind: "call", at: `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`, label: "no_answer", text: "" }));
    const text = summarizeHistory(crmHistoryEvents(many), 5);
    expect(text).toMatch(/^\(15 äldre händelser utelämnade\)\n/);
    expect(text.split("\n")).toHaveLength(6);
  });
});

describe("utkastet", () => {
  it("prompten bär historik, fynd, erbjudande och referens", () => {
    const p = warmFollowupPrompt({ namn: "Elkompetens", kontaktnamn: "Pär", historik: "2026-05-12 samtal (inget svar)", fynd: "Sajten är inte mobilanpassad", erbjudande: "en före/efter-bild", referens: "Östersunds Elservice" });
    expect(p).toContain("Kontaktperson: Pär");
    expect(p).toContain("2026-05-12 samtal");
    expect(p).toContain("Östersunds Elservice");
  });
  it("parseWarmDraft vägrar tomt och för kort, klipper ämnet", () => {
    expect(parseWarmDraft('{"subject":"x","body":"för kort"}')).toBeNull();
    expect(parseWarmDraft("inte json")).toBeNull();
    const ok = parseWarmDraft({ subject: "  hemsidan   från i våras? ", body: "ett två tre fyra fem sex sju åtta nio tio elva tolv tretton fjorton femton sexton" });
    expect(ok?.subject).toBe("hemsidan från i våras?");
  });
  it("uppgiftstexten säger var utkastet ligger och vad som hände senast", () => {
    const t = warmTaskText("Elkompetens", { kind: "call", at: "2026-05-12T11:20:00Z", label: "no_answer", text: "", source: "crm" }, true);
    expect(t).toContain("ligger i Gmail");
    expect(t).toContain("Senast 2026-05-12: samtal (inget svar).");
    expect(warmTaskText("X", null, false)).toContain("kunde inte skrivas automatiskt");
  });
});
