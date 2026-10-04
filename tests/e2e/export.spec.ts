import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Export ▾ and Open file (FR-043, docs/35 Step 6). */

const LABEL = {
  json: "JSON (re-importable)",
  mermaid: "Mermaid diagram",
  doc: "Design doc (Markdown)",
  svg: "Image (SVG)",
  png: "Image (PNG)",
} as const;

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

async function exportAs(page: Page, kind: keyof typeof LABEL) {
  const more = page.getByRole("button", { name: "More actions" });
  const download = page.waitForEvent("download");
  if (await more.isVisible()) {
    await more.click();
    await page.getByRole("menuitem", { name: `Export ${LABEL[kind]}` }).click();
  } else {
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("menuitem", { name: LABEL[kind] }).click();
  }
  const file = await download;
  return { name: file.suggestedFilename(), body: readFileSync((await file.path())!) };
}

test("every export downloads a non-empty file of the right type", async ({ page }) => {
  await openThreeTier(page);
  const date = new Date().toISOString().slice(0, 10);

  const json = await exportAs(page, "json");
  expect(json.name).toBe(`three-tier-web-app-${date}.json`);
  expect(JSON.parse(json.body.toString())).toMatchObject({ format: "archie-board", version: 1, name: "Three-tier web app" });

  const mermaid = await exportAs(page, "mermaid");
  expect(mermaid.name).toMatch(/\.mmd$/);
  expect(mermaid.body.toString()).toMatch(/^flowchart LR\n/);

  const doc = await exportAs(page, "doc");
  expect(doc.name).toMatch(/\.md$/);
  expect(doc.body.toString()).toContain("# Three-tier web app");
  expect(doc.body.toString()).toContain("## Bottleneck");

  const svg = await exportAs(page, "svg");
  expect(svg.name).toMatch(/\.svg$/);
  expect(svg.body.toString()).toMatch(/^<svg xmlns/);
  expect(svg.body.toString().match(/<g data-node=/g)).toHaveLength(7);

  const png = await exportAs(page, "png");
  expect(png.name).toMatch(/\.png$/);
  expect([...png.body.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect(png.body.length).toBeGreaterThan(5_000);
});

test("JSON export → Open file on Home → the same board, editable", async ({ page }) => {
  await openThreeTier(page);
  const { body } = await exportAs(page, "json");
  await page.goto("/");
  await page.getByTestId("open-file").setInputFiles({ name: "board.json", mimeType: "application/json", buffer: body });
  await expect(page).toHaveURL(/\/b\/[^/]+$/);
  await expect(page.getByRole("textbox", { name: "Board name" })).toHaveValue("Three-tier web app");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await expect(page.getByTestId("node-pg")).toHaveAttribute("data-sim", "saturated");
});

test("Open file rejects a file that isn't a board, without echoing it", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("open-file").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"secret":"do-not-echo"}') });
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toHaveText("That file isn't an Archie board export.");
  await expect(alert).not.toContainText("do-not-echo");
  await expect(page).toHaveURL(/\/$/);
});

test("the Export menu works by keyboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "Export is in the ⋯ menu on phones (covered above)");
  await openThreeTier(page);
  await page.getByRole("button", { name: "Export" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: LABEL.json })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: LABEL.mermaid })).toBeFocused();
  const download = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  expect((await download).suggestedFilename()).toMatch(/\.mmd$/);
  await page.getByRole("button", { name: "Export" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export" })).toBeFocused();
});

for (const scheme of ["light", "dark"] as const) {
  test(`axe: Export menu open, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openThreeTier(page);
    const more = page.getByRole("button", { name: "More actions" });
    if (await more.isVisible()) await more.click();
    else await page.getByRole("button", { name: "Export" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .exclude(".react-flow__handle")
      .analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
