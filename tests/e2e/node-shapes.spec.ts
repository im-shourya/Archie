import { expect, test } from "@playwright/test";

/** Node shapes and logos (docs/06 · Node shapes and logos). */

test("nodes take their family's shape, and named products show their logo", async ({ page }) => {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);

  await expect(page.getByTestId("node-client")).toHaveAttribute("data-family", "users");
  await expect(page.getByTestId("node-lb")).toHaveAttribute("data-family", "edge");
  await expect(page.getByTestId("node-api")).toHaveAttribute("data-family", "compute");
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-family", "data");

  // "Redis" and "Postgres (primary)" name products; "API" doesn't.
  await expect(page.getByTestId("node-redis").locator('svg[data-brand="redis"]')).toBeVisible();
  await expect(page.getByTestId("node-pg").locator('svg[data-brand="postgresql"]')).toBeVisible();
  await expect(page.getByTestId("node-api").locator("svg[data-brand]")).toHaveCount(0);
});

test("a down node keeps its shape with a dashed outline", async ({ page }) => {
  await page.goto("/b/new?template=three-tier");
  const bar = page.getByRole("textbox", { name: "Command" });
  await bar.fill("kill redis");
  await bar.press("Enter");
  const outline = page.getByTestId("node-redis").locator("svg path").first();
  await expect.poll(() => outline.evaluate((el) => getComputedStyle(el).strokeDasharray)).not.toBe("none");
});
