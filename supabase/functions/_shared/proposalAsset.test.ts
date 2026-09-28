import { describe, expect, it } from "vitest";
import {
  assetOwner,
  assetPath,
  assetPublicUrl,
  familiesNeedingAsset,
  MAX_BUILD_ATTEMPTS,
  proposalEndpoint,
  proposalMode,
  proposalRequestFor,
  subtitleNow,
  taskDoneNote,
} from "./proposalAsset.ts";

describe("familjer och läge", () => {
  it("bildfamiljerna kommer ur krokCopy, inte ur en egen lista", () => {
    const f = familiesNeedingAsset();
    expect(f).toEqual(expect.arrayContaining(["slow-mobile", "poor-crux", "not-mobile", "parked", "no-site"]));
    expect(f).not.toContain("no-gbp");
    expect(f).not.toContain("unreachable");
  });
  it("parkerad sida och ingen sida byggs som skiss utan 'före'", () => {
    expect(proposalMode("parked")).toBe("sketch");
    expect(proposalMode("no-site")).toBe("sketch");
    expect(proposalMode("slow-mobile")).toBe("before_after");
  });
});

describe("subtitleNow", () => {
  it("citerar samma mätvärde som mejl ett, aldrig en siffra som saknas", () => {
    expect(subtitleNow("slow-mobile", "nimoz.se", "Långsam på mobil (38/100)")).toBe(
      "nimoz.se i mobilen i dag, Googles mobilmätning 38 av 100",
    );
    expect(subtitleNow("slow-mobile", "nimoz.se", null)).toBe("nimoz.se i mobilen i dag");
    expect(subtitleNow("not-mobile", "x.se", null)).toContain("datorstorlek");
    expect(subtitleNow("poor-crux", "x.se", "Sidan upplevs som långsam")).not.toMatch(/\d+ av 100/);
  });
});

describe("proposalRequestFor", () => {
  const company = { name: "Nimoz Elinstallation AB", website: "nimoz.se", phone_number: "073-248 39 79", city: "Hammerdal", address: null };
  it("bygger begäran på det CRM:et vet och kompletterar protokollet", () => {
    const r = proposalRequestFor("slow-mobile", company, "Långsam på mobil (38/100)");
    expect(r.url).toBe("https://nimoz.se");
    expect(r.mode).toBe("before_after");
    expect(r.facts).toEqual({ name: "Nimoz Elinstallation", phone: "073-248 39 79", city: "Hammerdal", address: "" });
    expect(r.subtitleNow).toBe("nimoz.se i mobilen i dag, Googles mobilmätning 38 av 100");
    expect(r.subtitleAfter).toContain("Er logga");
  });
  it("utan webbplats blir det skiss, även om familjen är en före/efter-familj", () => {
    const r = proposalRequestFor("slow-mobile", { ...company, website: "" }, null);
    expect(r.url).toBeUndefined();
    expect(r.mode).toBe("sketch");
    expect(r.subtitleAfter).toContain("vad ni gör, var, och hur man når er");
  });
  it("skissfamiljerna skickar aldrig en url", () => {
    const r = proposalRequestFor("parked", company, null);
    expect(r.url).toBeUndefined();
    expect(r.mode).toBe("sketch");
  });
});

describe("sökväg, ägare och notering", () => {
  it("sökvägen bär enrollment-id och tidsstämpel", () => {
    expect(assetPath(42, new Date("2026-09-28T08:05:09Z"))).toBe("forslag/42-20260928T080509.jpg");
    expect(assetPublicUrl("https://x.supabase.co/", "forslag/42-a.jpg")).toBe(
      "https://x.supabase.co/storage/v1/object/public/scanner-screenshots/forslag/42-a.jpg",
    );
  });
  it("renderarens adress härleds från RENDER_SERVICE_URL oavsett om den pekar på /render", () => {
    expect(proposalEndpoint("https://render.axonadigital.se/render")).toBe("https://render.axonadigital.se/proposal");
    expect(proposalEndpoint("https://render.axonadigital.se/")).toBe("https://render.axonadigital.se/proposal");
  });
  it("tre misslyckanden lämnar leveransen till en människa", () => {
    expect(assetOwner({ asset_url: "https://x/y.jpg" })).toBe("done");
    expect(assetOwner({ asset_url: null, asset_attempts: 0 })).toBe("agent");
    expect(assetOwner({ asset_url: "", asset_attempts: MAX_BUILD_ATTEMPTS })).toBe("human");
  });
  it("noteringen säger vad som faktiskt kom med", () => {
    expect(taskDoneNote("https://x/y.jpg", { logo: false, photos: 2, services: ["A", "B", "C"] })).toBe(
      "Byggd av förslagsagenten: https://x/y.jpg (utan logga (hittades inte på sidan), 2 foton, 3 tjänster från sidan).",
    );
  });
});
