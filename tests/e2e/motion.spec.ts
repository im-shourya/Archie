import { expect, test, type Page } from "@playwright/test";

/** Reduced motion (NFR-014, doc 06 · Motion): no particles, no pulse, no shimmer. */

test.use({ reducedMotion: "reduce" });

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

const animation = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);

test("no traffic particles; edges show static thickness instead", async ({ page }) => {
  await openThreeTier(page);
  await expect(page.locator(".react-flow__edge")).toHaveCount(6);
  await expect(page.locator(".react-flow__edges animateMotion")).toHaveCount(0);
  const widths = await page
    .locator(".react-flow__edge-path")
    .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).strokeWidth)));
  expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths));
});

test("a change flashes an outline instead of pulsing", async ({ page }) => {
  await openThreeTier(page);
  const bar = page.getByRole("textbox", { name: "Command" });
  await bar.fill("Five replicas of the API.");
  await bar.press("Enter");
  const node = page.getByTestId("node-api");
  await expect(node).toContainText("×5");
  expect(await animation(page, "[data-testid='node-api']")).toBe("none");
  expect(await node.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
});

test("the thinking shimmer is static", async ({ page }) => {
  await page.route("**/api/command", () => new Promise(() => {}));
  await openThreeTier(page);
  const bar = page.getByRole("textbox", { name: "Command" });
  await bar.fill("put a queue between the api and the database");
  await bar.press("Enter");
  const badge = page.getByTestId("latency-badge");
  await expect(badge).toHaveAttribute("data-tier", "thinking");
  expect(await animation(page, "[data-testid='latency-badge']")).toBe("none");
});

test("with motion allowed, particles do run (control)", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "no-preference" });
  const page = await context.newPage();
  await openThreeTier(page);
  expect(await page.locator(".react-flow__edges animateMotion").count()).toBeGreaterThan(0);
  await context.close();
});
