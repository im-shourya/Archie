import { expect, test } from "@playwright/test";

test("home page renders the product name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Archie" })).toBeVisible();
});

test("health endpoint is served by the mounted backend", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["x-request-id"]).toBeTruthy();
  expect(await res.json()).toMatchObject({ ok: true });
});
