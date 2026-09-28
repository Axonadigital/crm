import { test, expect } from "@playwright/test";

import { expectAppShell, expectLoginPage, gotoRoute, login } from "./helpers";

test.describe("Auth and app start", () => {
  test("shows login when demo auto-login is disabled", async ({ page }) => {
    await gotoRoute(page, "/");
    await expectLoginPage(page);
  });

  test("signs in with demo credentials and loads the app shell", async ({
    page,
  }) => {
    await login(page);
    await expectAppShell(page);
    await expect(page).toHaveURL(/\/#\/$/);
  });
});
