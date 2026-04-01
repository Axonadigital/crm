/**
 * Premium Quote HTML Section Builders — VPM Energi template structure.
 * Each function returns an HTML string for one section of the premium quote template.
 */

import { getIcon } from "./lucideIcons.ts";

/** Escape HTML characters */
export const esc = (s: string | null | undefined): string =>
  (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Format a number in Swedish locale */
export const fmt = (n: number) =>
  Number(n).toLocaleString("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Convert plain text paragraphs to HTML */
export const textToHtml = (text: string): string =>
  text
    .split(/\n\n+/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");

// ── Types ──

export interface HeroData {
  logoUrl: string;
  quoteNumber: string;
  title: string;
  companyName: string;
  contactName: string;
  companyAddress: string;
  companyCityZip: string;
  quoteDate: string;
  validUntil: string | null;
  totalInclVat: number;
  vatAmount: number;
  currency: string;
  sellerName: string;
  sellerOrgNumber: string;
  sellerContact: string;
}

export interface HighlightCard {
  icon: string;
  title: string;
  text: string;
}

export interface SummaryData {
  pitch: string;
  cards: HighlightCard[];
}

export interface DesignDemoData {
  companyName: string;
  tagline: string;
  heroImageUrl: string;
  services: Array<{ icon: string; title: string; text: string }>;
}

export interface ReferenceProject {
  title: string;
  url: string;
  link: string;
  type: string;
  description: string;
}

export interface ProcessStep {
  number: string;
  title: string;
  text: string;
}

export interface TechItem {
  icon: string;
  title: string;
  text: string;
}

export interface FounderCard {
  initials: string;
  name: string;
  role: string;
  description: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface PricingData {
  lineItems: LineItem[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  afterDiscount: number;
  vatRate: number;
  vatAmount: number;
  totalInclVat: number;
  currency: string;
  paymentTerms: string;
  deliveryTerms: string;
  validUntil: string | null;
}

export interface TermsData {
  termsAndConditions: string;
  customerReference: string;
}

export interface SignatureData {
  sellerName: string;
  buyerName: string;
  contactName: string;
}

export interface SellerInfo {
  companyName: string;
  orgNumber: string;
  vatNumber: string;
  fSkatt: boolean;
  address: string;
  zipCity: string;
  phone: string;
  email: string;
  website: string;
  bankgiro: string;
  plusgiro: string;
  iban: string;
  bic: string;
}

export interface PageHeaderData {
  logoDarkUrl: string;
  quoteNumber: string;
  quoteDate: string;
}

export interface ProblemCard {
  number: string;
  title: string;
  text: string;
}

export interface SupportCard {
  icon: string;
  title: string;
  text: string;
}

// ── Section Builders ──

export function buildHeroSection(data: HeroData): string {
  const summaryPitch = data.title || data.companyName;
  return `
<header class="hero">
  <div class="hero-grid-bg"></div>
  <div class="hero-glow"></div>
  <div class="hero-inner">
    <img src="${data.logoUrl}" alt="Axona Digital" class="hero-logo">
    <p class="hero-label">${esc(data.title)} — Offert</p>
    <h1>${esc(data.companyName)}</h1>
    <p class="hero-subtitle">${esc(summaryPitch)}</p>
    <div class="hero-meta">
      <div><div class="hero-meta-label">Från</div><div class="hero-meta-value">${esc(data.sellerName)}</div></div>
      <div><div class="hero-meta-label">Presenterad för</div><div class="hero-meta-value">${esc(data.companyName)}</div></div>
      <div><div class="hero-meta-label">Datum</div><div class="hero-meta-value">${esc(data.quoteDate)}</div></div>
      <div><div class="hero-meta-label">Ref</div><div class="hero-meta-value">${esc(data.quoteNumber)}</div></div>
    </div>
  </div>
</header>`;
}

export function buildSummarySection(
  data: SummaryData,
  _header: PageHeaderData,
): string {
  const firstSentence = data.pitch.split(/[.!?]/)[0].trim();
  const cardsHtml = data.cards
    .map(
      (card, i) => `
      <div class="summary-card animate-in stagger-${i + 1}">
        <div class="summary-card-icon">${getIcon(card.icon)}</div>
        <h3>${esc(card.title)}</h3>
        <p>${esc(card.text)}</p>
      </div>`,
    )
    .join("");

  return `
<section class="section" style="background:var(--color-bg-alt);">
  <div class="section-inner">
    <p class="section-label animate-in">// Sammanfattning</p>
    <h2 class="section-title animate-in">${esc(firstSentence)}.</h2>
    <p class="section-text animate-in">${esc(data.pitch)}</p>
    <div class="summary-cards">
      ${cardsHtml}
    </div>
  </div>
</section>`;
}

export function buildProblemSection(
  cards: ProblemCard[],
  sectionTitle: string,
  _header: PageHeaderData,
  _pageNum: number,
): string {
  const cardsHtml = cards
    .map(
      (card, i) => `
      <div class="problem-card animate-in stagger-${i + 1}">
        <div class="problem-number">${esc(card.number)}</div>
        <h3>${esc(card.title)}</h3>
        <p>${esc(card.text)}</p>
      </div>`,
    )
    .join("");

  return `
<section class="section">
  <div class="section-inner">
    <p class="section-label animate-in">// Varför en hemsida?</p>
    <h2 class="section-title animate-in">${esc(sectionTitle)}</h2>
    <div class="problem-grid">
      ${cardsHtml}
    </div>
  </div>
</section>`;
}

export function buildDesignDemoSection(
  data: DesignDemoData,
  _header: PageHeaderData,
  _pageNum: number,
): string {
  const companyUrl = `${data.companyName.toLowerCase().replace(/\s+/g, "")}.se`;

  const servicesHtml = data.services
    .map(
      (svc) => `
          <div class="mock-service">
            <div class="mock-service-icon">${getIcon(svc.icon, 20)}</div>
            <h5>${esc(svc.title)}</h5>
            <p>${esc(svc.text)}</p>
          </div>`,
    )
    .join("");

  return `
<section class="section demo">
  <div class="section-inner">
    <p class="section-label animate-in">// Er hemsida — visualiserad</p>
    <h2 class="section-title animate-in">Så kan er sida se ut</h2>
    <p class="section-text animate-in">${esc(data.tagline)}</p>
    <div class="demo-preview animate-in">
      <div class="demo-browser-bar">
        <span class="demo-dot"></span><span class="demo-dot"></span><span class="demo-dot"></span>
        <span class="demo-url-bar">${esc(companyUrl)}</span>
      </div>
      <div class="demo-body">
        <div class="mock-hero">
          <img src="${esc(data.heroImageUrl)}" alt="${esc(data.companyName)}" class="mock-hero-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
          <div class="mock-hero-img-placeholder" style="display:none;"></div>
          <div class="mock-hero-overlay">
            <div class="mock-hero-badge">Professionell webbplats</div>
            <h4 style="font-family:var(--font-display);font-size:1.5rem;font-weight:800;margin-bottom:6px;">${esc(data.companyName)}</h4>
            <p style="font-size:0.82rem;opacity:0.75;margin:0;">${esc(data.tagline)}</p>
          </div>
          <div class="mock-hero-content">
            <p style="font-size:0.85rem;color:var(--color-text-muted);max-width:380px;margin:0 auto 20px;text-align:center;color:rgba(255,255,255,0.55);">${esc(data.tagline)}</p>
            <div style="text-align:center;"><span class="mock-btn">Kontakta oss</span></div>
          </div>
        </div>
        <div class="mock-content">
          <div class="mock-services">
            ${servicesHtml}
          </div>
          <div class="mock-about">
            <div class="mock-about-img">Bild på teamet</div>
            <div class="mock-about-text">
              <h5>Om ${esc(data.companyName)}</h5>
              <p>Vi presenterar oss och vårt erbjudande på ett tydligt och professionellt sätt.</p>
            </div>
          </div>
          <div class="mock-contact">
            <h5>Kontakta oss</h5>
            <div class="mock-input-row">
              <input class="mock-input" value="Namn" disabled>
              <input class="mock-input" value="Telefon" disabled>
            </div>
            <div class="mock-input-row"><input class="mock-input" value="E-post" disabled></div>
            <textarea class="mock-input" style="width:100%;height:48px;resize:none;margin-bottom:4px;" disabled>Meddelande</textarea>
            <span class="mock-submit">Skicka förfrågan</span>
          </div>
        </div>
      </div>
    </div>
    <p class="demo-note animate-in">Illustrativt designexempel — anpassas helt efter ert varumärke och önskemål.</p>
  </div>
</section>`;
}

export interface UpgradePackage {
  title: string;
  description: string;
  price: string;
  includes: string[];
  benefits: string[];
}

export function buildPackageSection(
  includes: string[],
  quoteTitle: string,
  price: string,
  _header: PageHeaderData,
  _pageNum: number,
  upgrade?: UpgradePackage | null,
): string {
  const includesHtml = includes
    .map(
      (item) => `<li><span class="includes-check">✓</span> ${esc(item)}</li>`,
    )
    .join("");

  const upgradeHtml = upgrade
    ? (() => {
        const upgradeIncludesHtml = upgrade.includes
          .map(
            (item) =>
              `<li><span class="includes-check">✓</span> ${esc(item)}</li>`,
          )
          .join("");
        const benefitsHtml = upgrade.benefits
          .map(
            (b) =>
              `<div class="upgrade-benefit"><span class="upgrade-arrow">→</span> ${esc(b)}</div>`,
          )
          .join("");
        return `
      <div class="includes-box upgrade animate-in stagger-2">
        <div class="includes-badge upgrade-badge">Tillägg</div>
        <h3>${esc(upgrade.title)}</h3>
        <div class="includes-price">${esc(upgrade.price)}</div>
        <div class="includes-price-note">exkl. moms · engångsbelopp</div>
        <p style="font-size:0.88rem;color:var(--color-text-muted);line-height:1.6;margin-bottom:16px;">${esc(upgrade.description)}</p>
        <ul class="includes-list">
          ${upgradeIncludesHtml}
        </ul>
        ${
          benefitsHtml
            ? `<div class="upgrade-benefits">
          <div class="upgrade-benefits-title">Fördelar med en flersidig hemsida</div>
          ${benefitsHtml}
        </div>`
            : ""
        }
      </div>`;
      })()
    : "";

  return `
<section class="section">
  <div class="section-inner">
    <p class="section-label animate-in">// Vad som ingår</p>
    <h2 class="section-title animate-in">Välj det som passar er</h2>
    <p class="section-text animate-in">Paketet nedan är skräddarsytt för er verksamhet och era behov.</p>
    <div class="includes-grid">
      <div class="includes-box primary animate-in stagger-1">
        <div class="includes-badge">Denna offert</div>
        <h3>${esc(quoteTitle)}</h3>
        <div class="includes-price">${esc(price)}</div>
        <div class="includes-price-note">exkl. moms · engångsbelopp</div>
        <ul class="includes-list">
          ${includesHtml}
        </ul>
      </div>
      ${upgradeHtml}
    </div>
  </div>
</section>`;
}

export function buildReferenceSection(
  projects: ReferenceProject[],
  _header: PageHeaderData,
  _pageNum: number,
): string {
  const cardsHtml = projects
    .map(
      (proj, i) => `
      <div class="ref-card animate-in stagger-${i + 1}">
        <a href="${esc(proj.link)}" target="_blank" style="text-decoration:none;color:inherit;display:block;">
        <div class="ref-card-visual">
          <img src="${esc(proj.url)}" alt="${esc(proj.title)} hemsida" class="ref-card-screenshot" loading="lazy" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=ref-card-screenshot-placeholder>${esc(proj.link.replace(/https?:\/\//, ""))}</div>';">
        </div>
        </a>
        <div class="ref-card-info">
          <div class="ref-card-type">${esc(proj.type)}</div>
          <h3>${esc(proj.title)}</h3>
          <p>${esc(proj.description)}</p>
          <a href="${esc(proj.link)}" class="ref-link" target="_blank">Besök sidan →</a>
        </div>
      </div>`,
    )
    .join("");

  return `
<section class="section" style="background:var(--color-bg-alt);">
  <div class="section-inner">
    <p class="section-label animate-in">// Tidigare projekt</p>
    <h2 class="section-title animate-in">Hemsidor vi har byggt</h2>
    <p class="section-text animate-in">Här är ett urval av webbplatser vi levererat — både ensidiga och flersidiga lösningar för företag i liknande branscher.</p>
    <div class="ref-grid">
      ${cardsHtml}
    </div>
  </div>
</section>`;
}

export function buildProcessSection(
  steps: ProcessStep[],
  _header: PageHeaderData,
  _pageNum: number,
): string {
  const stepsHtml = steps
    .map(
      (step, i) => `
      <div class="timeline-item">
        <div class="timeline-marker${i === steps.length - 1 ? " active" : ""}"></div>
        <div class="timeline-content">
          <div class="timeline-day">Steg ${i + 1}</div>
          <h3>${esc(step.title)}</h3>
          <p>${esc(step.text)}</p>
        </div>
      </div>`,
    )
    .join("");

  return `
<section class="section process">
  <div class="section-inner">
    <p class="section-label animate-in">// Så här går det till</p>
    <h2 class="section-title animate-in">Från signering till lanserad hemsida</h2>
    <p class="section-text animate-in">En tydlig process där ni alltid vet vad som händer härnäst.</p>
    <div class="timeline animate-in">
      ${stepsHtml}
    </div>
  </div>
</section>`;
}

export function buildSupportSection(
  cards: SupportCard[],
  _header: PageHeaderData,
  _pageNum: number,
): string {
  const cardsHtml = cards
    .map(
      (card, i) => `
      <div class="terms-card animate-in stagger-${i + 1}">
        <div class="terms-icon">${getIcon(card.icon)}</div>
        <h3>${esc(card.title)}</h3>
        <p>${esc(card.text)}</p>
      </div>`,
    )
    .join("");

  return `
<section class="section">
  <div class="section-inner">
    <p class="section-label animate-in">// Villkor &amp; support</p>
    <h2 class="section-title animate-in">Vad som gäller efter lansering</h2>
    <div class="terms-grid">
      ${cardsHtml}
    </div>
  </div>
</section>`;
}

export function buildTechSection(
  items: TechItem[],
  _header: PageHeaderData,
  _pageNum: number,
): string {
  const itemsHtml = items
    .map(
      (item, i) => `
      <div class="tech-item animate-in stagger-${i + 1}">
        <div class="tech-item-icon">${getIcon(item.icon)}</div>
        <h4>${esc(item.title)}</h4>
        <p>${esc(item.text)}</p>
      </div>`,
    )
    .join("");

  return `
<section class="section">
  <div class="section-inner">
    <p class="section-label animate-in">// Teknik &amp; Optimering</p>
    <h2 class="section-title animate-in">Byggt för att synas och prestera</h2>
    <div class="tech-row">
      ${itemsHtml}
    </div>
  </div>
</section>`;
}

export function buildAboutSection(
  founders: FounderCard[],
  _header: PageHeaderData,
  _pageNum: number,
): string {
  const foundersHtml = founders
    .map(
      (f, i) => `
        <div class="about-person animate-in"${i > 0 ? ' style="margin-top:24px"' : ""}>
          <div class="about-avatar">${esc(f.initials)}</div>
          <div class="about-person-info">
            <h4>${esc(f.name)}</h4>
            <div class="role">${esc(f.role)}</div>
            <p>${esc(f.description)}</p>
          </div>
        </div>`,
    )
    .join("");

  return `
<section class="section about-axona">
  <div class="section-inner">
    <p class="section-label animate-in">// Om oss</p>
    <h2 class="section-title animate-in">Vilka är Axona Digital?</h2>
    <p class="section-text animate-in">Vi är en digital byrå i Östersund som hjälper svenska företag med hemsidor, e-handel och AI-lösningar. Varje leverans ska ge mätbar effekt — inte bara se bra ut.</p>
    <div class="about-grid">
      <div>
        ${foundersHtml}
      </div>
      <div>
        <div class="about-facts animate-in">
          <div class="about-fact"><div class="about-fact-value">2–6 v</div><div class="about-fact-label">Typisk leveranstid</div></div>
          <div class="about-fact"><div class="about-fact-value">100%</div><div class="about-fact-label">Äganderätt till kunden</div></div>
          <div class="about-fact"><div class="about-fact-value">24h</div><div class="about-fact-label">Svar på förfrågningar</div></div>
          <div class="about-fact"><div class="about-fact-value">0 kr</div><div class="about-fact-label">Löpande kostnad</div></div>
        </div>
      </div>
    </div>
  </div>
</section>`;
}

export function buildPricingTableSection(
  data: PricingData,
  _header: PageHeaderData,
  _pageNum: number,
): string {
  const lineItemsHtml = data.lineItems
    .map(
      (item) => `
    <tr>
      <td class="col-desc">${esc(item.description)}</td>
      <td class="col-center">${item.quantity}</td>
      <td class="col-right">${fmt(item.unit_price)} ${esc(data.currency)}</td>
      <td class="col-right">${fmt(item.quantity * item.unit_price)} ${esc(data.currency)}</td>
    </tr>`,
    )
    .join("");

  return `
<section class="section">
  <div class="section-inner">
    <p class="section-label animate-in">// Prisspecifikation</p>
    <h2 class="section-title animate-in">Vad som ingår</h2>

    ${
      data.lineItems.length > 0
        ? `
    <table class="price-table">
      <thead>
        <tr>
          <th>Beskrivning</th>
          <th>Antal</th>
          <th>Styckpris</th>
          <th>Summa</th>
        </tr>
      </thead>
      <tbody>${lineItemsHtml}</tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span class="totals-label">Netto</span>
        <span class="totals-value">${fmt(data.subtotal)} ${esc(data.currency)}</span>
      </div>
      ${
        data.discountPct > 0
          ? `
      <div class="totals-row discount">
        <span class="totals-label">Rabatt (${data.discountPct}%)</span>
        <span class="totals-value">\u2212${fmt(data.discountAmount)} ${esc(data.currency)}</span>
      </div>
      <div class="totals-row">
        <span class="totals-label">Summa efter rabatt</span>
        <span class="totals-value">${fmt(data.afterDiscount)} ${esc(data.currency)}</span>
      </div>`
          : ""
      }
      <div class="totals-row">
        <span class="totals-label">Moms (${data.vatRate}%)</span>
        <span class="totals-value">${fmt(data.vatAmount)} ${esc(data.currency)}</span>
      </div>
      <div class="totals-row total">
        <span>Att betala</span>
        <span>${fmt(data.totalInclVat)} ${esc(data.currency)}</span>
      </div>
    </div>`
        : `
    <div style="margin-top:24px">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a3a3a3;margin-bottom:3px">Totalbelopp</div>
      <div style="font-size:28px;font-weight:800;color:var(--color-text);letter-spacing:-0.5px">${fmt(data.totalInclVat)} ${esc(data.currency)}</div>
    </div>`
    }

    ${
      data.paymentTerms || data.deliveryTerms
        ? `
    <div class="info-grid">
      ${data.paymentTerms ? `<div class="info-box"><div class="info-box-label">Betalningsvillkor</div><div class="info-box-value">${esc(data.paymentTerms)}</div></div>` : ""}
      ${data.deliveryTerms ? `<div class="info-box"><div class="info-box-label">Leveransvillkor</div><div class="info-box-value">${esc(data.deliveryTerms)}</div></div>` : ""}
    </div>`
        : ""
    }

    ${data.validUntil ? `<div class="validity">Denna offert är giltig till och med <strong>${esc(data.validUntil)}</strong>.</div>` : ""}
  </div>
</section>`;
}

export function buildPriceSummarySection(
  data: PricingData,
  _header: PageHeaderData,
  _pageNum: number,
): string {
  return `
<section class="section">
  <div class="section-inner">
    <p class="section-label animate-in">// Investering</p>
    <h2 class="section-title animate-in">Sammanfattning</h2>
    <div class="pricing-summary animate-in">
      <div class="pricing-summary-label">Engångsinvestering</div>
      <div class="pricing-summary-amount">${fmt(data.afterDiscount)} ${esc(data.currency)}</div>
      <div class="pricing-summary-note">exkl. moms</div>
      <ul class="pricing-summary-features">
        <li><span class="ps-check">✓</span> Kostnadsfri demo — ni ser innan ni bestämmer er</li>
        <li><span class="ps-check">✓</span> Inga löpande kostnader från vårt håll</li>
        <li><span class="ps-check">✓</span> ${esc(data.paymentTerms || "30 dagars betalningsvillkor")}</li>
        <li><span class="ps-check">✓</span> Full äganderätt till webbplatsen vid leverans</li>
      </ul>
    </div>
  </div>
</section>`;
}

export function buildTermsAndSignatureSection(
  terms: TermsData,
  sig: SignatureData,
  _seller: SellerInfo,
  _header: PageHeaderData,
  _pageNum: number,
): string {
  return `
<section class="section" style="background:var(--color-bg-alt);">
  <div class="section-inner">
    <p class="section-label animate-in">// Villkor &amp; signering</p>
    <h2 class="section-title animate-in">Avtal</h2>
    <div class="signing-intro animate-in">
      <p>Genom att signera godkänner ni denna offert och dess villkor. Offerten är giltig enligt angivet datum ovan.</p>
      <p style="margin-top:8px;"><a href="https://www.axonadigital.se/villkor" target="_blank" class="terms-link">Läs fullständiga villkor →</a></p>
    </div>
    ${terms.termsAndConditions ? `<p style="font-size:0.88rem;color:var(--color-text-muted);line-height:1.65;margin-bottom:24px;">${esc(terms.termsAndConditions)}</p>` : ""}
    <div class="signing-grid animate-in">
      <div class="signing-block">
        <div class="signing-for">För ${esc(sig.buyerName)}</div>
        <div class="signing-line"></div>
        <div class="signing-field">Namnförtydligande</div>
        <div class="signing-line short"></div>
        <div class="signing-field">Datum</div>
      </div>
      <div class="signing-block">
        <div class="signing-for">För ${esc(sig.sellerName)}</div>
        <div class="signing-line"></div>
        <div class="signing-name">Isak Persson</div>
        <div class="signing-field">Namnförtydligande</div>
        <div class="signing-line short"></div>
        <div class="signing-field">Datum</div>
      </div>
    </div>
  </div>
</section>`;
}

export function buildDocumentFooter(
  sellerName: string,
  quoteNumber: string,
  seller?: SellerInfo,
  logoUrl?: string,
): string {
  const logoHtml = logoUrl
    ? `<div style="margin-bottom:20px;"><img src="${logoUrl}" alt="${esc(sellerName)}" style="height:28px;object-fit:contain;"></div>`
    : "";

  if (!seller) {
    return `
<footer class="offert-formal-footer">
  <div class="formal-footer-inner">
    ${logoHtml}
    <div class="formal-bottom">
      <span>Konfidentiellt dokument</span>
      <span>Ref: ${esc(quoteNumber)}</span>
      <span>${new Date().getFullYear()}</span>
    </div>
  </div>
</footer>`;
  }

  return `
<footer class="offert-formal-footer">
  <div class="formal-footer-inner">
    ${logoHtml}
    <div class="formal-label">Avsändare</div>
    <div class="formal-grid">
      <div class="formal-col">
        <div class="formal-col-title">Företag</div>
        ${seller.companyName ? `<p><strong>${esc(seller.companyName)}</strong></p>` : ""}
        ${seller.orgNumber ? `<p>Org.nr: ${esc(seller.orgNumber)}</p>` : ""}
        ${seller.vatNumber ? `<p>Momsreg: ${esc(seller.vatNumber)}</p>` : ""}
        ${seller.fSkatt ? `<p>Innehar F-skattsedel</p>` : ""}
        ${seller.address ? `<p style="margin-top:8px;">${esc(seller.address)}</p>` : ""}
        ${seller.zipCity ? `<p>${esc(seller.zipCity)}</p>` : ""}
      </div>
      <div class="formal-col">
        <div class="formal-col-title">Kontakt</div>
        ${seller.phone ? `<p>Tel: ${esc(seller.phone)}</p>` : ""}
        ${seller.email ? `<p>${esc(seller.email)}</p>` : ""}
        ${seller.website ? `<p>${esc(seller.website)}</p>` : ""}
      </div>
      <div class="formal-col">
        <div class="formal-col-title">Bankuppgifter</div>
        ${seller.bankgiro ? `<p>Bankgiro: ${esc(seller.bankgiro)}</p>` : ""}
        ${seller.iban ? `<p style="margin-top:8px;font-size:0.72rem;">IBAN: ${esc(seller.iban)}</p>` : ""}
        ${seller.bic ? `<p style="font-size:0.72rem;">BIC: ${esc(seller.bic)}</p>` : ""}
      </div>
    </div>
    <div class="formal-bottom">
      <span>Konfidentiellt dokument</span>
      <span>Ref: ${esc(quoteNumber)}</span>
      <span>${new Date().getFullYear()}</span>
    </div>
  </div>
</footer>`;
}
