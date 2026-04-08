/**
 * Premium Quote Design System — CSS stylesheet generator.
 * Produces a complete <style> block for the premium proposal template.
 * Based on the VPM Energi template design.
 */

export interface StyleOptions {
  accentColor?: string;
  headingFont?: string;
  bodyFont?: string;
}

/** Convert hex color to rgba with alpha */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function buildStylesheet(options: StyleOptions = {}): string {
  const accent = options.accentColor || "#0a0a0a";
  const heading = options.headingFont || "Manrope";
  const body = options.bodyFont || "Karla";

  return `
    @import url('https://fonts.googleapis.com/css2?family=${heading.replace(/ /g, "+")}:wght@400;500;600;700;800;900&family=${body.replace(/ /g, "+")}:wght@300;400;500;600;700&display=swap');

    :root {
      --color-bg: #ffffff;
      --color-bg-alt: #f6f6f6;
      --color-bg-dark: #0a0a0a;
      --color-bg-elevated: #111111;
      --color-text: #0a0a0a;
      --color-text-muted: #6e6e6e;
      --color-text-light: #ffffff;
      --color-text-light-muted: rgba(255,255,255,0.55);
      --color-border: #e3e3e3;
      --color-border-light: rgba(255,255,255,0.1);
      --color-accent: ${accent};
      --color-accent-soft: rgba(10,10,10,0.06);
      --font-display: '${heading}', sans-serif;
      --font-body: '${body}', sans-serif;
      --max-width: 1060px;
      --radius: 14px;
      --radius-sm: 8px;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html { scroll-behavior: smooth; }

    body {
      font-family: var(--font-body);
      color: var(--color-text);
      background: var(--color-bg);
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    ::selection { background: var(--color-bg-dark); color: var(--color-text-light); }

    /* ═══════════════════════════════════════
       HERO
    ═══════════════════════════════════════ */
    .hero {
      background: var(--color-bg-dark);
      color: var(--color-text-light);
      padding: clamp(70px, 10vw, 140px) clamp(24px, 5vw, 80px) clamp(60px, 8vw, 100px);
      position: relative;
      overflow: hidden;
    }
    .hero-grid-bg {
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 60px 60px;
      pointer-events: none;
    }
    .hero-glow {
      position: absolute;
      top: -30%;
      right: -10%;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%);
      pointer-events: none;
    }
    .hero-inner {
      max-width: var(--max-width);
      margin: 0 auto;
      position: relative;
      z-index: 1;
    }
    .hero-logo {
      height: 28px;
      width: auto;
      margin-bottom: 32px;
      opacity: 0.85;
    }
    .hero-label {
      font-family: var(--font-display);
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.4);
      margin-bottom: 28px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .hero-label::before {
      content: '';
      width: 24px;
      height: 1px;
      background: rgba(255,255,255,0.25);
    }
    .hero h1 {
      font-family: var(--font-display);
      font-size: clamp(2.2rem, 5vw, 3.8rem);
      font-weight: 800;
      line-height: 1.08;
      margin-bottom: 18px;
      letter-spacing: -0.02em;
    }
    .hero-subtitle {
      font-size: 1.1rem;
      color: rgba(255,255,255,0.55);
      max-width: 540px;
      margin-bottom: 56px;
      line-height: 1.7;
    }
    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 40px;
      padding-top: 32px;
      border-top: 1px solid rgba(255,255,255,0.08);
    }
    .hero-meta-label {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-weight: 600;
      color: rgba(255,255,255,0.3);
      margin-bottom: 5px;
    }
    .hero-meta-value {
      color: rgba(255,255,255,0.8);
      font-weight: 500;
      font-size: 0.92rem;
    }

    /* ═══════════════════════════════════════
       SHARED SECTION
    ═══════════════════════════════════════ */
    .section {
      padding: clamp(60px, 8vw, 110px) clamp(24px, 5vw, 80px);
    }
    .section-inner {
      max-width: var(--max-width);
      margin: 0 auto;
    }
    .section-label {
      font-family: var(--font-body);
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-text-muted);
      margin-bottom: 12px;
    }
    .section-title {
      font-family: var(--font-display);
      font-size: clamp(1.7rem, 3.2vw, 2.5rem);
      font-weight: 800;
      line-height: 1.12;
      letter-spacing: -0.02em;
      margin-bottom: 14px;
    }
    .section-text {
      font-size: 1.02rem;
      color: var(--color-text-muted);
      max-width: 560px;
      line-height: 1.75;
    }

    /* ═══════════════════════════════════════
       SUMMARY CARDS
    ═══════════════════════════════════════ */
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin-top: 48px;
    }
    .summary-card {
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 30px 26px;
      transition: transform 0.35s cubic-bezier(.22,1,.36,1), box-shadow 0.35s ease;
    }
    .summary-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 16px 48px rgba(0,0,0,0.07);
    }
    .summary-card-icon {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      background: var(--color-bg-dark);
      color: var(--color-text-light);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      margin-bottom: 18px;
    }
    .summary-card h3 {
      font-family: var(--font-display);
      font-size: 1.02rem;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .summary-card p {
      font-size: 0.88rem;
      color: var(--color-text-muted);
      line-height: 1.6;
    }

    /* ═══════════════════════════════════════
       DEMO SECTION
    ═══════════════════════════════════════ */
    .demo { background: var(--color-bg-alt); }
    .demo-preview {
      margin-top: 48px;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .demo-browser-bar {
      height: 38px;
      background: var(--color-bg-alt);
      border-bottom: 1px solid var(--color-border);
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 7px;
    }
    .demo-dot {
      width: 9px; height: 9px; border-radius: 50%;
    }
    .demo-dot:nth-child(1) { background: #ff5f57; }
    .demo-dot:nth-child(2) { background: #ffbd2e; }
    .demo-dot:nth-child(3) { background: #28c840; }
    .demo-url-bar {
      margin-left: 16px;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      padding: 3px 14px;
      font-size: 0.7rem;
      color: var(--color-text-muted);
      flex: 1;
      max-width: 280px;
    }
    .demo-body { padding: 0; }

    /* Mockup hero */
    .mock-hero {
      background: var(--color-bg-dark);
      color: white;
      padding: 0;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .mock-hero-img {
      width: 100%;
      height: 200px;
      object-fit: cover;
      display: block;
      filter: brightness(0.45);
    }
    .mock-hero-img-placeholder {
      width: 100%;
      height: 200px;
      background: linear-gradient(135deg, #1a1a1a 0%, #333 50%, #1a1a1a 100%);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .mock-hero-overlay {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 200px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      z-index: 2;
    }
    .mock-hero-content {
      padding: 28px 36px 36px;
      position: relative;
    }
    .mock-hero-badge {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: rgba(255,255,255,0.4);
      margin-bottom: 16px;
    }
    .mock-hero h4 {
      font-family: var(--font-display);
      font-size: 1.6rem;
      font-weight: 800;
      margin-bottom: 10px;
      letter-spacing: -0.01em;
    }
    .mock-hero p {
      font-size: 0.85rem;
      color: rgba(255,255,255,0.5);
      margin-bottom: 24px;
      max-width: 380px;
      margin-left: auto;
      margin-right: auto;
    }
    .mock-btn {
      display: inline-block;
      background: white;
      color: var(--color-bg-dark);
      padding: 10px 24px;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 700;
      font-family: var(--font-display);
      cursor: default;
    }

    /* Mockup content sections */
    .mock-content { padding: 36px; }
    .mock-services {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    @media (max-width: 600px) { .mock-services { grid-template-columns: 1fr; } }
    .mock-service {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: 20px 16px;
      text-align: center;
    }
    .mock-service-icon { font-size: 1.6rem; margin-bottom: 10px; }
    .mock-service h5 {
      font-family: var(--font-display);
      font-size: 0.85rem;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .mock-service p { font-size: 0.72rem; color: var(--color-text-muted); }

    .mock-about {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      align-items: center;
      padding: 24px;
      background: var(--color-bg-alt);
      border-radius: var(--radius-sm);
      margin-bottom: 32px;
    }
    @media (max-width: 600px) { .mock-about { grid-template-columns: 1fr; } }
    .mock-about-img {
      background: linear-gradient(135deg, #ddd, #bbb);
      height: 120px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .mock-about-text h5 {
      font-family: var(--font-display);
      font-size: 0.92rem;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .mock-about-text p { font-size: 0.78rem; color: var(--color-text-muted); line-height: 1.6; }

    .mock-contact {
      text-align: center;
      padding: 28px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
    }
    .mock-contact h5 {
      font-family: var(--font-display);
      font-size: 0.92rem;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .mock-input-row { display: flex; gap: 8px; margin-bottom: 8px; }
    @media (max-width: 500px) { .mock-input-row { flex-direction: column; } }
    .mock-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      font-size: 0.78rem;
      color: var(--color-text-muted);
      background: var(--color-bg-alt);
      font-family: var(--font-body);
    }
    .mock-submit {
      background: var(--color-bg-dark);
      color: white;
      border: none;
      padding: 9px 24px;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: default;
      margin-top: 4px;
    }

    .demo-note {
      text-align: center;
      font-size: 0.78rem;
      color: var(--color-text-muted);
      font-style: italic;
      margin-top: 28px;
    }

    /* ═══════════════════════════════════════
       WHAT YOU GET — INCLUDED/UPGRADE
    ═══════════════════════════════════════ */
    .includes-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 48px;
    }
    @media (max-width: 700px) { .includes-grid { grid-template-columns: 1fr; } }
    .includes-box {
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 36px 30px;
      position: relative;
    }
    .includes-box.primary {
      border-color: var(--color-bg-dark);
      border-width: 2px;
    }
    .includes-box.upgrade {
      background: var(--color-bg-alt);
    }
    .includes-badge {
      position: absolute;
      top: -11px;
      left: 24px;
      background: var(--color-bg-dark);
      color: var(--color-text-light);
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 3px 14px;
      border-radius: 100px;
    }
    .includes-badge.upgrade-badge {
      background: var(--color-bg-alt);
      color: var(--color-text);
      border: 1px solid var(--color-border);
    }
    .includes-box h3 {
      font-family: var(--font-display);
      font-size: 1.15rem;
      font-weight: 800;
      margin-bottom: 4px;
      margin-top: 8px;
    }
    .includes-price {
      font-family: var(--font-display);
      font-size: 1.8rem;
      font-weight: 800;
      margin-bottom: 4px;
    }
    .includes-price-note {
      font-size: 0.78rem;
      color: var(--color-text-muted);
      margin-bottom: 24px;
    }
    .includes-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .includes-list li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .includes-check {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--color-bg-dark);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.65rem;
      font-weight: 700;
      margin-top: 1px;
    }
    .includes-box.upgrade .includes-check {
      background: var(--color-border);
      color: var(--color-text);
    }
    .upgrade-benefits {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid var(--color-border);
    }
    .upgrade-benefits-title {
      font-family: var(--font-display);
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-muted);
      margin-bottom: 10px;
    }
    .upgrade-benefit {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 0.85rem;
      color: var(--color-text-muted);
      margin-bottom: 6px;
      line-height: 1.5;
    }
    .upgrade-arrow { color: var(--color-text); font-weight: 700; flex-shrink: 0; }

    /* ═══════════════════════════════════════
       REFERENCES
    ═══════════════════════════════════════ */
    .ref-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
      margin-top: 48px;
    }
    @media (max-width: 700px) { .ref-grid { grid-template-columns: 1fr; } }
    .ref-card {
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      overflow: hidden;
      transition: transform 0.35s cubic-bezier(.22,1,.36,1), box-shadow 0.35s ease;
    }
    .ref-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 16px 48px rgba(0,0,0,0.07);
    }
    .ref-card-visual {
      height: 260px;
      position: relative;
      overflow: hidden;
      background: var(--color-bg-alt);
    }
    .ref-card-screenshot {
      width: 100%;
      height: auto;
      object-fit: contain;
      object-position: top center;
      display: block;
      transition: transform 0.5s cubic-bezier(.22,1,.36,1);
    }
    .ref-card:hover .ref-card-screenshot {
      transform: scale(1.03);
    }
    .ref-card-screenshot-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(145deg, #e8e8e8, #d0d0d0);
      color: #999;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .ref-card-info { padding: 20px; }
    .ref-card-type {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted);
      margin-bottom: 6px;
    }
    .ref-card-info h3 {
      font-family: var(--font-display);
      font-size: 1.02rem;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .ref-card-info p {
      font-size: 0.82rem;
      color: var(--color-text-muted);
      line-height: 1.55;
      margin-bottom: 14px;
    }
    .ref-link {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--color-text);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: gap 0.25s ease;
    }
    .ref-link:hover { gap: 9px; }

    /* ═══════════════════════════════════════
       PROCESS
    ═══════════════════════════════════════ */
    .process { background: var(--color-bg-dark); color: var(--color-text-light); }
    .process .section-label { color: rgba(255,255,255,0.3); }
    .process .section-title { color: white; }
    .process .section-text { color: rgba(255,255,255,0.5); }
    .process-steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-top: 52px;
    }
    @media (max-width: 700px) { .process-steps { grid-template-columns: 1fr; } }
    .process-step {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: var(--radius);
      padding: 28px 24px;
      position: relative;
    }
    .step-num {
      font-family: var(--font-display);
      font-size: 2.2rem;
      font-weight: 800;
      color: rgba(255,255,255,0.08);
      margin-bottom: 16px;
      line-height: 1;
    }
    .process-step h3 {
      font-family: var(--font-display);
      font-size: 1.05rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .process-step p {
      font-size: 0.88rem;
      color: rgba(255,255,255,0.5);
      line-height: 1.6;
    }
    .process-cta-box {
      margin-top: 48px;
      padding: 32px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: var(--radius);
      text-align: center;
    }
    .process-cta-box p {
      font-size: 0.95rem;
      color: rgba(255,255,255,0.5);
      margin-bottom: 6px;
    }
    .process-cta-box .cta-highlight {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 1.05rem;
      color: white;
    }

    /* ═══════════════════════════════════════
       PROBLEM STATEMENT
    ═══════════════════════════════════════ */
    .problem-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-top: 44px;
    }
    @media (max-width: 700px) { .problem-grid { grid-template-columns: 1fr; } }
    .problem-card {
      padding: 28px 24px;
      border-left: 2px solid var(--color-bg-dark);
    }
    .problem-number {
      font-family: var(--font-display);
      font-size: 0.72rem;
      font-weight: 800;
      color: var(--color-text-muted);
      margin-bottom: 12px;
    }
    .problem-card h3 {
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .problem-card p {
      font-size: 0.88rem;
      color: var(--color-text-muted);
      line-height: 1.65;
    }

    /* ═══════════════════════════════════════
       TIMELINE
    ═══════════════════════════════════════ */
    .timeline {
      margin-top: 48px;
      position: relative;
      padding-left: 32px;
    }
    .timeline::before {
      content: '';
      position: absolute;
      left: 7px;
      top: 8px;
      bottom: 8px;
      width: 2px;
      background: rgba(255,255,255,0.1);
    }
    .timeline-item {
      display: flex;
      align-items: flex-start;
      gap: 20px;
      margin-bottom: 32px;
      position: relative;
    }
    .timeline-item:last-child { margin-bottom: 0; }
    .timeline-marker {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.25);
      background: var(--color-bg-dark);
      flex-shrink: 0;
      margin-left: -32px;
      margin-top: 4px;
      position: relative;
      z-index: 1;
    }
    .timeline-marker.active {
      border-color: white;
      background: white;
    }
    .timeline-content { flex: 1; }
    .timeline-day {
      font-family: var(--font-display);
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: rgba(255,255,255,0.35);
      margin-bottom: 4px;
    }
    .timeline-content h3 {
      font-family: var(--font-display);
      font-size: 1.02rem;
      font-weight: 700;
      color: white;
      margin-bottom: 6px;
    }
    .timeline-content p {
      font-size: 0.88rem;
      color: rgba(255,255,255,0.5);
      line-height: 1.6;
    }

    /* ═══════════════════════════════════════
       TERMS & SUPPORT
    ═══════════════════════════════════════ */
    .terms-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-top: 44px;
    }
    @media (max-width: 800px) { .terms-grid { grid-template-columns: 1fr; } }
    .terms-card {
      padding: 32px 28px;
      background: var(--color-bg-alt);
      border-radius: var(--radius);
    }
    .terms-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text);
      margin-bottom: 16px;
    }
    .terms-card h3 {
      font-family: var(--font-display);
      font-size: 1.05rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .terms-card p {
      font-size: 0.88rem;
      color: var(--color-text-muted);
      line-height: 1.65;
    }

    /* ═══════════════════════════════════════
       NEXT STEPS
    ═══════════════════════════════════════ */
    .next-steps-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
      text-align: left;
      max-width: 400px;
      margin: 0 auto;
    }
    .next-step-item {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 1rem;
      color: rgba(255,255,255,0.75);
    }
    .next-step-num {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 0.82rem;
      flex-shrink: 0;
      color: white;
    }

    /* ═══════════════════════════════════════
       TECH
    ═══════════════════════════════════════ */
    .tech-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      margin-top: 44px;
    }
    @media (max-width: 700px) { .tech-row { grid-template-columns: repeat(2, 1fr); } }
    .tech-item {
      text-align: center;
      padding: 24px 16px;
      background: var(--color-bg-alt);
      border-radius: var(--radius);
    }
    .tech-item-icon { font-size: 1.5rem; margin-bottom: 12px; }
    .tech-item h4 {
      font-family: var(--font-display);
      font-size: 0.88rem;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .tech-item p { font-size: 0.78rem; color: var(--color-text-muted); }

    /* ═══════════════════════════════════════
       ABOUT AXONA
    ═══════════════════════════════════════ */
    .about-axona { background: var(--color-bg-alt); }
    .about-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px;
      margin-top: 44px;
      align-items: start;
    }
    @media (max-width: 700px) { .about-grid { grid-template-columns: 1fr; gap: 32px; } }
    .about-person { display: flex; gap: 16px; align-items: flex-start; }
    .about-avatar {
      width: 48px; height: 48px; border-radius: 50%;
      background: var(--color-bg-dark);
      color: white;
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 0.85rem;
      flex-shrink: 0;
    }
    .about-person-info h4 {
      font-family: var(--font-display);
      font-size: 0.95rem;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .about-person-info .role {
      font-size: 0.78rem;
      color: var(--color-text-muted);
      margin-bottom: 8px;
    }
    .about-person-info p {
      font-size: 0.85rem;
      color: var(--color-text-muted);
      line-height: 1.6;
    }
    .about-facts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 32px;
    }
    .about-fact {
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: 16px;
    }
    .about-fact-value {
      font-family: var(--font-display);
      font-size: 1.2rem;
      font-weight: 800;
    }
    .about-fact-label { font-size: 0.72rem; color: var(--color-text-muted); margin-top: 2px; }

    /* ═══════════════════════════════════════
       PRICING SUMMARY
    ═══════════════════════════════════════ */
    .pricing-summary {
      max-width: 560px;
      margin: 52px auto 0;
      background: var(--color-bg-dark);
      color: white;
      border-radius: var(--radius);
      padding: clamp(36px, 5vw, 52px);
      position: relative;
      overflow: hidden;
    }
    .pricing-summary::before {
      content: '';
      position: absolute;
      top: -40%;
      right: -20%;
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%);
      pointer-events: none;
    }
    .pricing-summary > * { position: relative; z-index: 1; }
    .pricing-summary-label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-weight: 600;
      color: rgba(255,255,255,0.35);
      margin-bottom: 10px;
    }
    .pricing-summary-amount {
      font-family: var(--font-display);
      font-size: clamp(2rem, 3.5vw, 2.8rem);
      font-weight: 800;
      margin-bottom: 2px;
    }
    .pricing-summary-note {
      font-size: 0.82rem;
      color: rgba(255,255,255,0.4);
      margin-bottom: 28px;
    }
    .pricing-summary-features {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .pricing-summary-features li {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.88rem;
      color: rgba(255,255,255,0.75);
    }
    .ps-check { color: white; font-weight: 700; }
    .pricing-divider {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.08);
      margin: 20px 0;
    }
    .pricing-upgrade-note {
      font-size: 0.82rem;
      color: rgba(255,255,255,0.4);
      line-height: 1.6;
    }

    /* ═══════════════════════════════════════
       FOOTER
    ═══════════════════════════════════════ */
    .offert-footer {
      padding: 36px clamp(24px, 5vw, 80px);
      text-align: center;
      border-top: 1px solid var(--color-border);
    }
    .footer-logo {
      height: 22px;
      width: auto;
      margin-bottom: 10px;
    }
    .footer-brand {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 0.9rem;
      margin-bottom: 6px;
    }
    .footer-diamond { opacity: 0.4; }
    .footer-meta { font-size: 0.72rem; color: var(--color-text-muted); }

    /* ═══════════════════════════════════════
       SIGNING SECTION
    ═══════════════════════════════════════ */
    .signing-intro {
      margin-top: 28px;
      margin-bottom: 48px;
      font-size: 0.95rem;
      color: var(--color-text-muted);
      line-height: 1.7;
    }
    .terms-link {
      color: var(--color-text);
      font-weight: 600;
      text-decoration: none;
      font-size: 0.88rem;
    }
    .terms-link:hover { text-decoration: underline; }
    .signing-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 60px;
    }
    @media (max-width: 600px) { .signing-grid { grid-template-columns: 1fr; gap: 40px; } }
    .signing-for {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted);
      margin-bottom: 40px;
    }
    .signing-line {
      border-bottom: 1px solid var(--color-text);
      margin-bottom: 8px;
    }
    .signing-line.short { width: 50%; margin-top: 32px; }
    .signing-name {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 1rem;
      margin-bottom: 2px;
    }
    .signing-field {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    /* ═══════════════════════════════════════
       FORMAL FOOTER
    ═══════════════════════════════════════ */
    .offert-formal-footer {
      background: var(--color-bg-alt);
      border-top: 1px solid var(--color-border);
      padding: 40px clamp(24px, 5vw, 80px);
    }
    .formal-footer-inner { max-width: var(--max-width); margin: 0 auto; }
    .formal-label {
      font-size: 0.68rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--color-text-muted);
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-top: 1px solid var(--color-border);
      padding-top: 20px;
    }
    .formal-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr 1fr;
      gap: 40px;
    }
    @media (max-width: 600px) { .formal-grid { grid-template-columns: 1fr; gap: 24px; } }
    .formal-col-title {
      font-family: var(--font-display);
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 8px;
    }
    .formal-col p { font-size: 0.82rem; color: var(--color-text-muted); line-height: 1.6; }
    .formal-col p strong { color: var(--color-text); }
    .formal-bottom {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid var(--color-border);
      display: flex;
      gap: 24px;
      font-size: 0.72rem;
      color: var(--color-text-muted);
    }

    /* ═══════════════════════════════════════
       ANIMATIONS
    ═══════════════════════════════════════ */
    .animate-in {
      opacity: 0;
      transform: translateY(28px);
      transition: opacity 0.7s cubic-bezier(.22,1,.36,1), transform 0.7s cubic-bezier(.22,1,.36,1);
    }
    .animate-in.visible {
      opacity: 1;
      transform: translateY(0);
    }
    .stagger-1 { transition-delay: 0.05s; }
    .stagger-2 { transition-delay: 0.1s; }
    .stagger-3 { transition-delay: 0.15s; }
    .stagger-4 { transition-delay: 0.2s; }

    /* ═══════════════════════════════════════
       PRINT
    ═══════════════════════════════════════ */
    @media print {
      .animate-in { opacity: 1 !important; transform: none !important; }
      body { font-size: 10.5pt; }
      .hero { padding: 48px 36px; page-break-after: always; }
      .section { padding: 36px; }
      .hero-grid-bg, .hero-glow, .pricing-summary::before { display: none; }
    }
  `;
}

/** JavaScript for scroll animations */
export function buildScript(): string {
  return `
    document.addEventListener('DOMContentLoaded', () => {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

      document.querySelectorAll('.animate-in').forEach(el => observer.observe(el));
    });
  `;
}
