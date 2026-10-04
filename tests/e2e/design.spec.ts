import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** /design style guide (docs/34 Step 9, docs/design §8). */

const globals = readFileSync(
  new URL("../../frontend/src/app/globals.css", import.meta.url),
  "utf8",
);
const TOKENS = [...new Set([...globals.matchAll(/(--color-[a-z-]+)\s*:/g)].map((m) => m[1]!))];

test("every colour token in globals.css is on the page, with its live value", async ({ page }) => {
  await page.goto("/design");
  await expect(page.getByRole("heading", { name: "Design system", level: 1 })).toBeVisible();
  expect(TOKENS.length).toBeGreaterThanOrEqual(15);
  for (const token of TOKENS) {
    const row = page.locator(`tr[data-token="${token}"]`);
    await expect(row, token).toHaveCount(1);
    await expect(row.locator("td").nth(1)).toHaveText(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  }
});

test("renders every node-card state and the panels from the real components", async ({ page }) => {
  await page.goto("/design");
  await expect(page.locator(".react-flow__node")).toHaveCount(8);
  await expect(page.getByTestId("spof-spof")).toBeVisible();
  await expect(page.getByTestId("check-spof")).toBeVisible();
  await expect(page.getByRole("meter")).toHaveCount(6);
});

for (const scheme of ["light", "dark"] as const) {
  test(`axe: 0 serious/critical in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/design");
    await expect(page.locator(".react-flow__node")).toHaveCount(8);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .exclude(".react-flow__handle")
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });
}
