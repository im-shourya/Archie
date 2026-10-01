import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // CI builds first, so serve the production build there; dev server locally.
    command: process.env.CI
      ? `npm run start -w frontend -- -p ${PORT}`
      : `npm run dev -w frontend -- -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
