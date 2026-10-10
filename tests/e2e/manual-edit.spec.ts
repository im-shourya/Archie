import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Manual editing without the AI: Add ▾, Connect in the Inspector, and "add a …" by voice. */

const bar = (page: Page) => page.getByRole("textbox", { name: "Command" });

async function add(page: Page, name: string) {
  await page.getByRole("button", { name: /^Add/ }).click();
  await page.getByRole("menuitem", { name }).click();
}

async function emptyBoard(page: Page) {
  await page.goto("/b/new");
  await expect(page.getByRole("heading", { name: "Describe your system" })).toBeVisible();
}

test("build and connect a design by hand, then undo the connection", async ({ page, isMobile }) => {
  let aiCalls = 0;
  await page.route("**/api/command", (route) => {
    aiCalls += 1;
    return route.abort();
  });
  await emptyBoard(page);
  await add(page, "Service");
  await expect(page.getByTestId("node-service")).toBeVisible();
  await add(page, "Cache");
  await expect(page.getByTestId("node-cache")).toBeVisible();

  // The new component opens in the Inspector, ready to connect.
  if (isMobile) await page.getByRole("button", { name: "Expand panel" }).click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector.getByRole("heading", { name: "Cache" })).toBeVisible();
  const form = inspector.getByRole("form", { name: "Connect Cache" });
  await form.getByLabel("Direction").selectOption("from");
  await form.getByLabel("Component").selectOption({ label: "Service" });
  await form.getByLabel("Traffic").selectOption("read");
  await form.getByRole("button", { name: "Connect" }).click();

  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(page.getByText("Connected Service → Cache")).toBeVisible();
  await expect(inspector.getByText(/from\s+Service/)).toBeVisible();

  await page.getByTitle("Undo (⌘Z)").click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  expect(aiCalls).toBe(0);
});

test("labels stay unique: a second cache is 'Cache 2'", async ({ page }) => {
  await emptyBoard(page);
  await add(page, "Cache");
  await add(page, "Cache");
  await expect(page.getByTestId("node-cache-2")).toContainText("Cache 2");
});

test("'add a redis cache' by voice is applied locally, without the AI", async ({ page }) => {
  let aiCalls = 0;
  await page.route("**/api/command", (route) => {
    aiCalls += 1;
    return route.abort();
  });
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await bar(page).fill("Add a Redis cache.");
  await bar(page).press("Enter");
  await expect(page.locator(".react-flow__node")).toHaveCount(8);
  await expect(page.getByTestId("latency-badge")).toContainText("local ·");
  await expect(page.getByRole("status").filter({ hasText: "Added Redis cache (not connected yet)" })).toBeVisible();
  expect(aiCalls).toBe(0);
});

test("the Add menu works by keyboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "same menu; the phone button is covered above");
  await emptyBoard(page);
  await page.getByRole("button", { name: /^Add/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Service" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Cache" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("node-cache")).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`axe: Add menu and the Connect form, ${scheme}`, async ({ page, isMobile }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await emptyBoard(page);
    await add(page, "Service");
    await add(page, "Cache");
    if (isMobile) await page.getByRole("button", { name: "Expand panel" }).click();
    await expect(page.getByRole("form", { name: "Connect Cache" })).toBeVisible();
    await page.getByRole("button", { name: /^Add/ }).click();
    await expect(page.getByRole("menu", { name: "Add component" })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .exclude(".react-flow__handle")
      .analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
