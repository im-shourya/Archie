import { expect, test, type Page } from "@playwright/test";

/** SPOF scan on the board (FR-027, docs/34 Step 1). */

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

async function say(page: Page, text: string) {
  const bar = page.getByRole("textbox", { name: "Command" });
  await bar.fill(text);
  await bar.press("Enter");
}

const badges = (page: Page) => page.locator(".react-flow__node [data-testid^='spof-']");

async function showMetrics(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Expand panel" }).click();
}

test("three-tier: SPOF badges on exactly the LB, the API and Redis", async ({ page }) => {
  await openThreeTier(page);
  await expect(badges(page)).toHaveCount(3);
  for (const id of ["lb", "api", "redis"])
    await expect(page.getByTestId(`spof-${id}`)).toBeVisible();
  await expect(page.getByTestId("node-redis")).toHaveAttribute(
    "aria-label",
    /single point of failure/,
  );
  await expect(page.getByTestId("node-pg")).not.toHaveAttribute(
    "aria-label",
    /single point of failure/,
  );
});

test("the metrics panel lists SPOFs with their what-if success, largest drop first", async ({
  page,
  isMobile,
}) => {
  await openThreeTier(page);
  await showMetrics(page, isMobile);
  const section = page.getByRole("region", { name: "Single points of failure" });
  await expect(section.getByRole("listitem")).toHaveCount(3);
  await expect(section.getByRole("listitem").last()).toContainText("Redis");
  await expect(section.getByRole("listitem").last()).toContainText("54.5%");
});

test("the Inspector says what failing this component would do", async ({ page }) => {
  await openThreeTier(page);
  await page.getByTestId("node-redis").click();
  await expect(page.getByRole("region", { name: "Inspector" })).toContainText(
    "If this fails: success 96.3% → 54.5%",
  );
});

test("changes re-scan: sharding keeps the badges; failover off makes Postgres a SPOF; undo restores", async ({
  page,
}) => {
  await openThreeTier(page);
  await expect(badges(page)).toHaveCount(3);
  await say(page, "Shard Postgres into two.");
  await expect(page.getByTestId("node-pg")).toHaveAttribute("data-sim", "warm");
  await expect(badges(page)).toHaveCount(3);

  await page.getByTestId("node-pg").click();
  await page.getByRole("region", { name: "Inspector" }).getByLabel("Automatic failover").uncheck();
  await expect(page.getByTestId("spof-pg")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("spof-pg")).toHaveCount(0);
});
