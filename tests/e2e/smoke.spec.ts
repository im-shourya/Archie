import { expect, test } from "@playwright/test";

test("home page shows the brand, the tagline and SEO metadata", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Archie home" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /Talk through a system/ })).toBeVisible();
  await expect(page).toHaveTitle(/Archie/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute("href", /icon/);
});

test("boards are excluded from search indexing", async ({ page }) => {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("health endpoint is served by the mounted backend", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["x-request-id"]).toBeTruthy();
  expect(await res.json()).toMatchObject({ ok: true });
});
