import { describe, expect, it } from "vitest";
import { buildWebsiteQuestions, confidentNo, confidentYes, readWebsiteJudgement } from "./jevJudge.ts";

const hits = [
  { link: "https://www.eniro.se/bad+v%C3%A4rme", title: "Bad & Värme Norderåsens VVS AB", snippet: "Hemsida: www.bad-varme.se" },
  { link: "https://www.bad-varme.se/ort/ostersund/", title: "Bad & Värme Östersund", snippet: "Norderåsens VVS i Östersund" },
];

describe("jevJudge", () => {
  it("bygger en fråga per träff plus de två helhetsfrågorna, högst åtta träffar", () => {
    const { state, questions } = buildWebsiteQuestions({ company: "Norderåsens VVS AB", city: "Östersund", email: "info@norderasensvvs.se", emailDomainTitle: null, hits });
    expect(Object.keys(questions)).toEqual(["has_site", "email_belongs", "own_0", "own_1"]);
    expect((state.sokträffar as unknown[]).length).toBe(2);
    const many = Array.from({ length: 12 }, (_, i) => ({ link: `https://x${i}.se/` }));
    expect(Object.keys(buildWebsiteQuestions({ company: "X", city: null, email: null, emailDomainTitle: null, hits: [...many, ...many] }).questions)).toHaveLength(14);
  });
  it("läser sannolikhet, säkerhet och bästa träff ur gatewayens svar", () => {
    const body = {
      answers: { has_site: { type: "boolean", probability: 0.91 }, email_belongs: { type: "boolean", probability: 0.8 }, own_0: { type: "boolean", probability: 0.2 }, own_1: { type: "boolean", probability: 0.87 } },
      providerMetadata: { typesafe: { confidence: { has_site: 0.82 } } },
    };
    const j = readWebsiteJudgement(body, hits);
    expect(j.hasSite).toEqual({ p: 0.91, confidence: 0.82 });
    expect(j.emailBelongs).toEqual({ p: 0.8, confidence: null });
    expect(j.best).toEqual({ url: "https://www.bad-varme.se/ort/ostersund/", p: 0.87 });
    expect(readWebsiteJudgement(null, hits)).toEqual({ hasSite: null, best: null, emailBelongs: null });
  });
  it("säkert ja och säkert nej kräver både sannolikhet och säkerhet", () => {
    expect(confidentNo({ p: 0.1, confidence: 0.9 })).toBe(true);
    expect(confidentNo({ p: 0.1, confidence: 0.4 })).toBe(false);
    expect(confidentNo({ p: 0.4, confidence: 0.9 })).toBe(false);
    expect(confidentYes({ p: 0.9, confidence: null })).toBe(true);
    expect(confidentNo({ p: 0.13, confidence: null })).toBe(true);
    expect(confidentNo({ p: 0.2, confidence: null })).toBe(false);
    expect(confidentYes(null)).toBe(false);
  });
});
