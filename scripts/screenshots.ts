/**
 * Visual QA sweep (docs/33 Step 8, docs/34 Step 10). Captures Home, the board, the Inspector,
 * the AI panels, interview mode, the scorecard, review, share, export and replay at 360, 768, 1280 and 1440 px in light
 * and dark, and refreshes the README images in docs/assets. AI routes are mocked: no quota used. Run against a running app (production build recommended):
 *
 *   npm run build && npm start -- -p 3200
 *   npx tsx scripts/screenshots.ts --base http://localhost:3200 [--out <dir>] [--readme]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import LZString from "lz-string";
import { buildTemplate } from "@archie/simulator";

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

async function mockInterview(page: Page) {
  await page.route("**/api/interview/turn", (route) =>
    route.fulfill({
      json: {
        question:
          "Your reads all hit the database. What happens at forty thousand requests a second?",
        focusNodeIds: ["api", "db"],
        checks: [],
        source: "ai",
        done: false,
        model: "screenshot",
        timings: {},
      },
    }),
  );
  await page.route("**/api/interview/score", (route) =>
    route.fulfill({
      json: {
        overall: 3.4,
        summary:
          "A solid read path with a CDN and cache. Make the cache redundant and bring the cost under budget.",
        rubric: [
          {
            dimension: "scalability",
            score: 4,
            evidence: "Eight API replicas at rho 0.60 leave headroom at peak.",
            nodeIds: ["api"],
            unsupported: false,
          },
          {
            dimension: "availability",
            score: 2,
            evidence: "Redis is a single instance; losing it drops success sharply.",
            nodeIds: ["redis"],
            unsupported: false,
          },
          { dimension: "data-modelling", score: 3, evidence: "", nodeIds: [], unsupported: true },
          {
            dimension: "trade-offs",
            score: 4,
            evidence: "Chose a CDN over more API replicas, which is cheaper per request.",
            nodeIds: ["api"],
            unsupported: false,
          },
          {
            dimension: "communication",
            score: 4,
            evidence: "Answered each question directly and with numbers.",
            nodeIds: [],
            unsupported: false,
          },
        ],
      },
    }),
  );
  await page.route("**/api/review", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "LLM_UNAVAILABLE", message: "offline" } },
    }),
  );
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

    // Chat: a question, an answer that cites the simulator, then a follow-up that relies on it.
    const cc = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const cp = await cc.newPage();
    let call = 0;
    await cp.route("**/api/command", (route) => {
      const sent = route.request().postDataJSON() as { baseVersion: number };
      call += 1;
      const reply =
        call === 1
          ? {
              kind: "answer",
              ops: [],
              message:
                "Postgres (primary) is the bottleneck at ρ 1.40: 9,500 reads/s + 5,000 writes/s on one shard. Sharding it into two brings ρ to 0.70.",
              focusNodeIds: ["pg"],
            }
          : {
              kind: "ops",
              ops: [{ type: "updateNode", id: "pg", props: { shards: 2 } }],
              message: "Sharded Postgres (primary) into 2, as discussed.",
              focusNodeIds: ["pg"],
            };
      return route.fulfill({
        json: { options: [], attempts: 1, model: "screenshot", timings: { totalMs: 1400, llmMs: 1380 }, baseVersion: sent.baseVersion, ...reply },
      });
    });
    await openThreeTier(cp);
    const chatBar = cp.getByRole("textbox", { name: "Command" });
    for (const text of ["Add a queue called Kafka.", "What's the bottleneck right now?", "Do what you suggested."]) {
      await chatBar.fill(text);
      await chatBar.press("Enter");
      await cp.waitForTimeout(700);
    }
    await cp.getByRole("button", { name: "Dismiss answer" }).click().catch(() => {});
    await cp.getByRole("tab", { name: "Chat" }).click();
    await cp.waitForTimeout(500);
    await cp.screenshot({ path: join(ASSETS, "board-chat.png") });
    await cc.close();

    // Interview mode: three-tier against the URL shortener, one answered question, then the scorecard.
    const iv = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const ip = await iv.newPage();
    await mockInterview(ip);
    await ip.goto(`${base}/b/new?problem=url-shortener`);
    await ip.getByTestId("interview").waitFor();
    await ip.route("**/api/command", (route) => {
      const sent = route.request().postDataJSON() as { baseVersion: number };
      return route.fulfill({
        json: {
          kind: "ops",
          ops: [
            { type: "addNode", id: "client", kind: "client", label: "Users" },
            {
              type: "addNode",
              id: "lb",
              kind: "lb",
              label: "Load balancer",
              props: { replicas: 2 },
            },
            {
              type: "addNode",
              id: "api",
              kind: "service",
              label: "Shortener API",
              props: { replicas: 8 },
            },
            {
              type: "addNode",
              id: "redis",
              kind: "cache",
              label: "Redis",
              props: { hitRate: 0.9 },
            },
            {
              type: "addNode",
              id: "db",
              kind: "sql",
              label: "Links DB",
              props: { role: "primary", failover: true },
            },
            {
              type: "addNode",
              id: "db-r1",
              kind: "sql",
              label: "Links replica",
              props: { role: "replica" },
            },
            { type: "connect", from: "client", to: "lb" },
            { type: "connect", from: "lb", to: "api" },
            { type: "connect", from: "api", to: "redis", traffic: "read" },
            { type: "connect", from: "api", to: "db" },
            { type: "connect", from: "db", to: "db-r1", kind: "replication", traffic: "write" },
          ],
          message: "Built it.",
          options: [],
          focusNodeIds: [],
          baseVersion: sent.baseVersion,
          attempts: 1,
          model: "screenshot",
          timings: { totalMs: 1 },
        },
      });
    });
    const command = ip.getByRole("textbox", { name: "Command" });
    await command.fill(
      "users hit a load balancer in front of eight API servers with Redis and a replicated Postgres",
    );
    await command.press("Enter");
    await ip.locator(".react-flow__node").nth(5).waitFor();
    const answer = ip.getByRole("textbox", { name: "Your answer" });
    await answer.fill(
      "Reads go through the load balancer to the API, which checks Redis before the database.",
    );
    await answer.press("Enter");
    await ip.getByText("What happens at forty thousand").waitFor();
    await ip.waitForTimeout(600);
    await ip.screenshot({ path: join(ASSETS, "board-interview.png") });
    await ip.getByRole("button", { name: "Finish" }).first().click();
    await ip.getByRole("dialog").getByRole("button", { name: "Finish" }).click();
    await ip.getByTestId("scorecard").getByRole("meter").first().waitFor();
    await ip.waitForTimeout(400);
    await ip.screenshot({ path: join(ASSETS, "board-scorecard.png") });
    await iv.close();

    const rv = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const rp = await rv.newPage();
    await mockInterview(rp);
    await openThreeTier(rp);
    await rp.getByRole("button", { name: "Review" }).click();
    await rp.getByTestId("finding-rule:spof:redis").waitFor();
    await rp.waitForTimeout(400);
    await rp.screenshot({ path: join(ASSETS, "board-review.png") });
    await rv.close();

    // Phase 7: a shared read-only board, the Export menu, and replay mid-session.
    const sv = await browser.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
    const sp = await sv.newPage();
    // The share link format (docs/17): v1: + lz-string of { name, graph }. lz-string is CommonJS,
    // so it's built here rather than through @archie/database's named import.
    const link = `v1:${LZString.compressToEncodedURIComponent(JSON.stringify({ name: "Checkout at 50k rps", graph: buildTemplate("three-tier") }))}`;
    await sp.goto(`${base}/s#${link}`);
    await sp.locator(".react-flow__node").nth(6).waitFor();
    await sp.waitForTimeout(700);
    await sp.screenshot({ path: join(ASSETS, "board-shared.png") });

    await openThreeTier(sp);
    await sp.getByRole("button", { name: "Export" }).click();
    await sp.getByRole("menu", { name: "Export" }).waitFor();
    await sp.waitForTimeout(200);
    await sp.screenshot({ path: join(ASSETS, "board-export.png") });
    await sp.keyboard.press("Escape");

    const say = async (text: string) => {
      const bar = sp.getByRole("textbox", { name: "Command" });
      await bar.fill(text);
      await bar.press("Enter");
      await sp.waitForTimeout(300);
    };
    await say("Kill Redis.");
    await say("Shard Postgres into two.");
    await say("Bring Redis back.");
    await sp.getByRole("tab", { name: "History" }).click();
    await sp.getByRole("link", { name: "Replay this session" }).click();
    await sp.getByRole("slider", { name: "Replay step" }).fill("2");
    await sp.waitForTimeout(700);
    await sp.screenshot({ path: join(ASSETS, "board-replay.png") });
    await sv.close();

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
