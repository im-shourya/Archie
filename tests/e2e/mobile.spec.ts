import { expect, test, type Page } from "@playwright/test";

/** Phones (docs/33 Step 3, doc 06 · Responsive): bottom sheet, toasts above it, legible graphs. */

test.skip(({ isMobile }) => !isMobile, "phone layout only");

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

const sheet = (page: Page) => page.getByRole("region", { name: "Details" });
const handle = (page: Page) => sheet(page).getByRole("button", { name: /panel/ });

test("the sheet peeks with the bottleneck and expands to half, then full", async ({ page }) => {
  await openThreeTier(page);
  await expect(sheet(page)).toHaveAttribute("data-snap", "peek");
  await expect(sheet(page).getByTestId("sheet-peek")).toContainText("Bottleneck");
  await expect(sheet(page).getByTestId("sheet-peek")).toContainText("Postgres (primary)");

  const peekHeight = (await sheet(page).boundingBox())!.height;
  expect(peekHeight).toBeLessThanOrEqual(100);

  await handle(page).click();
  await expect(sheet(page)).toHaveAttribute("data-snap", "half");
  await expect(sheet(page).getByRole("tab", { name: "Metrics" })).toBeVisible();
  await handle(page).click();
  await expect(sheet(page)).toHaveAttribute("data-snap", "full");
  await expect(handle(page)).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveAttribute("data-snap", "peek");
});

test("dragging the handle snaps the sheet", async ({ page }) => {
  await openThreeTier(page);
  const box = (await handle(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 250, { steps: 8 });
  await page.mouse.up();
  await expect(sheet(page)).not.toHaveAttribute("data-snap", "peek");
});

test("a fast-path toast sits fully above the sheet (known bug: toast overlap)", async ({
  page,
}) => {
  await openThreeTier(page);
  await handle(page).click();
  await expect(sheet(page)).toHaveAttribute("data-snap", "half");
  const bar = page.getByRole("textbox", { name: "Command" });
  await bar.fill("Kill Redis.");
  await bar.press("Enter");
  const toast = page.getByRole("status").filter({ hasText: "Took down Redis" });
  await expect(toast).toBeVisible();
  // Poll: the sheet's height animates for 200 ms after the snap changes.
  await expect
    .poll(async () => {
      const t = (await toast.boundingBox())!;
      const s = (await sheet(page).boundingBox())!;
      return t.y >= 0 && t.y + t.height <= s.y + 1;
    })
    .toBe(true);
});

test("selecting a node opens the sheet on the Inspector", async ({ page }) => {
  await openThreeTier(page);
  await page.getByTestId("node-api").click();
  await expect(sheet(page)).toHaveAttribute("data-snap", "half");
  await expect(page.getByRole("region", { name: "Inspector" })).toBeVisible();
});

async function smallestLabelHeight(page: Page) {
  // Wait for the fit animation to settle.
  await page.waitForTimeout(600);
  const heights = await page
    .locator(".react-flow__node [data-role='label']")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(heights.length).toBe(7);
  return Math.min(...heights);
}

test("graph labels stay legible after fit, also in landscape (known bug: tiny graphs)", async ({
  page,
}) => {
  await openThreeTier(page);
  expect(await smallestLabelHeight(page)).toBeGreaterThanOrEqual(10);

  await page.setViewportSize({ width: 915, height: 412 });
  expect(await smallestLabelHeight(page)).toBeGreaterThanOrEqual(10);
  await expect(page.getByTestId("node-pg")).toBeInViewport();
});
