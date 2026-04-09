import { test, expect } from "@playwright/test";

import {
  expectShowUrl,
  login,
  selectAutocompleteOption,
  uniqueValue,
} from "./helpers";

test.describe("Deals", () => {
  test("creates and updates a deal linked to a company", async ({ page }) => {
    const companyName = uniqueValue("E2E Deal Company");
    const initialDealName = uniqueValue("E2E Deal");
    const updatedDealName = `${initialDealName} Updated`;

    await login(page);

    await page.goto("/#/companies/create", { waitUntil: "networkidle" });
    await page.getByLabel("Company name").fill(companyName);
    await page.getByRole("button", { name: "Create Company" }).click();
    await expectShowUrl(page, "companies");

    await page.goto("/#/deals/create", { waitUntil: "networkidle" });
    await page.getByLabel("Name").fill(initialDealName);
    await page.getByLabel("Description").fill("Created by Playwright E2E");
    await selectAutocompleteOption(page, "Company", companyName);
    await page.getByLabel("Budget").fill("50000");
    await page.getByRole("button", { name: /^save$/i }).click();

    await expect(page).toHaveURL(/\/#\/deals$/);
    await expect(
      page.getByText(`${companyName} - ${initialDealName}`, { exact: true }),
    ).toBeVisible();
    await page
      .getByText(`${companyName} - ${initialDealName}`, { exact: true })
      .click();

    await expectShowUrl(page, "deals");
    await expect(
      page.getByRole("dialog").getByText(initialDealName, { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText("Opportunity", { exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: /^edit$/i }).click();
    await expect(page.getByRole("heading", { name: initialDealName })).toBeVisible();
    await page.getByLabel("Name").fill(updatedDealName);
    await page.getByLabel("Description").fill("Updated by Playwright E2E");
    await page.getByRole("button", { name: /^save$/i }).click();

    await expectShowUrl(page, "deals");
    await expect(
      page.getByRole("dialog").getByText(updatedDealName, { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("Updated by Playwright E2E", { exact: true })).toBeVisible();

    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await expect(page).toHaveURL(/\/#\/deals$/);
    await expect(
      page.getByText(`${companyName} - ${updatedDealName}`, { exact: true }),
    ).toBeVisible();
    await page
      .getByText(`${companyName} - ${updatedDealName}`, { exact: true })
      .click();

    await expectShowUrl(page, "deals");
    await expect(
      page.getByRole("dialog").getByText(updatedDealName, { exact: false }),
    ).toBeVisible();
  });
});
