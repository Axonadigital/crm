/**
 * Mobile layout verification script using Puppeteer.
 *
 * Navigates every key mobile page with an iPhone 14 viewport,
 * takes screenshots, and checks for horizontal overflow.
 *
 * Prerequisites:
 *   sudo apt-get install -y libnspr4 libnss3 libasound2t64
 *
 * Run:
 *   node tests/mobile-layout-check.mjs
 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = "http://localhost:5174";
const VIEWPORT = { width: 390, height: 844 };
const SCREENSHOT_DIR = "tests/screenshots";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

const PAGES = [
  { path: "/", label: "Dashboard" },
  { path: "/contacts", label: "Contacts" },
  { path: "/companies", label: "Companies" },
  { path: "/deals", label: "Deals" },
  { path: "/call-queue", label: "CallQueue" },
  { path: "/quotes", label: "Quotes" },
  { path: "/tasks", label: "Tasks" },
  { path: "/calendar", label: "Calendar" },
  { path: "/settings", label: "Settings" },
];

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let passed = 0;
let failed = 0;
const issues = [];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForApp(page) {
  // Wait for loader to disappear
  try {
    await page.waitForSelector(".loader-container", {
      hidden: true,
      timeout: 15000,
    });
  } catch {
    // loader may already be gone
  }
  await sleep(2500);
}

async function checkOverflow(page, viewportWidth) {
  return page.evaluate((vw) => {
    const found = [];
    for (const el of document.querySelectorAll("*")) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Skip invisible/portal elements
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (
        style.position === "fixed" &&
        style.opacity === "0" &&
        style.pointerEvents === "none"
      )
        continue;

      if (rect.right > vw + 2) {
        const tag = el.tagName.toLowerCase();
        const cls = el.className
          ? `.${String(el.className).split(/\s+/).slice(0, 2).join(".")}`
          : "";
        found.push({
          selector: `${tag}${cls}`,
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          overflow: Math.round(rect.right - vw),
        });
      }
    }
    return found;
  }, viewportWidth);
}

async function checkHorizontalScroll(page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

async function checkNavVisible(page) {
  return page.evaluate(() => {
    const nav = document.querySelector("nav");
    if (!nav) return false;
    const rect = nav.getBoundingClientRect();
    return rect.height > 0 && rect.width > 0;
  });
}

(async () => {
  console.log("🚀 Starting mobile layout check...\n");

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  await page.setUserAgent(IPHONE_UA);

  // ─── Test each page ───
  for (const { path: pagePath, label } of PAGES) {
    process.stdout.write(`  Testing ${label} (${pagePath})... `);
    try {
      await page.goto(`${BASE}${pagePath}`, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });
      await waitForApp(page);

      // Screenshot (viewport)
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/mobile-${label}.png`,
        fullPage: false,
      });
      // Screenshot (full page)
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/mobile-${label}_full.png`,
        fullPage: true,
      });

      // Check horizontal scroll
      const hasScroll = await checkHorizontalScroll(page);
      if (hasScroll) {
        const scrollWidth = await page.evaluate(
          () => document.documentElement.scrollWidth,
        );
        issues.push(
          `${label}: horizontal scroll detected (scrollWidth=${scrollWidth}, viewport=${VIEWPORT.width})`,
        );
        console.log(
          `⚠ OVERFLOW (scrollWidth=${scrollWidth} > ${VIEWPORT.width})`,
        );
        failed++;
        continue;
      }

      // Check element overflow
      const overflows = await checkOverflow(page, VIEWPORT.width);
      if (overflows.length > 0) {
        // Filter minor / non-visual
        const significant = overflows.filter(
          (o) =>
            o.overflow > 5 &&
            !o.selector.includes("portal") &&
            !o.selector.includes("data-radix"),
        );
        if (significant.length > 0) {
          issues.push(
            `${label}: ${significant.length} element(s) overflow viewport`,
          );
          for (const o of significant.slice(0, 5)) {
            issues.push(
              `  → ${o.selector} overflows by ${o.overflow}px (width=${o.width}px)`,
            );
          }
          console.log(`⚠ ${significant.length} element overflow(s)`);
          failed++;
          continue;
        }
      }

      // Check nav visible
      const navVisible = await checkNavVisible(page);
      if (!navVisible) {
        issues.push(`${label}: bottom navigation not visible`);
        console.log("⚠ nav bar not visible");
        failed++;
        continue;
      }

      console.log("✓ OK");
      passed++;
    } catch (err) {
      issues.push(`${label}: ERROR - ${err.message}`);
      console.log(`✗ ERROR: ${err.message}`);
      failed++;
    }
  }

  // ─── Test Create (+) button ───
  process.stdout.write("  Testing Create button menu... ");
  try {
    await page.goto(`${BASE}/`, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await waitForApp(page);

    const createBtn = await page.$('button[aria-label="Create"]');
    if (!createBtn) {
      issues.push("Create button: not found");
      console.log("✗ Create button not found");
      failed++;
    } else {
      await createBtn.click();
      await sleep(500);

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/mobile-CreateMenu.png`,
        fullPage: false,
      });

      const menuItems = await page.$$('[role="menuitem"]');
      if (menuItems.length >= 5) {
        console.log(`✓ OK (${menuItems.length} items)`);
        passed++;
      } else {
        issues.push(
          `Create menu: only ${menuItems.length} items (expected ≥5)`,
        );
        console.log(`⚠ only ${menuItems.length} items`);
        failed++;
      }
    }
  } catch (err) {
    issues.push(`Create button: ERROR - ${err.message}`);
    console.log(`✗ ERROR: ${err.message}`);
    failed++;
  }

  // ─── Test More menu ───
  process.stdout.write("  Testing More menu... ");
  try {
    await page.goto(`${BASE}/`, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await waitForApp(page);

    // Find button with text "Mer"
    const buttons = await page.$$("button");
    let moreBtn = null;
    for (const btn of buttons) {
      const text = await page.evaluate((el) => el.textContent, btn);
      if (text && text.includes("Mer")) {
        moreBtn = btn;
        break;
      }
    }

    if (!moreBtn) {
      issues.push("More menu: 'Mer' button not found");
      console.log("✗ Mer button not found");
      failed++;
    } else {
      await moreBtn.click();
      await sleep(600);

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/mobile-MoreMenu.png`,
        fullPage: false,
      });

      // Check links in the sheet
      const sheetLinks = await page.$$('[data-slot="sheet-content"] a');
      if (sheetLinks.length >= 4) {
        console.log(`✓ OK (${sheetLinks.length} links)`);
        passed++;
      } else {
        // Try alternative selector
        const allSheetLinks = await page.evaluate(() => {
          const sheet = document.querySelector(
            '[role="dialog"], [data-state="open"]',
          );
          if (!sheet) return 0;
          return sheet.querySelectorAll("a").length;
        });
        if (allSheetLinks >= 4) {
          console.log(`✓ OK (${allSheetLinks} links)`);
          passed++;
        } else {
          issues.push(
            `More menu: only ${allSheetLinks} links found (expected ≥4)`,
          );
          console.log(`⚠ only ${allSheetLinks} links`);
          failed++;
        }
      }
    }
  } catch (err) {
    issues.push(`More menu: ERROR - ${err.message}`);
    console.log(`✗ ERROR: ${err.message}`);
    failed++;
  }

  // ─── Summary ───
  console.log("\n" + "═".repeat(50));
  console.log(
    `Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`,
  );

  if (issues.length > 0) {
    console.log("\nIssues found:");
    for (const issue of issues) {
      console.log(`  ⚠ ${issue}`);
    }
  }

  console.log(`\nScreenshots saved to ${SCREENSHOT_DIR}/`);
  console.log("═".repeat(50));

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
