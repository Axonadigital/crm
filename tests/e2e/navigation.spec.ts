import { test, expect } from "@playwright/test";

import { clickNavLink, expectAppShell, login } from "./helpers";

test.describe("Primary navigation", () => {
  test("navigates between the critical desktop views", async ({ page }) => {
    await login(page);
    await expectAppShell(page);

    await clickNavLink(page, "Contacts");
    await expect(page).toHaveURL(/\/#\/contacts$/);
    await expect(page.getByRole("link", { name: /^create$/i })).toBeVisible();

    await clickNavLink(page, "Companies");
    await expect(page).toHaveURL(/\/#\/companies$/);
    await expect(
      page.getByRole("link", { name: "New Company", exact: true }),
    ).toBeVisible();

    await clickNavLink(page, "Deals");
    await expect(page).toHaveURL(/\/#\/deals$/);
    await expect(
      page.getByRole("link", { name: "New Deal", exact: true }),
    ).toBeVisible();

    await clickNavLink(page, "Dashboard");
    await expect(page).toHaveURL(/\/#\/$/);
    await expect(page.getByRole("button", { name: "Lägg till" })).toBeVisible();
  });
});
