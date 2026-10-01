import { expect, test, type Page } from "@playwright/test";

const nodes = (page: Page) => page.locator(".react-flow__node");

test("template board renders, survives reload, and appears on Home (FR-040/041, NFR-017)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Three-tier web app/ }).click();
  await expect(page).toHaveURL(/\/b\/[0-9a-z]+$/);
  await expect(nodes(page)).toHaveCount(7);
  await expect(page.getByTestId("node-api")).toContainText("×30");
  await expect(nodes(page).first()).toBeVisible();

  await page.reload();
  await expect(nodes(page)).toHaveCount(7);

  await page.goto("/");
  await expect(page.getByRole("link", { name: /Three-tier web app.*7 components/ })).toBeVisible();
});

test("empty board: insert template, undo, redo, delete selection (FR-010/012/013)", async ({ page }) => {
  await page.goto("/b/new");
  await expect(page.getByRole("heading", { name: "Describe your system" })).toBeVisible();

  await page.getByRole("button", { name: "Insert Chat app" }).click();
  await expect(nodes(page)).toHaveCount(7);
  const history = page.getByRole("list", { name: "Change history" });
  await expect(history.getByRole("listitem")).toHaveCount(1);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("heading", { name: "Describe your system" })).toBeVisible();

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(nodes(page)).toHaveCount(7);

  await page.getByTestId("node-presence").click();
  await page.keyboard.press("Delete");
  await expect(nodes(page)).toHaveCount(6);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(nodes(page)).toHaveCount(7);
});

test("unknown board id shows a friendly not-found state", async ({ page }) => {
  await page.goto("/b/does-not-exist");
  await expect(page.getByRole("heading", { name: "Board not found" })).toBeVisible();
});
