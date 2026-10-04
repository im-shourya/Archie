import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** /evals report (FR-061, docs/35 Step 4): the page shows exactly what the committed files hold. */

const latest = JSON.parse(
  readFileSync(new URL("../../evals/results/latest.json", import.meta.url), "utf8"),
) as { metrics: { taskAccuracy: number; falseActionRate: number }; cases: unknown[]; commit: string };

const pct = (f: number) => {
  const p = f * 100;
  return p === 100 || p === 0 ? `${p}%` : `${p.toFixed(1)}%`;
};

test("headline numbers come from evals/results/latest.json", async ({ page }) => {
  await page.goto("/evals");
  await expect(page.getByRole("heading", { name: "Evals", level: 1 })).toBeVisible();
  const tiles = page.getByRole("list", { name: "Headline results" });
  await expect(tiles).toContainText(pct(latest.metrics.taskAccuracy));
  await expect(tiles).toContainText(`${latest.cases.length} cases`);
  await expect(tiles).toContainText(pct(latest.metrics.falseActionRate));
  await expect(page.getByRole("table", { name: /where each number comes from/i })).toContainText(latest.commit);
});

test("every table has a caption and header cells", async ({ page }) => {
  await page.goto("/evals");
  const tables = page.getByRole("table");
  await expect(tables).toHaveCount(3);
  for (const table of await tables.all()) {
    await expect(table.locator("caption")).not.toBeEmpty();
    expect(await table.locator("th[scope=col]").count()).toBeGreaterThan(1);
  }
});

test("is linked from the home page footer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Evals" }).click();
  await expect(page).toHaveURL(/\/evals$/);
});

for (const scheme of ["light", "dark"] as const) {
  test(`axe: 0 serious/critical in ${scheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/evals");
    await expect(page.getByRole("heading", { name: "Evals", level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });
}
