import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import LZString from "lz-string";
import { buildTemplate } from "@archie/simulator";

/** Share links (FR-042, UF-12, EF-05, T-06; docs/35 Step 5). */

async function share(page: Page) {
  const more = page.getByRole("button", { name: "More actions" });
  if (await more.isVisible()) {
    await more.click();
    await page.getByRole("menuitem", { name: "Share link" }).click();
  } else {
    await page.getByRole("button", { name: "Share" }).click();
  }
}

const link = (payload: unknown) => `/s#v1:${LZString.compressToEncodedURIComponent(JSON.stringify(payload))}`;

test("share → open in a fresh browser → same simulation → Duplicate saves an editable copy", async ({
  page,
  browser,
  isMobile,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await share(page);
  await expect(page.getByText("Link copied. Anyone with it sees a read-only copy.")).toBeVisible();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/s#v1:/);

  // A fresh context has no IndexedDB boards: everything comes from the link.
  const other = await browser.newContext(isMobile ? { viewport: page.viewportSize()!, isMobile: true, hasTouch: true } : {});
  const viewer = await other.newPage();
  await viewer.goto(url);
  await expect(viewer.getByRole("heading", { name: "Three-tier web app", level: 1 })).toBeVisible();
  await expect(viewer.locator(".react-flow__node")).toHaveCount(7);
  await expect(viewer.getByTestId("node-pg")).toHaveAttribute("data-sim", "saturated");
  await expect(viewer.getByText(/read-only/)).toBeVisible();
  // Read-only: no command bar.
  await expect(viewer.getByRole("textbox", { name: /command/i })).toHaveCount(0);

  await viewer.getByRole("button", { name: "Duplicate" }).click();
  await expect(viewer).toHaveURL(/\/b\/[^/]+$/);
  await expect(viewer.getByRole("textbox", { name: "Board name" })).toHaveValue("Three-tier web app");
  await expect(viewer.locator(".react-flow__node")).toHaveCount(7);
  await viewer.goto("/");
  await expect(viewer.getByText("Three-tier web app").first()).toBeVisible();
  await other.close();
});

test.describe("broken links render EF-05 and never throw (T-06)", () => {
  const graph = buildTemplate("three-tier");
  const oversizedReplicas = { ...graph, nodes: graph.nodes.map((n) => (n.id === "api" ? { ...n, props: { ...n.props, replicas: 5000 } } : n)) };
  const cases: [string, string][] = [
    ["no payload", "/s"],
    ["wrong version prefix", "/s#v9:abc"],
    ["truncated payload", link({ name: "x", graph }).slice(0, 60)],
    ["valid compression, invalid board", link({ name: "x", graph: { nodes: [{ id: "BAD" }] } })],
    ["out-of-bounds number", link({ name: "x", graph: oversizedReplicas })],
    ["over 32 KB", `/s#v1:${"A".repeat(33 * 1024)}`],
  ];
  for (const [name, href] of cases) {
    test(name, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(href);
      await expect(page.getByRole("heading", { name: "This link is broken or from a newer version" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});

test("a valid link opens without a stored board", async ({ page }) => {
  await page.goto(link({ name: "Shared demo", graph: buildTemplate("url-shortener") }));
  await expect(page.getByRole("heading", { name: "Shared demo", level: 1 })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`axe: shared board and error page, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const href of [link({ name: "Shared demo", graph: buildTemplate("three-tier") }), "/s#v1:broken"]) {
      await page.goto("/");
      await page.goto(href);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .exclude(".react-flow__handle")
        .analyze();
      const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    }
  });
}
