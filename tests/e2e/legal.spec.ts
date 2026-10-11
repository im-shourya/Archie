import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Legal pages (docs/legal): rendered from the repository, linked from the home footer. */

const PAGES = [
  ["/legal/privacy", "Privacy policy"],
  ["/legal/terms", "Terms of use"],
  ["/legal/third-parties", "Third-party services and open-source notices"],
  ["/legal/accessibility", "Accessibility statement"],
  ["/legal", "Legal"],
] as const;

for (const [path, title] of PAGES) {
  test(`${path} renders "${title}"`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Archie" })).toBeVisible();
  });
}

test("/privacy and /terms redirect to their pages", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page).toHaveURL(/\/legal\/privacy$/);
  await page.goto("/terms");
  await expect(page).toHaveURL(/\/legal\/terms$/);
});

test("the home footer links to the legal pages", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy policy", level: 1 })).toBeVisible();
  await expect(page.getByText(/There are no accounts, no cookies, no analytics and no tracking/)).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`axe: legal pages, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [path] of PAGES) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(blocking.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    }
  });
}
