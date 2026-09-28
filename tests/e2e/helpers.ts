import { expect, type Locator, type Page } from "@playwright/test";

export const demoUser = {
  email: "janedoe@atomic.dev",
  password: "demo",
};

export const uniqueValue = (prefix: string) =>
  `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const appRoute = (path: string) => `/#${path}`;

export async function gotoRoute(page: Page, path: string) {
  await page.goto(appRoute(path), { waitUntil: "networkidle" });
}

export async function expectLoginPage(page: Page) {
  await expect(
    page.getByRole("heading", { name: /sign in/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
}

export async function login(page: Page) {
  await gotoRoute(page, "/");
  await expectLoginPage(page);
  await page.getByLabel(/email/i).fill(demoUser.email);
  await page.getByLabel(/password/i).fill(demoUser.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expectAppShell(page);
}

export async function expectAppShell(page: Page) {
  await expect(
    page.getByRole("link", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Contacts", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Companies", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Deals", exact: true }),
  ).toBeVisible();
}

export async function clickNavLink(page: Page, name: string) {
  await page.getByRole("link", { name, exact: true }).click();
}

export async function selectAutocompleteOption(
  page: Page,
  label: string | RegExp,
  optionName: string,
) {
  await getFieldGroup(page, label).getByRole("combobox").click();
  const popover = page.locator("[data-radix-popper-content-wrapper]").last();
  const searchInput = popover.locator("[cmdk-input]");
  await expect(searchInput).toBeVisible();
  await searchInput.fill(optionName);
  await popover.getByRole("option", { name: optionName, exact: true }).click();
}

export async function selectOption(
  page: Page,
  label: string | RegExp,
  optionName: string,
) {
  await getFieldGroup(page, label).getByRole("combobox").click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

export async function expectShowUrl(
  page: Page,
  resource: string,
  idPattern = "\\d+",
) {
  await expect(page).toHaveURL(new RegExp(`/#/${resource}/${idPattern}/show$`));
}

export async function getCurrentRecordId(page: Page, resource: string) {
  const match = page.url().match(new RegExp(`/#/${resource}/(\\d+)/show$`));
  expect(match?.[1]).toBeTruthy();
  return match![1];
}

export async function saveForm(page: Page, label = /^save$/i) {
  await page.getByRole("button", { name: label }).click();
}

export async function expectHeading(page: Page, name: string | RegExp) {
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

export async function expectVisibleText(target: Page | Locator, text: string) {
  await expect(target.getByText(text, { exact: true })).toBeVisible();
}

function getFieldGroup(page: Page, label: string | RegExp) {
  return page
    .locator("label")
    .filter({ hasText: label })
    .locator('xpath=ancestor::*[@data-slot="form-item"][1]');
}
