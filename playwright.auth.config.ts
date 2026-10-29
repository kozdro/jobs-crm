import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "auth*.spec.ts",
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "https://127.0.0.1:3143",
    ignoreHTTPSErrors: true,
    channel: "chromium",
    launchOptions: { ignoreDefaultArgs: ["--disable-back-forward-cache"] },
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
