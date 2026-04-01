import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.ts",
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5174",
    trace: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
});
