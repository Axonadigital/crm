import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { buildStylesheet, buildScript } from "../_shared/premiumStyles.ts";
import { buildEditorScript } from "../_shared/quoteEditorScript.ts";
import { resolveReferenceProjects } from "../_shared/premiumQuoteReferences.ts";
import { stripWriteTokenFromHtml } from "../_shared/sanitizeQuoteHtml.ts";
import {
  buildHeroSection,
  buildSummarySection,
  buildProblemSection,
  buildReferenceSection,
  buildPackageSection,
  buildProcessSection,
  buildSupportSection,
  buildTechSection,
  buildAboutSection,
  buildPriceSummarySection,
  buildTermsAndSignatureSection,
  buildDocumentFooter,
  esc,
  fmt,
  textToHtml,
} from "../_shared/premiumSections.ts";
import { normalizePremiumSections } from "../_shared/quoteWorkflow/normalizeSections.ts";
import type {
  HeroData,
  SummaryData,
  ProblemCard,
  ReferenceProject,
  ProcessStep,
  SupportCard,
  TechItem,
  FounderCard,
  PricingData,
  TermsData,
  SignatureData,
  SellerInfo,
  PageHeaderData,
  UpgradePackage,
} from "../_shared/premiumSections.ts";

/**
 * Generate Quote PDF — Premium HTML document generator.
 *
 * Produces either:
 * - Premium 12-section template (if generated_sections exists)
 * - Legacy 4-page template (fallback for older quotes)
 */

/** Default reference projects (Axona portfolio) */
const DEFAULT_REFERENCES: ReferenceProject[] = [
  {
    title: "Isakssons Maleri",
    url: "https://image.thum.io/get/width/800/noanimate/https://isakssonsmaleriosd.se/",
    link: "https://isakssonsmaleriosd.se",
    type: "Flersidig hemsida",
    description:
      "Modern hemsida med tydlig CTA, omdömeshantering och konverteringsoptimerat kontaktflöde.",
  },
  {
    title: "ES Byggmontage",
    url: "https://image.thum.io/get/width/800/noanimate/https://esbyggmontage.se/",
    link: "https://esbyggmontage.se",
    type: "Flersidig hemsida",
    description:
      "Professionell webbplats för byggföretag med tjänstepresentation och referensprojekt.",
  },
  {
    title: "Kuntab",
    url: "https://image.thum.io/get/width/800/noanimate/https://kuntab.se/",
    link: "https://kuntab.se",
    type: "Ensidig hemsida",
    description:
      "Konverteringsoptimerad landningssida med fokus på tjänsterna och kontaktformulär.",
  },
];

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    // Auth handled by Kong (verify_jwt in config.toml) or by calling edge function
    {
      if (req.method !== "POST") {
        return createErrorResponse(405, "Method Not Allowed");
      }

      try {
        const { quote_id } = await req.json();
        if (!quote_id) {
          return createErrorResponse(400, "Missing quote_id");
        }

        const supabase = supabaseAdmin;

        // Fetch quote
        const { data: quote, error: quoteError } = await supabase
          .from("quotes")
          .select("*")
          .eq("id", quote_id)
          .single();

        if (quoteError || !quote) {
          return createErrorResponse(404, "Quote not found");
        }

        // Fetch company, contact, line items, and configuration in parallel
        const [companyRes, contactRes, lineItemsRes, configRes] =
          await Promise.all([
            supabase
              .from("companies")
              .select("*")
              .eq("id", quote.company_id)
              .single(),
            quote.contact_id
              ? supabase
                  .from("contacts")
                  .select("*")
                  .eq("id", quote.contact_id)
                  .single()
              : Promise.resolve({ data: null }),
            supabase
              .from("quote_line_items")
              .select("*")
              .eq("quote_id", quote_id)
              .order("sort_order", { ascending: true }),
            supabase
              .from("configuration")
              .select("config")
              .eq("id", 1)
              .single(),
          ]);

        const company = companyRes.data;
        const contact = contactRes.data;
        const lineItems = lineItemsRes.data || [];
        const config = configRes.data?.config || {};
        const seller = config.sellerCompany || {};

        // Extract logo from multiple possible sources
        const rawLogo = seller.quoteLogo;
        const quoteLogo =
          typeof rawLogo === "string"
            ? rawLogo
            : typeof rawLogo === "object" && rawLogo !== null
              ? ((rawLogo as Record<string, unknown>).src as string) || ""
              : "";
        // Config-level logos (set via CRM settings)
        const configLogo = (config.logo as string) || "";
        const configDarkLogo = (config.darkModeLogo as string) || "";

        const contactName = contact
          ? `${contact.first_name} ${contact.last_name}`
          : "";
        const quoteText = quote.custom_text || quote.generated_text || "";
        const sections = quote.generated_sections as Record<
          string,
          unknown
        > | null;

        // Calculate totals
        const subtotal = lineItems.reduce(
          (sum: number, item: { quantity: number; unit_price: number }) =>
            sum + item.quantity * item.unit_price,
          0,
        );
        const discountPct = Number(quote.discount_percent) || 0;
        const discountAmount = subtotal * (discountPct / 100);
        const afterDiscount = subtotal - discountAmount;
        const vatRate = Number(quote.vat_rate) ?? 25;
        const vatAmount = afterDiscount * (vatRate / 100);
        const totalInclVat = afterDiscount + vatAmount;
        const cur = quote.currency || "SEK";
        const quoteNumber = quote.quote_number || `#${quote.id}`;
        const quoteDate = new Date(quote.created_at).toLocaleDateString(
          "sv-SE",
        );
        const validUntil = quote.valid_until
          ? new Date(quote.valid_until).toLocaleDateString("sv-SE")
          : null;

        // Logo URLs — priority: quoteLogo (seller setting) > config logos > SVG fallback
        // LOGO_LIGHT = for dark backgrounds (hero). LOGO_DARK = for light backgrounds (footer).
        const SVG_LIGHT =
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 280 40'%3E%3Ctext x='0' y='30' font-family='Inter,Arial,sans-serif' font-size='28' font-weight='800' fill='%23fff' letter-spacing='2'%3EAXONA%3C/text%3E%3Ctext x='148' y='30' font-family='Inter,Arial,sans-serif' font-size='28' font-weight='300' fill='%23fff' letter-spacing='2' stroke='%23fff' stroke-width='0.5' fill-opacity='0.9'%3EDIGITAL%3C/text%3E%3C/svg%3E";
        const SVG_DARK =
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 280 40'%3E%3Ctext x='0' y='30' font-family='Inter,Arial,sans-serif' font-size='28' font-weight='800' fill='%230a0a0a' letter-spacing='2'%3EAXONA%3C/text%3E%3Ctext x='148' y='30' font-family='Inter,Arial,sans-serif' font-size='28' font-weight='300' fill='%230a0a0a' letter-spacing='2' stroke='%230a0a0a' stroke-width='0.5' fill-opacity='0.9'%3EDIGITAL%3C/text%3E%3C/svg%3E";
        const LOGO_LIGHT =
          quoteLogo || configLogo || configDarkLogo || SVG_LIGHT;
        const LOGO_DARK = configDarkLogo || quoteLogo || configLogo || SVG_DARK;

        const accentColor = quote.accent_color || "#2563eb";

        // ================================================================
        // Decide which template to use
        // ================================================================
        const usePremiumTemplate = sections?.summary_pitch != null;

        let html: string;

        if (usePremiumTemplate) {
          // Normalize a copy — fills Kat. B defaults without mutating DB data.
          const normalizedSections: Record<string, unknown> = { ...sections! };
          normalizePremiumSections(normalizedSections);
          html = buildPremiumTemplate({
            quote,
            sections: normalizedSections,
            quoteText,
            company,
            contact,
            contactName,
            lineItems,
            seller,
            logoLight: LOGO_LIGHT,
            logoDark: LOGO_DARK,
            accentColor,
            quoteNumber,
            quoteDate,
            validUntil,
            subtotal,
            discountPct,
            discountAmount,
            afterDiscount,
            vatRate,
            vatAmount,
            totalInclVat,
            cur,
            writeToken: (quote.write_token as string) || "",
            supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
          });
        } else {
          html = buildLegacyTemplate({
            quote,
            quoteText,
            company,
            contactName,
            lineItems,
            seller,
            logoLight: LOGO_LIGHT,
            logoDark: LOGO_DARK,
            quoteNumber,
            quoteDate,
            validUntil,
            subtotal,
            discountPct,
            discountAmount,
            afterDiscount,
            vatRate,
            vatAmount,
            totalInclVat,
            cur,
          });
        }

        // Split the artifact into two variants before persistence:
        //  - editableHtml (kept as-is): carries the real write_token and
        //    lives in quotes.html_content for the internal CRM preview/editor
        //  - publicHtml (sanitized): uploaded to the public Storage bucket
        //    and exposed as quotes.pdf_url. It MUST NOT contain any real
        //    editor credential — anyone with the URL sees this variant.
        //
        // This split is the core fix for the pdf_url leak discovered post
        // deploy of the Phase 1+2 refactor: serve_quote strips on the way
        // out but the Storage URL bypasses serve_quote entirely, so the
        // sanitization must happen at write time too.
        const editableHtml = html;
        const publicHtml = stripWriteTokenFromHtml(editableHtml);

        const fileName = `quote_${quote_id}_${Date.now()}.html`;
        const { error: uploadError } = await supabase.storage
          .from("attachments")
          .upload(fileName, new Blob([publicHtml], { type: "text/html" }), {
            contentType: "text/html",
            upsert: true,
          });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          return createErrorResponse(500, "Failed to upload PDF");
        }

        const {
          data: { publicUrl: rawUrl },
        } = supabase.storage.from("attachments").getPublicUrl(fileName);

        const apiExternalUrl =
          Deno.env.get("API_EXTERNAL_URL") ||
          Deno.env.get("SUPABASE_URL") ||
          "";
        const publicUrl = apiExternalUrl
          ? rawUrl.replace(/^https?:\/\/[^/]+/, apiExternalUrl)
          : rawUrl;

        await supabase
          .from("quotes")
          .update({ pdf_url: publicUrl, html_content: editableHtml })
          .eq("id", quote_id);

        // Return BOTH variants so authenticated CRM callers can preview
        // the editable HTML directly (for the internal seller preview,
        // which needs the WYSIWYG editor) without having to fetch the
        // sanitized public artifact via pdf_url. The pdf_url stays as
        // the customer-safe link, html_content as the editor source.
        // Customer-facing UIs MUST NOT consume the html_content field —
        // it intentionally carries the real write_token. The CRM is the
        // only authenticated caller of this endpoint today.
        return new Response(
          JSON.stringify({
            pdf_url: publicUrl,
            html_content: editableHtml,
          }),
          {
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders,
            },
          },
        );
      } catch (error) {
        console.error("generate_quote_pdf error:", error);
        return createErrorResponse(
          500,
          `Failed to generate PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
  }),
);

// ================================================================
// PREMIUM TEMPLATE — 12-section design
// ================================================================

interface PremiumTemplateData {
  quote: Record<string, unknown>;
  /** Normalized sections — all Kat. A + B copy keys guaranteed present after normalizePremiumSections(). */
  sections: Record<string, unknown>;
  quoteText: string;
  company: Record<string, unknown> | null;
  contact: Record<string, unknown> | null;
  contactName: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unit_price: number;
  }>;
  seller: Record<string, string | boolean>;
  logoLight: string;
  logoDark: string;
  accentColor: string;
  quoteNumber: string;
  quoteDate: string;
  validUntil: string | null;
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  afterDiscount: number;
  vatRate: number;
  vatAmount: number;
  totalInclVat: number;
  cur: string;
  writeToken: string;
  supabaseUrl: string;
}

function buildPremiumTemplate(d: PremiumTemplateData): string {
  const sellerName = (d.seller.companyName as string) || "";
  const sellerOrgNumber = (d.seller.orgNumber as string) || "";

  const pageHeader: PageHeaderData = {
    logoDarkUrl: d.logoDark,
    quoteNumber: d.quoteNumber,
    quoteDate: d.quoteDate,
  };

  // 1. Hero
  const heroData: HeroData = {
    logoUrl: d.logoLight,
    quoteNumber: d.quoteNumber,
    title: (d.quote.title as string) || "",
    companyName: (d.company?.name as string) || "",
    contactName: d.contactName,
    companyAddress: (d.company?.address as string) || "",
    companyCityZip: [d.company?.zipcode, d.company?.city]
      .filter(Boolean)
      .join(" "),
    quoteDate: d.quoteDate,
    validUntil: d.validUntil,
    totalInclVat: d.totalInclVat,
    vatAmount: d.vatAmount,
    currency: d.cur,
    sellerName,
    sellerOrgNumber,
    sellerContact: [d.seller.email, d.seller.phone, d.seller.website]
      .filter(Boolean)
      .join(" \u00b7 "),
  };

  // 2. Summary — highlight_cards default guaranteed by normalizePremiumSections().
  const summaryData: SummaryData = {
    pitch: d.sections.summary_pitch || d.quoteText.substring(0, 300),
    cards: d.sections.highlight_cards as SummaryData["cards"],
  };

  // 2b. Problem section ("Varför en hemsida?")
  // Defaults guaranteed by normalizePremiumSections() — cast only.
  const problemCards = d.sections.problem_cards as ProblemCard[];

  const companySector = (d.company?.sector as string) || "";
  const problemTitleDefault = companySector
    ? `Kunder söker ${companySector.toLowerCase()} online — hittar de er?`
    : "Kunder söker online — hittar de er?";
  const problemSectionTitle =
    (d.sections.problem_section_title as string | undefined) ??
    problemTitleDefault;

  // 2c. Package includes — defaults guaranteed by normalizePremiumSections().
  const packageIncludes = d.sections.package_includes as string[];

  // 2d. Upgrade package — normalizePremiumSections() sets default when absent;
  // preserves explicit null (= hide upsell for multi-page quotes).
  const upgradePackage = d.sections.upgrade_package as UpgradePackage | null;

  // 3. Reference projects — sections.reference_projects takes priority over reference_images
  const referenceImages =
    (d.quote.reference_images as ReferenceProject[]) || [];
  const references = d.sections.reference_projects
    ? (d.sections.reference_projects as ReferenceProject[])
    : resolveReferenceProjects(referenceImages, DEFAULT_REFERENCES);
  const referenceSectionTitle =
    (d.sections.reference_section_title as string | undefined) ??
    "Hemsidor vi har byggt";
  const referenceSectionText =
    (d.sections.reference_section_text as string | undefined) ??
    "Här är ett urval av webbplatser vi levererat — både ensidiga och flersidiga lösningar för företag i liknande branscher.";

  // 5. Process steps — defaults guaranteed by normalizePremiumSections().
  const processSteps = d.sections.process_steps as ProcessStep[];

  // 5b. Support cards — defaults guaranteed by normalizePremiumSections().
  const supportCards = d.sections.support_cards as SupportCard[];

  // 6. Tech items — defaults guaranteed by normalizePremiumSections().
  const techItems = d.sections.tech_items as TechItem[];

  // 7. Founders — defaults guaranteed by normalizePremiumSections().
  const founders = d.sections.founders as FounderCard[];

  // Section titles/texts — all guaranteed present after normalizePremiumSections().
  const processSectionTitle = d.sections.process_section_title as string;
  const processSectionText = d.sections.process_section_text as string;
  const supportSectionTitle = d.sections.support_section_title as string;
  const techSectionTitle = d.sections.tech_section_title as string;
  const aboutSectionTitle = d.sections.about_section_title as string;
  const aboutSectionText = d.sections.about_section_text as string;
  const packageSectionTitle = d.sections.package_section_title as string;
  const packageSectionText = d.sections.package_section_text as string;
  const priceSummaryBullets = d.sections.price_summary_bullets as
    | string[]
    | undefined;

  // Kat. B copy keys — guaranteed present after normalizePremiumSections().
  const upgradeBenefitsTitle = d.sections.upgrade_benefits_title as string;
  const referenceCTALabel = d.sections.reference_cta_label as string;
  const aboutFacts = d.sections.about_facts as Array<{
    value: string;
    label: string;
  }>;
  const priceSummaryTitle = d.sections.price_summary_title as string;
  const termsSectionTitle = d.sections.terms_section_title as string;

  // 8. Pricing
  const pricingData: PricingData = {
    lineItems: d.lineItems,
    subtotal: d.subtotal,
    discountPct: d.discountPct,
    discountAmount: d.discountAmount,
    afterDiscount: d.afterDiscount,
    vatRate: d.vatRate,
    vatAmount: d.vatAmount,
    totalInclVat: d.totalInclVat,
    currency: d.cur,
    paymentTerms: (d.quote.payment_terms as string) || "",
    deliveryTerms: (d.quote.delivery_terms as string) || "",
    validUntil: d.validUntil,
    recurringAmount:
      (d.sections.recurring_amount as number | null | undefined) ?? null,
    recurringInterval:
      (d.sections.recurring_interval as
        | "monthly"
        | "quarterly"
        | "yearly"
        | null
        | undefined) ?? null,
  };

  // 9. Terms & Signature
  const termsData: TermsData = {
    termsAndConditions: (d.quote.terms_and_conditions as string) || "",
    customerReference: (d.quote.customer_reference as string) || "",
  };

  const sigData: SignatureData = {
    sellerName: sellerName || "säljaren",
    buyerName: (d.company?.name as string) || "köparen",
    contactName: d.contactName,
  };

  const sellerInfo: SellerInfo = {
    companyName: sellerName,
    orgNumber: sellerOrgNumber,
    vatNumber: (d.seller.vatNumber as string) || "",
    fSkatt: !!d.seller.fSkatt,
    address: (d.seller.address as string) || "",
    zipCity: [d.seller.zipcode, d.seller.city].filter(Boolean).join(" "),
    phone: (d.seller.phone as string) || "",
    email: (d.seller.email as string) || "",
    website: (d.seller.website as string) || "",
    bankgiro: (d.seller.bankgiro as string) || "",
    plusgiro: (d.seller.plusgiro as string) || "",
    iban: (d.seller.iban as string) || "",
    bic: (d.seller.bic as string) || "",
  };

  // Page numbers (kept for function signatures, not displayed in VPM template)
  const pn = 0;

  const quoteId = String((d.quote as Record<string, unknown>).id ?? "");
  const writeToken = esc(d.writeToken ?? "");
  const supabaseUrl = esc(d.supabaseUrl ?? "");

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc((d.quote.title as string) || "Offert")} — Offert | ${esc((d.company?.name as string) || "")}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <style>${buildStylesheet({ accentColor: d.accentColor })}</style>
</head>
<body>

${buildHeroSection(heroData)}
${buildSummarySection(summaryData, pageHeader)}
${buildProblemSection(problemCards, problemSectionTitle, pageHeader, pn)}
${buildReferenceSection(references, pageHeader, pn, referenceSectionTitle, referenceSectionText, referenceCTALabel)}
${buildPackageSection(packageIncludes, (d.quote.title as string) || "Webbprojekt", `${fmt(d.afterDiscount)} ${esc(d.cur)}`, pageHeader, pn, upgradePackage, packageSectionTitle, packageSectionText, upgradeBenefitsTitle)}
${buildProcessSection(processSteps, pageHeader, pn, processSectionTitle, processSectionText)}
${buildSupportSection(supportCards, pageHeader, pn, supportSectionTitle)}
${buildTechSection(techItems, pageHeader, pn, techSectionTitle)}
${buildAboutSection(founders, pageHeader, pn, aboutSectionTitle, aboutSectionText, aboutFacts)}
${buildPriceSummarySection(pricingData, pageHeader, pn, priceSummaryBullets, priceSummaryTitle)}
${buildTermsAndSignatureSection(termsData, sigData, sellerInfo, pageHeader, pn, termsSectionTitle)}
${buildDocumentFooter(sellerName, d.quoteNumber, sellerInfo, d.logoDark)}

<script>
window.QUOTE_SUPABASE_URL="${supabaseUrl}";
window.QUOTE_ID="${quoteId}";
window.QUOTE_WRITE_TOKEN="${writeToken}";
${buildScript()}
${buildEditorScript()}
</script>
</body>
</html>`;
}

// ================================================================
// LEGACY TEMPLATE — Original 4-page layout (backwards compatibility)
// ================================================================

interface LegacyTemplateData {
  quote: Record<string, unknown>;
  quoteText: string;
  company: Record<string, unknown> | null;
  contactName: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unit_price: number;
  }>;
  seller: Record<string, string | boolean>;
  logoLight: string;
  logoDark: string;
  quoteNumber: string;
  quoteDate: string;
  validUntil: string | null;
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  afterDiscount: number;
  vatRate: number;
  vatAmount: number;
  totalInclVat: number;
  cur: string;
}

function buildLegacyTemplate(d: LegacyTemplateData): string {
  const sellerName = (d.seller.companyName as string) || "";

  // The legacy template is a simplified version using the same CSS
  // but only rendering: Cover, Proposal text, Pricing, Terms+Signature
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <title>Offert ${esc(d.quoteNumber)} — ${esc(sellerName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',-apple-system,sans-serif;color:#1a1a1a;line-height:1.6;background:#d4d4d4;font-size:13px;-webkit-font-smoothing:antialiased}
    .page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;position:relative;overflow:hidden}
    .page+.page{margin-top:2mm}
    @media print{body{background:#fff}.page{width:100%;min-height:auto;margin:0;page-break-after:always}.page:last-child{page-break-after:avoid}}
    @page{size:A4;margin:0}
    .cover{min-height:297mm;background:#0a0a0a;color:#fff;display:flex;flex-direction:column;position:relative}
    .cover::before{content:'';position:absolute;top:0;right:0;width:45%;height:100%;background:linear-gradient(160deg,#141414,#0a0a0a);clip-path:polygon(30% 0,100% 0,100% 100%,0% 100%);z-index:0}
    .cover>*{position:relative;z-index:1}
    .cover-top{padding:15mm 18mm;display:flex;justify-content:space-between;align-items:flex-start}
    .cover-logo{height:22px;object-fit:contain}
    .cover-badge{font-size:9px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#525252;border:1px solid #333;padding:6px 14px}
    .cover-body{flex:1;padding:0 18mm;display:flex;flex-direction:column;justify-content:center}
    .cover-label{font-size:11px;font-weight:600;letter-spacing:5px;text-transform:uppercase;color:#525252;margin-bottom:8mm}
    .cover-title{font-size:48px;font-weight:900;line-height:1.05;letter-spacing:-1.5px;color:#fff;margin-bottom:6mm;max-width:70%}
    .cover-line{width:60px;height:3px;background:#2563eb;margin-bottom:10mm}
    .cover-recipient{font-size:15px;color:#a3a3a3;line-height:2;max-width:60%}
    .cover-recipient strong{color:#fff;font-weight:600}
    .cover-bottom{padding:0 18mm 15mm;display:grid;grid-template-columns:1fr 1fr 1.2fr}
    .cover-stat{padding:10mm 0;border-top:1px solid #262626}
    .cover-stat:not(:first-child){padding-left:8mm}
    .cover-stat-label{font-size:9px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#525252;margin-bottom:4px}
    .cover-stat-value{font-size:15px;font-weight:600;color:#fff}
    .cover-stat-value--big{font-size:26px;font-weight:800;color:#2563eb;letter-spacing:-0.5px}
    .cover-stat-sub{font-size:10px;color:#525252;margin-top:2px}
    .cover-footer{padding:6mm 18mm;border-top:1px solid #1a1a1a;display:flex;justify-content:space-between;font-size:9px;color:#404040}
    .content{padding:18mm 18mm 28mm}
    .header{display:flex;justify-content:space-between;align-items:center;padding-bottom:5mm;margin-bottom:10mm;border-bottom:1px solid #e5e5e5}
    .header-logo{height:18px;object-fit:contain}
    .header-ref{font-size:10px;color:#a3a3a3;text-align:right;line-height:1.5}
    .section-title{font-size:28px;font-weight:800;color:#0a0a0a;letter-spacing:-0.5px;margin-bottom:3mm}
    .section-accent{width:40px;height:3px;background:#2563eb;margin-bottom:8mm}
    .proposal p{font-size:13px;line-height:1.9;color:#404040;margin-bottom:5mm}
    .price-table{width:100%;border-collapse:collapse;margin-bottom:8mm}
    .price-table thead{background:#fafafa}
    .price-table th{text-align:left;padding:10px 12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#737373;border-bottom:2px solid #0a0a0a}
    .price-table th:nth-child(2){text-align:center}
    .price-table th:nth-child(3),.price-table th:last-child{text-align:right}
    .price-table td{padding:12px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #f0f0f0}
    .price-table tr:last-child td{border-bottom:2px solid #e5e5e5}
    .col-desc{font-weight:500}.col-center{text-align:center;color:#737373}.col-right{text-align:right;font-variant-numeric:tabular-nums}
    .totals{width:50%;margin-left:auto;margin-bottom:8mm}
    .totals-row{display:flex;justify-content:space-between;padding:8px 0;font-size:13px;color:#525252;border-bottom:1px solid #f5f5f5}
    .totals-row:last-child{border-bottom:none}
    .totals-row.discount{color:#dc2626}
    .totals-row.total{border-top:2px solid #0a0a0a;border-bottom:none;padding-top:10px;margin-top:4px;font-size:17px;font-weight:800;color:#0a0a0a}
    .totals-label{font-weight:500}.totals-value{font-variant-numeric:tabular-nums;font-weight:600}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-bottom:6mm}
    .info-box{padding:4mm 5mm;background:#fafafa;border-left:3px solid #e5e5e5}
    .info-box-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a3a3a3;margin-bottom:2px}
    .info-box-value{font-size:14px;font-weight:600;color:#0a0a0a}
    .validity{font-size:12px;color:#525252;padding:8px 0;border-top:1px solid #e5e5e5;margin-top:6mm}
    .validity strong{color:#0a0a0a}
    .terms{font-size:12px;line-height:1.8;color:#525252;white-space:pre-wrap;margin-bottom:8mm}
    .company-info{margin-top:10mm;padding-top:8mm;border-top:2px solid #0a0a0a}
    .company-info-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#a3a3a3;margin-bottom:6mm}
    .company-cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8mm}
    .company-col-heading{font-size:10px;font-weight:700;color:#0a0a0a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid #e5e5e5}
    .company-col-line{font-size:11px;line-height:1.8;color:#404040}
    .page-foot{position:absolute;bottom:8mm;left:18mm;right:18mm;display:flex;justify-content:space-between;align-items:center;font-size:8px;color:#a3a3a3;border-top:1px solid #e5e5e5;padding-top:3mm}
    .sig-block{margin-top:12mm;display:grid;grid-template-columns:1fr 1fr;gap:12mm}
    .sig-area{border-top:1px solid #d4d4d4;padding-top:4mm}
    .sig-label{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#a3a3a3}
    .sig-name{font-size:13px;font-weight:600;color:#0a0a0a;margin-top:2mm}
    .sig-role{font-size:11px;color:#737373}
  </style>
</head>
<body>

<div class="page cover">
  <div class="cover-top">
    <img src="${d.logoLight}" class="cover-logo" alt="${esc(sellerName)}">
    <div class="cover-badge">Offert ${esc(d.quoteNumber)}</div>
  </div>
  <div class="cover-body">
    <div class="cover-label">Offert</div>
    <div class="cover-title">${esc((d.quote.title as string) || "")}</div>
    <div class="cover-line"></div>
    <div class="cover-recipient">
      <strong>${esc((d.company?.name as string) || "")}</strong><br>
      ${d.contactName ? `${esc(d.contactName)}<br>` : ""}
      ${d.company?.address ? `${esc(d.company.address as string)}<br>` : ""}
      ${d.company?.zipcode || d.company?.city ? esc([d.company?.zipcode, d.company?.city].filter(Boolean).join(" ")) : ""}
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-stat"><div class="cover-stat-label">Datum</div><div class="cover-stat-value">${d.quoteDate}</div></div>
    <div class="cover-stat"><div class="cover-stat-label">Giltig till</div><div class="cover-stat-value">${d.validUntil || "Tillsvidare"}</div></div>
    <div class="cover-stat"><div class="cover-stat-label">Totalbelopp inkl. moms</div><div class="cover-stat-value cover-stat-value--big">${fmt(d.totalInclVat)} ${d.cur}</div><div class="cover-stat-sub">Varav moms ${fmt(d.vatAmount)} ${d.cur}</div></div>
  </div>
  <div class="cover-footer">
    <span>${esc(sellerName)}${d.seller.orgNumber ? ` \u00b7 Org.nr ${esc(d.seller.orgNumber as string)}` : ""}</span>
    <span>${[d.seller.email, d.seller.phone, d.seller.website]
      .filter(Boolean)
      .map((s) => esc(s as string))
      .join(" \u00b7 ")}</span>
  </div>
</div>

${
  d.quoteText
    ? `
<div class="page">
  <div class="content">
    <div class="header"><img src="${d.logoDark}" class="header-logo" alt=""><div class="header-ref">Offert ${esc(d.quoteNumber)}<br>${d.quoteDate}</div></div>
    <div class="section-title">Projektbeskrivning</div>
    <div class="section-accent"></div>
    <div class="proposal">${textToHtml(d.quoteText)}</div>
    <div class="page-foot"><span>${esc(sellerName)}</span><span>Offert ${esc(d.quoteNumber)} &mdash; Sida 2</span></div>
  </div>
</div>`
    : ""
}

<div class="page">
  <div class="content">
    <div class="header"><img src="${d.logoDark}" class="header-logo" alt=""><div class="header-ref">Offert ${esc(d.quoteNumber)}<br>${d.quoteDate}</div></div>
    <div class="section-title">Prisspecifikation</div>
    <div class="section-accent"></div>
    ${
      d.lineItems.length > 0
        ? `
    <table class="price-table"><thead><tr><th>Beskrivning</th><th>Antal</th><th>Styckpris</th><th>Summa</th></tr></thead><tbody>
    ${d.lineItems.map((item) => `<tr><td class="col-desc">${esc(item.description)}</td><td class="col-center">${item.quantity}</td><td class="col-right">${fmt(item.unit_price)} ${d.cur}</td><td class="col-right">${fmt(item.quantity * item.unit_price)} ${d.cur}</td></tr>`).join("")}
    </tbody></table>
    <div class="totals">
      <div class="totals-row"><span class="totals-label">Netto</span><span class="totals-value">${fmt(d.subtotal)} ${d.cur}</span></div>
      ${d.discountPct > 0 ? `<div class="totals-row discount"><span class="totals-label">Rabatt (${d.discountPct}%)</span><span class="totals-value">\u2212${fmt(d.discountAmount)} ${d.cur}</span></div><div class="totals-row"><span class="totals-label">Summa efter rabatt</span><span class="totals-value">${fmt(d.afterDiscount)} ${d.cur}</span></div>` : ""}
      <div class="totals-row"><span class="totals-label">Moms (${d.vatRate}%)</span><span class="totals-value">${fmt(d.vatAmount)} ${d.cur}</span></div>
      <div class="totals-row total"><span>Att betala</span><span>${fmt(d.totalInclVat)} ${d.cur}</span></div>
    </div>`
        : `<div style="margin-top:6mm"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a3a3a3;margin-bottom:3px">Totalbelopp</div><div style="font-size:28px;font-weight:800;color:#0a0a0a;letter-spacing:-0.5px">${fmt(d.totalInclVat)} ${d.cur}</div></div>`
    }
    ${d.quote.payment_terms || d.quote.delivery_terms ? `<div class="info-grid">${d.quote.payment_terms ? `<div class="info-box"><div class="info-box-label">Betalningsvillkor</div><div class="info-box-value">${esc(d.quote.payment_terms as string)}</div></div>` : ""}${d.quote.delivery_terms ? `<div class="info-box"><div class="info-box-label">Leveransvillkor</div><div class="info-box-value">${esc(d.quote.delivery_terms as string)}</div></div>` : ""}</div>` : ""}
    ${d.validUntil ? `<div class="validity">Denna offert \u00e4r giltig till och med <strong>${d.validUntil}</strong>.</div>` : ""}
    <div class="page-foot"><span>${esc(sellerName)}</span><span>Offert ${esc(d.quoteNumber)} &mdash; Sida ${d.quoteText ? "3" : "2"}</span></div>
  </div>
</div>

<div class="page">
  <div class="content">
    <div class="header"><img src="${d.logoDark}" class="header-logo" alt=""><div class="header-ref">Offert ${esc(d.quoteNumber)}<br>${d.quoteDate}</div></div>
    <div class="section-title">Villkor &amp; information</div>
    <div class="section-accent"></div>
    ${d.quote.terms_and_conditions ? `<div class="terms">${esc(d.quote.terms_and_conditions as string)}</div>` : ""}
    ${d.quote.customer_reference ? `<div style="margin-bottom:8mm"><div class="info-box" style="display:inline-block"><div class="info-box-label">Er referens</div><div class="info-box-value">${esc(d.quote.customer_reference as string)}</div></div></div>` : ""}
    <div class="sig-block">
      <div class="sig-area"><div class="sig-label">F\u00f6r ${esc(sellerName || "s\u00e4ljaren")}</div><div style="height:20mm"></div><div class="sig-name">&nbsp;</div><div class="sig-role">Datum / Underskrift</div></div>
      <div class="sig-area"><div class="sig-label">F\u00f6r ${esc((d.company?.name as string) || "k\u00f6paren")}</div><div style="height:20mm"></div><div class="sig-name">${d.contactName ? esc(d.contactName) : "&nbsp;"}</div><div class="sig-role">Datum / Underskrift</div></div>
    </div>
    <div class="company-info">
      <div class="company-info-title">Avs\u00e4ndare</div>
      <div class="company-cols">
        <div>
          <div class="company-col-heading">F\u00f6retag</div>
          ${d.seller.companyName ? `<div class="company-col-line"><strong>${esc(d.seller.companyName as string)}</strong></div>` : ""}
          ${d.seller.orgNumber ? `<div class="company-col-line">Org.nr: ${esc(d.seller.orgNumber as string)}</div>` : ""}
          ${d.seller.vatNumber ? `<div class="company-col-line">Momsreg: ${esc(d.seller.vatNumber as string)}</div>` : ""}
          ${d.seller.fSkatt ? `<div class="company-col-line">Innehar F-skattsedel</div>` : ""}
          ${d.seller.address ? `<div class="company-col-line" style="margin-top:3px">${esc(d.seller.address as string)}</div>` : ""}
          ${d.seller.zipcode || d.seller.city ? `<div class="company-col-line">${esc([d.seller.zipcode, d.seller.city].filter(Boolean).join(" "))}</div>` : ""}
        </div>
        <div>
          <div class="company-col-heading">Kontakt</div>
          ${d.seller.phone ? `<div class="company-col-line">Tel: ${esc(d.seller.phone as string)}</div>` : ""}
          ${d.seller.email ? `<div class="company-col-line">${esc(d.seller.email as string)}</div>` : ""}
          ${d.seller.website ? `<div class="company-col-line">${esc(d.seller.website as string)}</div>` : ""}
        </div>
        <div>
          <div class="company-col-heading">Bankuppgifter</div>
          ${d.seller.bankgiro ? `<div class="company-col-line">Bankgiro: ${esc(d.seller.bankgiro as string)}</div>` : ""}
          ${d.seller.plusgiro ? `<div class="company-col-line">Plusgiro: ${esc(d.seller.plusgiro as string)}</div>` : ""}
          ${d.seller.iban ? `<div class="company-col-line">IBAN: ${esc(d.seller.iban as string)}</div>` : ""}
          ${d.seller.bic ? `<div class="company-col-line">BIC: ${esc(d.seller.bic as string)}</div>` : ""}
        </div>
      </div>
    </div>
    <div class="page-foot"><span>${esc(sellerName)}</span><span>Offert ${esc(d.quoteNumber)} &mdash; Sida ${d.quoteText ? "4" : "3"}</span></div>
  </div>
</div>

</body>
</html>`;
}
