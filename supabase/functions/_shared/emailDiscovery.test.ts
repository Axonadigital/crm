import { describe, expect, it } from "vitest";
import {
  bestEmailFromHtml,
  contactPageUrls,
  decodeCloudflareEmail,
  extractEmailCandidates,
  isThirdPartySite,
  isUsableEmail,
  rankEmail,
} from "./emailDiscovery";

describe("extractEmailCandidates", () => {
  it("hittar adressen i en mailto-länk", () => {
    const html = `<a href="mailto:info@byggfirman.se">Mejla oss</a>`;
    expect(extractEmailCandidates(html)).toContain("info@byggfirman.se");
  });

  it("hittar adressen i brödtext utan länk", () => {
    const html = `<p>Kontakta oss på kontakt@takteknik.se så hörs vi.</p>`;
    expect(extractEmailCandidates(html)).toContain("kontakt@takteknik.se");
  });

  it("tar bort mailto-parametrar", () => {
    const html = `<a href="mailto:info@vvs.se?subject=Offert&body=Hej">Mejl</a>`;
    expect(extractEmailCandidates(html)).toContain("info@vvs.se");
  });

  it("avkodar &#64; som många CMS:er skriver ut", () => {
    const html = `<p>info&#64;tandlakaren.se</p>`;
    expect(extractEmailCandidates(html)).toContain("info@tandlakaren.se");
  });

  it("läser e-post ur LocalBusiness-schema", () => {
    const html = `<script type="application/ld+json">
      {"@type":"LocalBusiness","email":"boka@kliniken.se"}</script>`;
    expect(extractEmailCandidates(html)).toContain("boka@kliniken.se");
  });

  it("normaliserar till gemener och tar bort dubbletter", () => {
    const html = `<a href="mailto:Info@Bygg.se">a</a> <p>INFO@BYGG.SE</p>`;
    expect(extractEmailCandidates(html)).toEqual(["info@bygg.se"]);
  });

  // Den vanligaste falska träffen: bildfiler med @2x i namnet.
  it("plockar INTE upp retina-bildnamn som e-post", () => {
    const html = `<img src="/assets/logo@2x.png"><img src="hero@3x.jpg">`;
    expect(extractEmailCandidates(html)).toEqual([]);
  });

  it("plockar INTE upp paketversioner ur inbäddad JS", () => {
    const html = `<script>import "react@18.2.0"; import "vue@3.4.1";</script>`;
    expect(extractEmailCandidates(html)).toEqual([]);
  });
});

describe("decodeCloudflareEmail", () => {
  // Cloudflare Email Obfuscation är påslaget på massor av svenska sajter och
  // ersätter adressen med hex. Utan avkodning tappar vi dem helt.
  it("avkodar en cf-skyddad adress", () => {
    const email = "info@exempel.se";
    const key = 0x7a;
    let hex = key.toString(16).padStart(2, "0");
    for (const ch of email) {
      hex += (ch.charCodeAt(0) ^ key).toString(16).padStart(2, "0");
    }
    expect(decodeCloudflareEmail(hex)).toBe(email);
  });

  it("returnerar null på skräp i stället för att kasta", () => {
    expect(decodeCloudflareEmail("zz")).toBeNull();
    expect(decodeCloudflareEmail("")).toBeNull();
  });

  it("hittas via extractEmailCandidates i riktig markup", () => {
    const email = "kontakt@firman.se";
    const key = 0x2b;
    let hex = key.toString(16).padStart(2, "0");
    for (const ch of email) {
      hex += (ch.charCodeAt(0) ^ key).toString(16).padStart(2, "0");
    }
    const html = `<a href="/cdn-cgi/l/email-protection#${hex}">Mejla</a>`;
    expect(extractEmailCandidates(html)).toContain(email);
  });
});

describe("isUsableEmail", () => {
  it("godkänner en vanlig företagsadress", () => {
    expect(isUsableEmail("info@byggfirman.se")).toBe(true);
  });

  it("avvisar no-reply-adresser — ingen människa läser dem", () => {
    for (const e of [
      "noreply@firman.se",
      "no-reply@firman.se",
      "donotreply@firman.se",
      "no.reply@firman.se",
    ]) {
      expect(isUsableEmail(e), e).toBe(false);
    }
  });

  it("avvisar plattformarnas egna adresser", () => {
    for (const e of [
      "x@sentry.io",
      "a@wixpress.com",
      "b@example.com",
      "c@sentry.wixpress.com",
      "d@godaddy.com",
      "e@squarespace.com",
      "f@w3.org",
      "g@schema.org",
      "h@domain.com",
      "i@yourdomain.se",
    ]) {
      expect(isUsableEmail(e), e).toBe(false);
    }
  });

  it("avvisar adresser som slutar i en filändelse", () => {
    expect(isUsableEmail("bild@logo.png")).toBe(false);
    expect(isUsableEmail("a@b.jpg")).toBe(false);
  });

  it("avvisar adresser utan giltig toppdomän", () => {
    expect(isUsableEmail("info@localhost")).toBe(false);
    expect(isUsableEmail("trasig@")).toBe(false);
    expect(isUsableEmail("@firman.se")).toBe(false);
  });
});

describe("rankEmail", () => {
  it("rankar företagets egen domän över en främmande", () => {
    const egen = rankEmail("nagon@byggfirman.se", "byggfirman.se");
    const framling = rankEmail("info@hitta.se", "byggfirman.se");
    expect(egen).toBeGreaterThan(framling);
  });

  it("rankar info@ över en personlig adress på samma domän", () => {
    expect(rankEmail("info@f.se", "f.se")).toBeGreaterThan(
      rankEmail("anders.svensson@f.se", "f.se"),
    );
  });

  it("rankar kontakt@ och hej@ som likvärdiga förstahandsval", () => {
    expect(rankEmail("kontakt@f.se", "f.se")).toBe(rankEmail("info@f.se", "f.se"));
    expect(rankEmail("hej@f.se", "f.se")).toBe(rankEmail("info@f.se", "f.se"));
  });

  it("rankar webmaster och faktura sist — fel människa", () => {
    expect(rankEmail("webmaster@f.se", "f.se")).toBeLessThan(
      rankEmail("anders@f.se", "f.se"),
    );
    expect(rankEmail("faktura@f.se", "f.se")).toBeLessThan(
      rankEmail("anders@f.se", "f.se"),
    );
  });

  it("klarar att företagsdomänen är okänd", () => {
    expect(rankEmail("info@f.se", null)).toBeGreaterThan(0);
  });

  it("behandlar www-prefix som samma domän", () => {
    expect(rankEmail("info@f.se", "www.f.se")).toBe(rankEmail("info@f.se", "f.se"));
  });
});

describe("bestEmailFromHtml", () => {
  it("väljer info@ på egen domän före en personlig adress", () => {
    const html = `
      <a href="mailto:anders@byggfirman.se">Anders</a>
      <a href="mailto:info@byggfirman.se">Info</a>`;
    expect(bestEmailFromHtml(html, "byggfirman.se")).toBe("info@byggfirman.se");
  });

  it("väljer egen domän framför en katalogsajts adress", () => {
    const html = `
      <a href="mailto:info@hitta.se">Hitta</a>
      <a href="mailto:anders@byggfirman.se">Anders</a>`;
    expect(bestEmailFromHtml(html, "byggfirman.se")).toBe("anders@byggfirman.se");
  });

  it("returnerar null när sidan inte har någon användbar adress", () => {
    const html = `<a href="mailto:noreply@firman.se">x</a><img src="a@2x.png">`;
    expect(bestEmailFromHtml(html, "firman.se")).toBeNull();
  });

  it("tar en främmande adress hellre än ingen alls", () => {
    // Grinden fångar email_domain_mismatch senare; att kasta den här vore
    // att slänga ett lead som en människa hade kunnat bedöma.
    const html = `<a href="mailto:bygg.ab@telia.com">Mejl</a>`;
    expect(bestEmailFromHtml(html, "byggfirman.se")).toBe("bygg.ab@telia.com");
  });
});

describe("contactPageUrls", () => {
  it("hittar kontaktsidan i menyn", () => {
    const html = `<a href="/kontakt">Kontakt</a><a href="/tjanster">Tjänster</a>`;
    expect(contactPageUrls(html, "https://byggfirman.se")).toContain(
      "https://byggfirman.se/kontakt",
    );
  });

  it("klarar absoluta länkar och engelska varianter", () => {
    const html = `<a href="https://f.se/contact-us">Contact</a>`;
    expect(contactPageUrls(html, "https://f.se")).toContain("https://f.se/contact-us");
  });

  it("hoppar över länkar till andra domäner", () => {
    const html = `<a href="https://facebook.com/kontakt">Kontakt</a>`;
    expect(contactPageUrls(html, "https://f.se")).toEqual([]);
  });

  it("ger som mest tre sidor så en körning inte skenar", () => {
    const html = ["kontakt", "contact", "om-oss", "about", "kontakta-oss"]
      .map((s) => `<a href="/${s}">l</a>`)
      .join("");
    expect(contactPageUrls(html, "https://f.se").length).toBeLessThanOrEqual(3);
  });
});

describe("isThirdPartySite", () => {
  it("känner igen kataloger och sociala medier", () => {
    for (const u of [
      "https://www.hitta.se/nagot",
      "https://facebook.com/firman",
      "https://www.allabolag.se/foretag/x",
      "https://bokadirekt.se/places/x",
    ]) {
      expect(isThirdPartySite(u), u).toBe(true);
    }
  });

  // Båda låg registrerade som "hemsida" i CRM:et 2026-09-11.
  it("känner igen nyhets- och utbildningsportaler", () => {
    expect(isThirdPartySite("https://www.utbildning.se/kurser/sergel-talarkonst/")).toBe(true);
    expect(isThirdPartySite("https://www.ltz.se/2023-06-10/hon-bytte-taxin")).toBe(true);
  });

  it("släpper igenom en riktig företagssajt", () => {
    expect(isThirdPartySite("https://www.byggfirman.se/kontakt")).toBe(false);
    expect(isThirdPartySite("http://www.bkx.se/")).toBe(false);
  });

  it("returnerar false på tomt i stället för att kasta", () => {
    expect(isThirdPartySite(null)).toBe(false);
    expect(isThirdPartySite("")).toBe(false);
  });
});
