/**
 * Visual QA sweep (docs/33 Step 8). Captures Home, the board, the Inspector, the AI panels and
 * the phone sheet at 360, 768, 1280 and 1440 px in light and dark, and refreshes the README
 * images in docs/assets. Run against a running app (production build recommended):
 *
 *   npm run build && npm start -- -p 3200
 *   npx tsx scripts/screenshots.ts --base http://localhost:3200 [--out <dir>] [--readme]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const base = arg("--base", "http://localhost:3200");
const out = arg("--out", "test-results/screenshots");
const readme = args.includes("--readme");
const ASSETS = join(import.meta.dirname, "../docs/assets");

const WIDTHS = [360, 768, 1280, 1440];
const HEIGHT = { 360: 780, 768: 1024, 1280: 800, 1440: 900 } as Record<number, number>;

async function openThreeTier(page: Page) {
  await page.goto(`${base}/b/new?template=three-tier`);
  await page.locator(".react-flow__node").nth(6).waitFor();
  await page.waitForTimeout(700); // layout + fit animation
}

async function mockAnswer(page: Page) {
  await page.route("**/api/command", (route) => {
    const sent = route.request().postDataJSON() as { baseVersion: number };
    return route.fulfill({
      json: {
        kind: "answer",
        ops: [],
        message:
          "Postgres (primary) is the bottleneck: 9,500 reads/s + 5,000 writes/s on one shard gives ρ 1.40, so 28.6% of its requests are dropped. Sharding it into two brings ρ to 0.70.",
        options: [],
        focusNodeIds: ["pg"],
        baseVersion: sent.baseVersion,
        attempts: 1,
        model: "screenshot",
        timings: { totalMs: 1400, llmMs: 1380 },
      },
    });
  });
}

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const scheme of ["light", "dark"] as const) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: HEIGHT[width]! },
        colorScheme: scheme,
        deviceScaleFactor: 2,
        hasTouch: width < 768,
        isMobile: width < 768,
      });
      const page = await context.newPage();
      const shot = (name: string) =>
        page.screenshot({ path: join(out, `${name}-${width}-${scheme}.png`) });

      await page.goto(base);
      await page.waitForLoadState("networkidle");
      await shot("home");

      await openThreeTier(page);
      await shot("board");

      await page.getByTestId("node-api").click();
      await page.waitForTimeout(400);
      await shot("inspector");

      await mockAnswer(page);
      await page.keyboard.press("Escape");
      const bar = page.getByRole("textbox", { name: "Command" });
      await bar.fill("why is the board slow");
      await bar.press("Enter");
      await page.getByText("Postgres (primary) is the bottleneck").waitFor();
      await shot("answer");
      await context.close();
    }
  }

  if (readme) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 860 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await openThreeTier(page);
    await page.screenshot({ path: join(ASSETS, "board-bottleneck.png") });

    const bar = page.getByRole("textbox", { name: "Command" });
    await bar.fill("Kill Redis.");
    await bar.press("Enter");
    await page.getByRole("region", { name: /Blast radius/ }).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(ASSETS, "board-blast-radius.png") });

    // Inspector on the failed component (Recover button, "down" status, its explanation).
    await page.getByTestId("node-redis").click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(ASSETS, "board-inspector.png") });
    await context.close();

    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const p = await phone.newPage();
    await openThreeTier(p);
    await p.getByRole("button", { name: "Expand panel" }).click();
    await p.waitForTimeout(400);
    await p.screenshot({ path: join(ASSETS, "board-phone.png") });
    await phone.close();
  }
  await browser.close();
  console.log(`Screenshots in ${out}${readme ? " and docs/assets" : ""}`);
}

await main();
