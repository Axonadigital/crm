import { test, expect } from "@playwright/test";

import {
  clickNavLink,
  expectHeading,
  expectShowUrl,
  login,
  selectAutocompleteOption,
  uniqueValue,
} from "./helpers";

test.describe("Contacts", () => {
  test("creates a contact and reopens it from the list", async ({ page }) => {
    const companyName = uniqueValue("E2E Contact Company");
    const firstName = "E2E";
    const lastName = uniqueValue("Contact");
    const fullName = `${firstName} ${lastName}`;

    await login(page);

    await page.goto("/#/companies/create", { waitUntil: "networkidle" });
    await page.getByLabel("Company name").fill(companyName);
    await page.getByRole("button", { name: "Create Company" }).click();
    await expectShowUrl(page, "companies");

    await page.goto("/#/contacts/create", { waitUntil: "networkidle" });
    await page.getByLabel("First name").fill(firstName);
    await page.getByLabel("Last name").fill(lastName);
    await selectAutocompleteOption(page, "Company", companyName);
    await page
      .getByLabel("LinkedIn URL")
      .fill("https://www.linkedin.com/in/e2e-contact");
    await page.getByRole("button", { name: /^save$/i }).click();

    await expectShowUrl(page, "contacts");
    await expectHeading(page, fullName);

    await clickNavLink(page, "Contacts");
    await expect(page.getByRole("link", { name: new RegExp(fullName) })).toBeVisible();
    await page.getByRole("link", { name: new RegExp(fullName) }).click();

    await expectShowUrl(page, "contacts");
    await expectHeading(page, fullName);
  });
});
