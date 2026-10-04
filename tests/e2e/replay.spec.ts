import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Session replay (FR-044, UF-13; docs/35 Step 9). */

const bar = (page: Page) => page.getByRole("textbox", { name: "Command" });
async function say(page: Page, text: string) {
  await bar(page).fill(text);
  await bar(page).press("Enter");
}

/** Template → kill Redis → 5 API replicas → undo. Leaves the board on the replay page. */
async function recordSession(page: Page, isMobile: boolean) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await say(page, "Kill Redis.");
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-status", "down");
  await say(page, "Five replicas of the API.");
  await expect(page.getByTestId("node-api")).toContainText("×5");
  await page.getByTitle("Undo (⌘Z)").click();
  await expect(page.getByTestId("node-api")).not.toContainText("×5");
  if (isMobile) await page.getByRole("button", { name: "Expand panel" }).click();
  await page.getByRole("tab", { name: "History" }).click();
  await page.getByRole("link", { name: "Replay this session" }).click();
  await expect(page).toHaveURL(/\/replay$/);
  await expect(page.getByRole("heading", { name: /Replay · Three-tier web app/ })).toBeVisible();
}

test("scrubbing rebuilds the board step by step, undo included", async ({ page, isMobile }) => {
  await recordSession(page, isMobile);
  if (isMobile) await page.getByRole("button", { name: "Expand panel" }).click();
  const scrubber = page.getByRole("slider", { name: "Replay step" });
  // Opens at the end: the same board as saved (Redis down, API back to 30 after the undo).
  await expect(scrubber).toHaveValue("4");
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-status", "down");
  await expect(page.getByTestId("node-api")).not.toContainText("×5");
  await expect(page.getByTestId("replay-note")).toHaveCount(0);

  await scrubber.fill("0");
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await scrubber.fill("1");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-status", "up");
  await page.getByRole("button", { name: /Five replicas of the API/ }).click();
  await expect(page.getByTestId("node-api")).toContainText("×5");
  await expect(scrubber).toHaveValue("3");
});

test("Play steps through to the end, and Exit returns to the board", async ({ page, isMobile }) => {
  await recordSession(page, isMobile);
  if (isMobile) await page.getByRole("button", { name: "Expand panel" }).click();
  await page.getByRole("slider", { name: "Replay step" }).fill("2");
  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByText("Step 4 of 4")).toBeVisible({ timeout: 6_000 });
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await page.getByRole("link", { name: "Exit replay, back to the board" }).click();
  await expect(page.getByRole("textbox", { name: "Board name" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`axe: replay, ${scheme}`, async ({ page, isMobile }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await recordSession(page, isMobile);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .exclude(".react-flow__handle")
      .analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
