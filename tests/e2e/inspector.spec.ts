import { expect, test, type Page } from "@playwright/test";

/** Inspector (FR-016, docs/33 Step 2). Every edit is a validated op batch with undo. */

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

const inspector = (page: Page) => page.getByRole("region", { name: "Inspector" });

async function inspect(page: Page, id: string) {
  await page.getByTestId(`node-${id}`).click();
  await expect(page.getByRole("tab", { name: "Inspector" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(inspector(page)).toBeVisible();
}

test("edits replicas through a validated op, with undo (FR-016)", async ({ page }) => {
  await openThreeTier(page);
  await inspect(page, "api");

  const replicas = inspector(page).getByLabel("Replicas");
  await expect(replicas).toHaveValue("30");
  await replicas.fill("12");
  await replicas.press("Enter");
  await expect(page.getByTestId("node-api")).toContainText("×12");

  const toast = page.getByRole("status").filter({ hasText: "API replicas → 12" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("node-api")).toContainText("×30");
  await expect(replicas).toHaveValue("30");
});

test("an out-of-bounds value shows the op engine's error and changes nothing", async ({ page }) => {
  await openThreeTier(page);
  await inspect(page, "api");

  const replicas = inspector(page).getByLabel("Replicas");
  await replicas.fill("5000");
  await replicas.press("Enter");
  await expect(inspector(page).getByText(/1–1,000/)).toBeVisible();
  await expect(replicas).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("node-api")).toContainText("×30");
  await expect(page.getByRole("status").filter({ hasText: "replicas →" })).toHaveCount(0);
});

test("cache hit rate is edited as a percentage", async ({ page }) => {
  await openThreeTier(page);
  await inspect(page, "redis");

  const hit = inspector(page).getByLabel("Hit rate (%)");
  await expect(hit).toHaveValue("90");
  await hit.fill("95");
  await hit.blur();
  await expect(page.getByTestId("node-redis")).toContainText("hit 95%");
});

test("fail and recover from the inspector; label edits; connections listed", async ({ page }) => {
  await openThreeTier(page);
  await inspect(page, "redis");

  await inspector(page).getByRole("button", { name: "Fail" }).click();
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-status", "down");
  await inspector(page).getByRole("button", { name: "Recover" }).click();
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-status", "up");

  const label = inspector(page).getByLabel("Label");
  await label.fill("Session cache");
  await label.press("Enter");
  await expect(page.getByTestId("node-redis")).toContainText("Session cache");

  const connections = inspector(page).getByRole("list", { name: "Connections" });
  await expect(connections.getByRole("listitem")).toHaveCount(1);
  await expect(connections).toContainText("API");
  await expect(connections).toContainText("reads");
  await connections.getByRole("button", { name: /Disconnect/ }).click();
  await expect(connections.getByRole("listitem")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(connections.getByRole("listitem")).toHaveCount(1);
});

test("SQL nodes expose role and failover", async ({ page }) => {
  await openThreeTier(page);
  await inspect(page, "pg");
  await expect(inspector(page).getByLabel("Role")).toHaveValue("primary");
  await expect(inspector(page).getByLabel("Automatic failover")).toBeChecked();
  await expect(inspector(page).getByLabel("Hit rate (%)")).toHaveCount(0);
});

test("keyboard only: Tab to a node, Enter selects it, the Inspector takes focus, Escape returns", async ({
  page,
}) => {
  await openThreeTier(page);
  await page.locator(".react-flow__node").first().focus();
  await page.keyboard.press("Enter");
  await expect(inspector(page)).toBeVisible();
  await expect(inspector(page).getByRole("heading", { level: 3 })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".react-flow__node").first()).toBeFocused();
});
