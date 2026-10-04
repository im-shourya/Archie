import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import LZString from "lz-string";
import { buildTemplate } from "@archie/simulator";

/** Connect and disconnect on the canvas itself: drag between handles, select a connection to remove it. */

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await expect(page.locator(".react-flow__edge")).toHaveCount(6);
  // The canvas animates its fit-to-view after layout; wait until the nodes stop moving.
  const node = page.locator('.react-flow__node[data-id="pg"]');
  let last = "";
  for (let i = 0; i < 20; i++) {
    const box = JSON.stringify(await node.boundingBox());
    if (box === last) break;
    last = box;
    await page.waitForTimeout(150);
  }
}

const handle = (page: Page, id: string, type: "source" | "target") =>
  page.locator(`.react-flow__node[data-id="${id}"] .react-flow__handle.${type}`);
const edge = (page: Page, id: string) => page.getByTestId(`rf__edge-${id}`);

/** A real pointer drag (React Flow listens to mouse events, not HTML drag-and-drop). */
async function drag(page: Page, from: string, to: string) {
  const a = await handle(page, from, "source").boundingBox();
  const b = await handle(page, to, "target").boundingBox();
  if (!a || !b) throw new Error("handle not laid out");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
}

test.describe("on an editable board", () => {
  test.skip(({ isMobile }) => isMobile, "pointer drags on the canvas are a desktop interaction; phones use Connect in the Inspector");

  test("dragging from one component to another connects them, with Undo", async ({ page }) => {
    await openThreeTier(page);
    await drag(page, "client", "redis");
    await expect(page.locator(".react-flow__edge")).toHaveCount(7);
    await expect(page.getByText("Connected Users → Redis")).toBeVisible();
    await page.getByTitle("Undo (⌘Z)").click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(6);
  });

  test("a connection that would loop synchronous calls is refused, with the reason", async ({ page }) => {
    await openThreeTier(page);
    await drag(page, "pg", "api"); // api → pg already exists: pg → api would loop
    await expect(page.locator(".react-flow__edge")).toHaveCount(6);
    await expect(page.getByRole("status").filter({ hasText: /cycle|loop/i })).toBeVisible();
  });

  test("select a connection, then × removes it; Undo brings it back", async ({ page }) => {
    await openThreeTier(page);
    await edge(page, "api->redis").click();
    const remove = page.getByRole("button", { name: "Disconnect API → Redis" });
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(5);
    await expect(page.getByText("Disconnected API → Redis")).toBeVisible();
    await page.getByTitle("Undo (⌘Z)").click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(6);
  });

  test("Delete removes the selected connection", async ({ page }) => {
    await openThreeTier(page);
    await edge(page, "lb->api").click();
    await page.keyboard.press("Delete");
    await expect(page.locator(".react-flow__edge")).toHaveCount(5);
    await expect(edge(page, "lb->api")).toHaveCount(0);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`axe with a connection selected, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openThreeTier(page);
      await edge(page, "api->redis").click();
      await expect(page.getByRole("button", { name: "Disconnect API → Redis" })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .exclude(".react-flow__handle")
        .analyze();
      const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }
});

test("a shared, read-only board can't be rewired", async ({ page }) => {
  const link = `v1:${LZString.compressToEncodedURIComponent(JSON.stringify({ name: "Shared", graph: buildTemplate("three-tier") }))}`;
  await page.goto(`/s#${link}`);
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await edge(page, "api->redis").click({ force: true });
  await expect(page.getByRole("button", { name: /^Disconnect / })).toHaveCount(0);
  await expect(page.locator(".react-flow__handle.connectable")).toHaveCount(0);
});
