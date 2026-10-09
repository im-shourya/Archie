import { expect, test, type Page, type Route } from "@playwright/test";

/** Design review (FR-054, UF-11, docs/34 Step 8). /api/review is mocked. */

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

const review = (page: Page) => page.getByTestId("review");

async function openReview(page: Page) {
  const more = page.getByRole("button", { name: "More actions" });
  if (await more.isVisible()) {
    await more.click();
    await page.getByRole("menuitem", { name: "Review design" }).click();
  } else {
    await page.getByRole("button", { name: "Review" }).click();
  }
  await expect(review(page)).toBeVisible();
}

/** Server reply: the rules plus one AI finding (with a fix) and one AI finding without a valid fix. */
function mockReview(page: Page, mode: "ok" | "down" = "ok") {
  return page.route("**/api/review", async (route: Route) => {
    if (mode === "down")
      return route.fulfill({
        status: 503,
        json: { error: { code: "LLM_UNAVAILABLE", message: "x" } },
      });
    const { graph } = route.request().postDataJSON() as { graph: unknown };
    const { ruleFindings } = await import("@archie/simulator");
    const rules = ruleFindings(graph as never);
    return route.fulfill({
      json: {
        aiAvailable: true,
        model: "test",
        timings: {},
        findings: [
          ...rules,
          {
            id: "ai:0",
            severity: "medium",
            nodeIds: ["api", "lb"],
            title: "Deploys drop capacity",
            detail: "Rolling deploys take an API replica out at 0.67 utilization.",
            fix: null,
            source: "ai",
          },
        ].slice(0, 6),
      },
    });
  });
}

test("review: rule findings sorted by severity, AI findings marked", async ({ page }) => {
  await mockReview(page);
  await openThreeTier(page);
  await openReview(page);
  await expect(review(page).getByRole("heading", { name: "Review" })).toBeFocused();
  const cards = review(page).getByRole("listitem");
  await expect(cards.first()).toHaveAttribute("data-severity", "high");
  await expect(review(page).getByTestId("finding-rule:spof:redis")).toContainText(
    "Redis is a single point of failure",
  );
  await expect(review(page).getByTestId("finding-ai:0")).toContainText("AI");
  await expect(
    review(page).getByTestId("finding-ai:0").getByRole("button", { name: "Apply fix" }),
  ).toHaveCount(0);
});

test("Apply fix on the Redis SPOF: badge gone, finding resolved; Undo brings both back", async ({
  page,
}) => {
  await mockReview(page);
  await openThreeTier(page);
  await expect(page.getByTestId("spof-redis")).toBeVisible();
  await openReview(page);
  const card = review(page).getByTestId("finding-rule:spof:redis");
  await card.getByRole("button", { name: "Apply fix" }).click();
  await expect(page.getByTestId("spof-redis")).toHaveCount(0);
  await expect(card).toContainText("Resolved: Redis is a single point of failure");
  await expect(
    page.getByRole("status").filter({ hasText: "Applied: Run 2 instances of Redis" }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("spof-redis")).toBeVisible();
  await expect(card.getByRole("button", { name: "Apply fix" })).toBeVisible();
});

test("with the AI down, rule findings still show, labelled", async ({ page }) => {
  await mockReview(page, "down");
  await openThreeTier(page);
  await openReview(page);
  await expect(review(page)).toContainText(
    "AI review unavailable: showing rule-based findings only.",
  );
  await expect(review(page).getByTestId("finding-rule:spof:redis")).toBeVisible();
});

test("R opens review on desktop; choosing a tab closes it", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard shortcut");
  await mockReview(page);
  await openThreeTier(page);
  await page.locator("body").click({ position: { x: 5, y: 60 } });
  await page.keyboard.press("r");
  await expect(review(page)).toBeVisible();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(review(page)).toHaveCount(0);
});

test("phones: the ⋯ menu works by keyboard", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  await openThreeTier(page);
  const more = page.getByRole("button", { name: "More actions" });
  await more.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Review design" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Share link" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Rename board" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(more).toBeFocused();
});
