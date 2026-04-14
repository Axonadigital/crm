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
  recurringAmount?: number | null;
  recurringInterval?: "monthly" | "quarterly" | "yearly" | null;
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
        <h3 data-editable="highlight_cards.${i}.title">${esc(card.title)}</h3>
        <p data-editable="highlight_cards.${i}.text">${esc(card.text)}</p>
      </div>`,
    )
    .join("");

  return `
<section class="section" style="background:var(--color-bg-alt);">
  <div class="section-inner">
    <p class="section-label animate-in">// Sammanfattning</p>
    <h2 class="section-title animate-in">${esc(firstSentence)}.</h2>
    <p class="section-text animate-in" data-editable="summary_pitch">${esc(data.pitch)}</p>
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
        <h3 data-editable="problem_cards.${i}.title">${esc(card.title)}</h3>
        <p data-editable="problem_cards.${i}.text">${esc(card.text)}</p>
      </div>`,
    )
    .join("");

  return `
<section class="section">
  <div class="section-inner">
    <p class="section-label animate-in">// Varför en hemsida?</p>
    <h2 class="section-title animate-in" data-editable="problem_section_title">${esc(sectionTitle)}</h2>
    <div class="problem-grid">
      ${cardsHtml}
    </div>
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
  sectionTitle = "Välj det som passar er",
  sectionText = "Paketet nedan är skräddarsytt för er verksamhet och era behov.",
): string {
  const includesHtml = includes
    .map(
      (item, idx) =>
        `<li><span class="includes-check">✓</span> <span data-editable="package_includes.${idx}">${esc(item)}</span></li>`,
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
        <h3 data-editable="upgrade_package.title">${esc(upgrade.title)}</h3>
        <div class="includes-price" data-editable="upgrade_package.price">${esc(upgrade.price)}</div>
        <div class="includes-price-note">exkl. moms · engångsbelopp</div>
        <p style="font-size:0.88rem;color:var(--color-text-muted);line-height:1.6;margin-bottom:16px;" data-editable="upgrade_package.description">${esc(upgrade.description)}</p>
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
    <h2 class="section-title animate-in" data-editable="package_section_title">${esc(sectionTitle)}</h2>
    <p class="section-text animate-in" data-editable="package_section_text">${esc(sectionText)}</p>
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
  sectionTitle = "Hemsidor vi har byggt",
  sectionText = "Här är ett urval av webbplatser vi levererat — både ensidiga och flersidiga lösningar för företag i liknande branscher.",
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
          <div class="ref-card-type" data-editable="reference_projects.${i}.type">${esc(proj.type)}</div>
          <h3 data-editable="reference_projects.${i}.title">${esc(proj.title)}</h3>
          <p data-editable="reference_projects.${i}.description">${esc(proj.description)}</p>
          <a href="${esc(proj.link)}" class="ref-link" target="_blank">Besök sidan →</a>
        </div>
      </div>`,
    )
    .join("");

  return `
<section class="section" style="background:var(--color-bg-alt);">
  <div class="section-inner">
    <p class="section-label animate-in">// Tidigare projekt</p>
    <h2 class="section-title animate-in" data-editable="reference_section_title">${esc(sectionTitle)}</h2>
    <p class="section-text animate-in" data-editable="reference_section_text">${esc(sectionText)}</p>
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
  sectionTitle = "Från signering till lanserad hemsida",
  sectionText = "En tydlig process där ni alltid vet vad som händer härnäst.",
): string {
  const stepsHtml = steps
    .map(
      (step, i) => `
      <div class="timeline-item">
        <div class="timeline-marker${i === steps.length - 1 ? " active" : ""}"></div>
        <div class="timeline-content">
          <div class="timeline-day">Steg ${i + 1}</div>
          <h3 data-editable="process_steps.${i}.title">${esc(step.title)}</h3>
          <p data-editable="process_steps.${i}.text">${esc(step.text)}</p>
        </div>
      </div>`,
    )
    .join("");

  return `
<section class="section process">
  <div class="section-inner">
    <p class="section-label animate-in">// Så här går det till</p>
    <h2 class="section-title animate-in" data-editable="process_section_title">${esc(sectionTitle)}</h2>
    <p class="section-text animate-in" data-editable="process_section_text">${esc(sectionText)}</p>
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
  sectionTitle = "Vad som gäller efter lansering",
): string {
  const cardsHtml = cards
    .map(
      (card, i) => `
      <div class="terms-card animate-in stagger-${i + 1}">
        <div class="terms-icon">${getIcon(card.icon)}</div>
        <h3 data-editable="support_cards.${i}.title">${esc(card.title)}</h3>
        <p data-editable="support_cards.${i}.text">${esc(card.text)}</p>
      </div>`,
    )
    .join("");

  return `
<section class="section">
  <div class="section-inner">
    <p class="section-label animate-in">// Villkor &amp; support</p>
    <h2 class="section-title animate-in" data-editable="support_section_title">${esc(sectionTitle)}</h2>
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
  sectionTitle = "Byggt för att synas och prestera",
): string {
  const itemsHtml = items
    .map(
      (item, i) => `
      <div class="tech-item animate-in stagger-${i + 1}">
        <div class="tech-item-icon">${getIcon(item.icon)}</div>
        <h4 data-editable="tech_items.${i}.title">${esc(item.title)}</h4>
        <p data-editable="tech_items.${i}.text">${esc(item.text)}</p>
      </div>`,
    )
    .join("");

  return `
<section class="section">
  <div class="section-inner">
    <p class="section-label animate-in">// Teknik &amp; Optimering</p>
    <h2 class="section-title animate-in" data-editable="tech_section_title">${esc(sectionTitle)}</h2>
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
  sectionTitle = "Vilka är Axona Digital?",
  sectionText = "Vi är en digital byrå i Östersund som hjälper svenska företag med hemsidor, e-handel och AI-lösningar. Varje leverans ska ge mätbar effekt — inte bara se bra ut.",
): string {
  const foundersHtml = founders
    .map(
      (f, i) => `
        <div class="about-person animate-in"${i > 0 ? ' style="margin-top:24px"' : ""}>
          <div class="about-avatar">${esc(f.initials)}</div>
          <div class="about-person-info">
            <h4 data-editable="founders.${i}.name">${esc(f.name)}</h4>
            <div class="role" data-editable="founders.${i}.role">${esc(f.role)}</div>
            <p data-editable="founders.${i}.description">${esc(f.description)}</p>
          </div>
        </div>`,
    )
    .join("");

  return `
<section class="section about-axona">
  <div class="section-inner">
    <p class="section-label animate-in">// Om oss</p>
    <h2 class="section-title animate-in" data-editable="about_section_title">${esc(sectionTitle)}</h2>
    <p class="section-text animate-in" data-editable="about_section_text">${esc(sectionText)}</p>
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

    ${
      data.recurringAmount && data.recurringAmount > 0
        ? (() => {
            const intervalLabel =
              data.recurringInterval === "monthly"
                ? "månad"
                : data.recurringInterval === "quarterly"
                  ? "kvartal"
                  : data.recurringInterval === "yearly"
                    ? "år"
                    : "period";
            const recurringInclVat =
              data.recurringAmount * (1 + data.vatRate / 100);
            return `
    <div class="recurring-box" style="margin-top:28px;padding:20px 24px;border:2px solid var(--color-accent);border-radius:12px;background:rgba(var(--color-accent-rgb,37,99,235),0.04);">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--color-accent);margin-bottom:10px;">Återkommande kostnad</div>
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">
        <span style="font-size:24px;font-weight:800;color:var(--color-text);">${fmt(data.recurringAmount)} ${esc(data.currency)}</span>
        <span style="font-size:13px;color:var(--color-text-muted);">exkl. moms / ${esc(intervalLabel)}</span>
        <span style="font-size:13px;color:var(--color-text-muted);">(${fmt(recurringInclVat)} ${esc(data.currency)} inkl. moms)</span>
      </div>
      <div style="margin-top:6px;font-size:12px;color:var(--color-text-muted);">Debiteras löpande efter leverans, separat från engångsbeloppet ovan.</div>
    </div>`;
          })()
        : ""
    }
  </div>
</section>`;
}

export function buildPriceSummarySection(
  data: PricingData,
  _header: PageHeaderData,
  _pageNum: number,
  bullets?: string[],
): string {
  const defaultBullets = [
    "Kostnadsfri demo — ni ser innan ni bestämmer er",
    "Inga löpande kostnader från vårt håll",
    data.paymentTerms || "30 dagars betalningsvillkor",
    "Full äganderätt till webbplatsen vid leverans",
  ];
  const resolvedBullets =
    bullets && bullets.length > 0 ? bullets : defaultBullets;
  const bulletsHtml = resolvedBullets
    .map(
      (b, i) =>
        `<li><span class="ps-check">✓</span> <span data-editable="price_summary_bullets.${i}">${esc(b)}</span></li>`,
    )
    .join("\n        ");

  const recurringHtml = (() => {
    if (!data.recurringAmount || data.recurringAmount <= 0) return "";
    const intervalLabel =
      data.recurringInterval === "monthly"
        ? "månad"
        : data.recurringInterval === "quarterly"
          ? "kvartal"
          : data.recurringInterval === "yearly"
            ? "år"
            : "period";
    return `
      <div class="pricing-summary animate-in" style="margin-top:20px;border-top:1px solid var(--color-border);padding-top:20px;">
        <div class="pricing-summary-label">Återkommande kostnad</div>
        <div class="pricing-summary-amount">${fmt(data.recurringAmount)} ${esc(data.currency)}</div>
        <div class="pricing-summary-note">exkl. moms / ${esc(intervalLabel)}</div>
      </div>`;
  })();

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
        ${bulletsHtml}
      </ul>
    </div>
    ${recurringHtml}
  </div>
</section>`;
}

export function buildTermsAndSignatureSection(
  terms: TermsData,
  _sig: SignatureData,
  seller: SellerInfo,
  _header: PageHeaderData,
  _pageNum: number,
): string {
  const sellerFacts = [
    seller.companyName ? `Avsändare: ${esc(seller.companyName)}` : "",
    seller.email ? `E-post: ${esc(seller.email)}` : "",
    seller.phone ? `Telefon: ${esc(seller.phone)}` : "",
    seller.website ? `Webb: ${esc(seller.website)}` : "",
  ].filter(Boolean);

  return `
<section class="section" style="background:var(--color-bg-alt);">
  <div class="section-inner">
    <p class="section-label animate-in">// Villkor &amp; information</p>
    <h2 class="section-title animate-in">Det här gäller för offerten</h2>
    <div class="terms-summary animate-in">
      <p>Offerten sammanfattar leveransen, omfattningen och villkoren för projektet. Den fullständiga digitala offerten är det underlag ni granskar inför ett eventuellt godkännande.</p>
      <p style="margin-top:8px;"><a href="https://www.axonadigital.se/villkor" target="_blank" class="terms-link">Läs fullständiga villkor →</a></p>
    </div>
    ${
      terms.customerReference
        ? `<div class="terms-reference animate-in">
      <div class="terms-reference-label">Er referens</div>
      <div class="terms-reference-value">${esc(terms.customerReference)}</div>
    </div>`
        : ""
    }
    ${
      terms.termsAndConditions
        ? `<p class="terms-copy animate-in">${esc(terms.termsAndConditions)}</p>`
        : ""
    }
    <div class="terms-meta-grid animate-in">
      <div class="terms-meta-card">
        <div class="terms-meta-title">Leveransunderlag</div>
        <p>Denna offert visar innehåll, investering och villkor i samma dokument, så att det är tydligt vad som ingår.</p>
      </div>
      <div class="terms-meta-card">
        <div class="terms-meta-title">Kontakt från Axona</div>
        ${sellerFacts.map((fact) => `<p>${fact}</p>`).join("")}
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
