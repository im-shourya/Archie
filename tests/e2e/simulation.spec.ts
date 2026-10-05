import { expect, test, type Page } from "@playwright/test";

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

/** On phones the metrics live in the bottom sheet (docs/33 Step 3): open it first. */
async function showPanel(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("region", { name: "Details" }).getByRole("button", { name: "Expand panel" }).click();
}

async function say(page: Page, text: string) {
  const bar = page.getByRole("textbox", { name: "Command" });
  await bar.fill(text);
  await bar.press("Enter");
}

test("golden scenario: Postgres saturates at 50k rps and the bottleneck explains why (F-05)", async ({ page, isMobile }) => {
  await openThreeTier(page);
  await expect(page.getByTestId("node-pg")).toHaveAttribute("data-sim", "saturated");
  await expect(page.getByTestId("load-pg")).toHaveText("ρ 1.40");
  await expect(page.getByTestId("node-api")).toHaveAttribute("data-sim", "warm");
  await expect(page.getByTestId("success-rate")).toHaveText("96.3%");
  if (isMobile) {
    // Phones name the bottleneck in the sheet's peek instead of a callout over the graph.
    await expect(page.getByTestId("sheet-peek")).toContainText("Postgres (primary) · ρ 1.40");
    await showPanel(page, true);
    await expect(page.getByTestId("metrics")).toContainText("28.6% of its requests dropped");
    return;
  }
  const callout = page.getByRole("note", { name: "Bottleneck: Postgres (primary)" });
  await expect(callout).toContainText("ρ = 1.40 → 28.6% of its requests dropped");
});

test("fixing it by voice: 'shard Postgres into two' brings success back to 100%", async ({ page }) => {
  await openThreeTier(page);
  await say(page, "Shard Postgres into two.");
  await expect(page.getByTestId("node-pg")).toHaveAttribute("data-sim", "warm");
  await expect(page.getByTestId("load-pg")).toHaveText("ρ 0.70");
  await expect(page.getByTestId("success-rate")).toHaveText("100%");
});

test("failure injection: killing Redis shows the blast radius (F-06)", async ({ page, isMobile }) => {
  await openThreeTier(page);
  await showPanel(page, isMobile);
  await say(page, "Kill Redis.");
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-sim", "down");
  const blast = page.getByRole("region", { name: /Blast radius/ });
  await expect(blast).toContainText("96.3%");
  await expect(blast).toContainText("54.5%");
  await expect(blast).toContainText("Postgres replica 1");
  await say(page, "Bring it back.");
  await expect(page.getByTestId("success-rate")).toHaveText("96.3%");
});

test("selecting a node shows its explanation in the Inspector", async ({ page }) => {
  await openThreeTier(page);
  await page.getByTestId("node-redis").click();
  await expect(page.getByTestId("inspector")).toContainText("Hit rate 90%: absorbs 40,500 of 45,000 reads/s");
});
