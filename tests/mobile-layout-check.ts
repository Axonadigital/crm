/**
 * Mobile layout verification script.
 *
 * Uses Playwright to open every key mobile page with an iPhone 14
 * viewport, takes a screenshot of each, and checks for horizontal
 * overflow (elements wider than the viewport).
 *
 * Run:  npx playwright test tests/mobile-layout-check.ts --reporter=list
 */
import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:5173";

// iPhone 14 dimensions
const VIEWPORT = { width: 390, height: 844 };

// Pages to test – path + readable label
const PAGES: { path: string; label: string; waitFor?: string }[] = [
  { path: "/", label: "Dashboard" },
  { path: "/contacts", label: "Contacts list" },
  { path: "/companies", label: "Companies list" },
  { path: "/deals", label: "Deals list" },
  { path: "/call-queue", label: "Call Queue (Ringlista)" },
  { path: "/quotes", label: "Quotes list" },
  { path: "/tasks", label: "Tasks list" },
  { path: "/calendar", label: "Calendar" },
  { path: "/settings", label: "Settings" },
];

test.use({
  viewport: VIEWPORT,
  // Emulate iPhone 14
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  isMobile: true,
  hasTouch: true,
});

// Helper: wait for the app to be ready (SPA boot)
async function waitForApp(page: Page) {
  // Wait for the loading spinner to disappear and actual content to render
  await page
    .waitForSelector(".loader-container", {
      state: "hidden",
      timeout: 15000,
    })
    .catch(() => {
      // loader may already be gone
    });
  // Give React time to render
  await page.waitForTimeout(2000);
}

// Helper: detect horizontal overflow
async function checkNoHorizontalOverflow(page: Page, label: string) {
  const overflows = await page.evaluate((viewportWidth: number) => {
    const issues: string[] = [];
    const allElements = document.querySelectorAll("*");

    for (const el of allElements) {
      const rect = el.getBoundingClientRect();
      // Check if element extends beyond viewport
      if (rect.right > viewportWidth + 2) {
        // 2px tolerance
        const tag = el.tagName.toLowerCase();
        const cls = el.className
          ? `.${String(el.className).split(" ").slice(0, 2).join(".")}`
          : "";
        const id = el.id ? `#${el.id}` : "";
        issues.push(
          `${tag}${id}${cls} overflows right by ${Math.round(rect.right - viewportWidth)}px (width: ${Math.round(rect.width)}px)`,
        );
      }
      if (rect.left < -2) {
        const tag = el.tagName.toLowerCase();
        const cls = el.className
          ? `.${String(el.className).split(" ").slice(0, 2).join(".")}`
          : "";
        const id = el.id ? `#${el.id}` : "";
        issues.push(
          `${tag}${id}${cls} overflows left by ${Math.round(Math.abs(rect.left))}px`,
        );
      }
    }
    return issues;
  }, VIEWPORT.width);

  return overflows;
}

// Helper: check that text is not clipped (basic check for visibility)
async function checkNavBarVisible(page: Page) {
  const navVisible = await page
    .locator("nav[aria-label]")
    .first()
    .isVisible()
    .catch(() => false);
  return navVisible;
}

// Run tests for each page
for (const { path, label } of PAGES) {
  test(`Mobile layout: ${label} (${path})`, async ({ page }) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await waitForApp(page);

    // Screenshot
    await page.screenshot({
      path: `tests/screenshots/mobile-${label.replace(/[^a-zA-Z0-9]/g, "_")}.png`,
      fullPage: false,
    });

    // Full page screenshot
    await page.screenshot({
      path: `tests/screenshots/mobile-${label.replace(/[^a-zA-Z0-9]/g, "_")}_full.png`,
      fullPage: true,
    });

    // Check horizontal scroll doesn't exist
    const hasHorizontalScroll = await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth
      );
    });

    if (hasHorizontalScroll) {
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      console.warn(
        `  ⚠ ${label}: page has horizontal scroll (scrollWidth=${scrollWidth}, viewport=${VIEWPORT.width})`,
      );
    }

    // Check for elements overflowing
    const overflows = await checkNoHorizontalOverflow(page, label);
    if (overflows.length > 0) {
      // Filter out common harmless overflows (dropdowns, tooltips etc that are hidden)
      const significant = overflows.filter(
        (o) =>
          !o.includes("portal") &&
          !o.includes("tooltip") &&
          !o.includes("[data-radix"),
      );
      if (significant.length > 0) {
        console.warn(`  ⚠ ${label}: ${significant.length} overflow issues:`);
        for (const issue of significant.slice(0, 10)) {
          console.warn(`    - ${issue}`);
        }
      }
    }

    // Check bottom navigation is visible
    const navVisible = await checkNavBarVisible(page);
    expect(navVisible).toBe(true);

    // No horizontal scroll on the page
    expect(hasHorizontalScroll).toBe(false);
  });
}

// Test the create button (+) dropdown
test("Mobile: Create button opens menu with all options", async ({ page }) => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await waitForApp(page);

  // Find and click the + button
  const createButton = page.locator('button[aria-label="Create"]');
  await expect(createButton).toBeVisible();
  await createButton.click();

  // Wait for dropdown
  await page.waitForTimeout(500);

  await page.screenshot({
    path: "tests/screenshots/mobile-create_menu.png",
    fullPage: false,
  });

  // Check menu items are visible
  const menuItems = page.locator('[role="menuitem"]');
  const count = await menuItems.count();
  console.log(`  Create menu has ${count} items`);
  expect(count).toBeGreaterThanOrEqual(5); // Contact, Company, Deal, Quote, Note, Task
});

// Test the "Mer" (More) menu
test("Mobile: More menu opens with all navigation options", async ({
  page,
}) => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await waitForApp(page);

  // Click the "Mer" button
  const moreButton = page.locator("button", { hasText: "Mer" }).first();
  if (await moreButton.isVisible()) {
    await moreButton.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: "tests/screenshots/mobile-more_menu.png",
      fullPage: false,
    });

    // Check that key navigation items exist in the sheet
    const sheetContent = page.locator('[data-slot="sheet-content"]').first();
    if (await sheetContent.isVisible()) {
      const links = sheetContent.locator("a");
      const linkCount = await links.count();
      console.log(`  More menu has ${linkCount} links`);
      expect(linkCount).toBeGreaterThanOrEqual(4); // Companies, Deals, Quotes, Tasks, Calendar, Settings
    }
  }
});

// Test that call-queue page renders properly on mobile
test("Mobile: Call Queue renders without overflow", async ({ page }) => {
  await page.goto(`${BASE}/call-queue`, { waitUntil: "networkidle" });
  await waitForApp(page);

  await page.screenshot({
    path: "tests/screenshots/mobile-call_queue_detail.png",
    fullPage: true,
  });

  // Check cards don't overflow
  const overflows = await checkNoHorizontalOverflow(page, "Call Queue");
  const significant = overflows.filter(
    (o) => !o.includes("portal") && !o.includes("tooltip"),
  );

  if (significant.length > 0) {
    console.warn(`  Call Queue overflow issues:`);
    for (const issue of significant.slice(0, 10)) {
      console.warn(`    - ${issue}`);
    }
  }

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
