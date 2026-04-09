import { test, expect } from "@playwright/test";

import {
  clickNavLink,
  expectHeading,
  expectShowUrl,
  login,
  uniqueValue,
} from "./helpers";

test.describe("Companies", () => {
  test("creates a company and opens it again from the list", async ({
    page,
  }) => {
    const companyName = uniqueValue("E2E Company");

    await login(page);
    await page.goto("/#/companies/create", { waitUntil: "networkidle" });

    await page.getByLabel("Company name").fill(companyName);
    await page.getByLabel("Website").fill("example.com");
    await page.getByRole("button", { name: "Create Company" }).click();

    await expectShowUrl(page, "companies");
    await expectHeading(page, companyName);

    await clickNavLink(page, "Companies");
    await expect(page.getByRole("link", { name: new RegExp(companyName) })).toBeVisible();
    await page.getByRole("link", { name: new RegExp(companyName) }).click();

    await expectShowUrl(page, "companies");
    await expectHeading(page, companyName);
  });
});
