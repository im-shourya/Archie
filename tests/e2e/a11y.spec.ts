import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Accessibility gate (NFR-012, docs/33 Step 6): axe with WCAG 2.2 A/AA rules must report no
 * serious or critical violation in any state, in light and dark, on desktop and Pixel 7.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    // React Flow's off-screen aria-live helper and its hidden connection handles are library
    // internals (not focusable, not visible); everything else is ours.
    .exclude(".react-flow__handle")
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const report = blocking.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).join("\n  ")}`,
  );
  expect(report, report.join("\n\n")).toEqual([]);
}

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

async function say(page: Page, text: string) {
  const bar = page.getByRole("textbox", { name: "Command" });
  await bar.fill(text);
  await bar.press("Enter");
}

function respond(route: Route, body: Record<string, unknown>) {
  const sent = route.request().postDataJSON() as { baseVersion: number };
  return route.fulfill({
    json: {
      ops: [],
      message: "",
      options: [],
      focusNodeIds: [],
      baseVersion: sent.baseVersion,
      attempts: 1,
      model: "test",
      timings: { totalMs: 900, llmMs: 880 },
      ...body,
    },
  });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test("Home", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await audit(page);
    });

    test("empty board", async ({ page }) => {
      await page.goto("/b/new");
      await expect(page.getByRole("heading", { name: "Describe your system" })).toBeVisible();
      await audit(page);
    });

    test("three-tier board with the metrics panel", async ({ page, isMobile }) => {
      await openThreeTier(page);
      if (isMobile) await page.getByRole("button", { name: "Expand panel" }).click();
      await expect(page.getByTestId("metrics")).toBeVisible();
      await audit(page);
    });

    test("Inspector", async ({ page }) => {
      await openThreeTier(page);
      await page.getByTestId("node-redis").click();
      await expect(page.getByRole("region", { name: "Inspector" })).toBeVisible();
      await audit(page);
    });

    test("clarify chips", async ({ page }) => {
      await page.route("**/api/command", (r) =>
        respond(r, {
          kind: "clarify",
          message: "Which database?",
          options: ["Postgres", "Replica 1"],
          focusNodeIds: ["pg"],
        }),
      );
      await openThreeTier(page);
      await say(page, "make the database bigger");
      await expect(page.getByRole("button", { name: /Postgres/ })).toBeVisible();
      await audit(page);
    });

    test("answer card", async ({ page }) => {
      await page.route("**/api/command", (r) =>
        respond(r, {
          kind: "answer",
          message: "Postgres is the bottleneck at ρ 1.40.",
          focusNodeIds: ["pg"],
        }),
      );
      await openThreeTier(page);
      await say(page, "why is it slow");
      await expect(page.getByText("Postgres is the bottleneck at ρ 1.40.")).toBeVisible();
      await audit(page);
    });

    test("confirm dialog", async ({ page }) => {
      await page.route("**/api/command", (r) =>
        respond(r, {
          kind: "confirm",
          message: "Remove Redis and its connection?",
          ops: [{ type: "removeNode", id: "redis" }],
        }),
      );
      await openThreeTier(page);
      await say(page, "tidy up the caching layer please");
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await audit(page);
    });

    test("interview problem picker", async ({ page }) => {
      await page.goto("/interview");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await audit(page);
    });

    test("interview panel", async ({ page, isMobile }) => {
      await page.goto("/b/new?problem=url-shortener");
      await expect(page).toHaveURL(/\/b\/[0-9a-z]+$/);
      if (isMobile) await page.getByRole("button", { name: "Expand panel" }).click();
      await expect(page.getByTestId("interview")).toBeVisible();
      await expect(page.getByTestId("slo-count")).toHaveText("0 of 6 passing");
      await audit(page);
    });

    test("scorecard", async ({ page, isMobile }) => {
      test.skip(isMobile, "Finish is in the ⋯ menu on phones");
      await page.route("**/api/interview/score", (r) =>
        r.fulfill({
          json: {
            checks: [],
            overall: 3.4,
            summary: "Solid.",
            rubric: [
              "scalability",
              "availability",
              "data-modelling",
              "trade-offs",
              "communication",
            ].map((dimension, i) => ({
              dimension,
              score: 3 + (i % 2),
              evidence: "Evidence sentence for this dimension.",
              nodeIds: [],
              unsupported: i === 2,
            })),
          },
        }),
      );
      await page.goto("/b/new?problem=url-shortener");
      await page.getByRole("button", { name: "Finish" }).first().click();
      await page.getByRole("dialog").getByRole("button", { name: "Finish" }).click();
      await expect(page.getByTestId("scorecard").getByRole("meter")).toHaveCount(5);
      await audit(page);
    });

    test("review panel", async ({ page, isMobile }) => {
      await page.route("**/api/review", (r) => r.fulfill({ status: 503, json: { error: { code: "LLM_UNAVAILABLE", message: "x" } } }));
      await openThreeTier(page);
      if (isMobile) {
        await page.getByRole("button", { name: "More actions" }).click();
        await page.getByRole("menuitem", { name: "Review design" }).click();
      } else {
        await page.getByRole("button", { name: "Review" }).click();
      }
      await expect(page.getByTestId("finding-rule:spof:redis")).toBeVisible();
      await audit(page);
    });

    test("access-code dialog", async ({ page }) => {
      await page.route("**/api/command", (r) =>
        r.fulfill({ status: 401, json: { error: { code: "ACCESS_CODE_REQUIRED", message: "x" } } }),
      );
      await openThreeTier(page);
      await say(page, "add a queue");
      await expect(page.getByRole("dialog")).toBeVisible();
      await audit(page);
    });
  });
}

test("keyboard-only journey: bar → command → canvas → Inspector edit → Escape back", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "keyboard journey is a desktop flow");
  await openThreeTier(page);

  await page.keyboard.press("/");
  const bar = page.getByRole("textbox", { name: "Command" });
  await expect(bar).toBeFocused();
  await page.keyboard.type("Kill Redis.");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-status", "down");

  // Tab forward from the bar's neighbourhood until a canvas node has focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  let onNode = false;
  for (let i = 0; i < 40 && !onNode; i++) {
    await page.keyboard.press("Tab");
    onNode = await page.evaluate(
      () => !!document.activeElement?.classList.contains("react-flow__node"),
    );
  }
  expect(onNode).toBe(true);
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(ring).not.toBe("none");

  await page.keyboard.press("Enter");
  const inspector = page.getByRole("region", { name: "Inspector" });
  await expect(inspector.getByRole("heading", { level: 3 })).toBeFocused();
  const nodeName = await inspector.getByRole("heading", { level: 3 }).textContent();

  // Tab to the label field and rename by keyboard.
  const label = inspector.getByLabel("Label");
  for (let i = 0; i < 5 && !(await label.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(label).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(`${nodeName} edge`);
  await page.keyboard.press("Enter");
  await expect(inspector.getByRole("heading", { level: 3 })).toHaveText(`${nodeName} edge`);

  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page.evaluate(() => !!document.activeElement?.classList.contains("react-flow__node")),
    )
    .toBe(true);
});

test("live regions: toasts are polite, errors assertive", async ({ page }) => {
  await page.route("**/api/command", (r) =>
    r.fulfill({
      status: 500,
      json: { error: { code: "INTERNAL", message: "The AI is unavailable right now." } },
    }),
  );
  await openThreeTier(page);
  await say(page, "Kill Redis.");
  await expect(page.getByRole("status").filter({ hasText: "Took down Redis" })).toBeVisible();
  await say(page, "add a search cluster behind the api");
  await expect(page.getByRole("alert").filter({ hasText: "unavailable" })).toBeVisible();
});
