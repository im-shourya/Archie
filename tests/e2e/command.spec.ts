import { expect, test, type Page } from "@playwright/test";

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

const bar = (page: Page) => page.getByRole("textbox", { name: "Command" });

async function say(page: Page, text: string) {
  await bar(page).fill(text);
  await bar(page).press("Enter");
}

test("dictated fast-path commands change the board instantly (F-01, F-02)", async ({ page }) => {
  await openThreeTier(page);

  await say(page, "Kill Redis.");
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-status", "down");
  await expect(page.getByTestId("latency-badge")).toContainText("local ·");
  await expect(page.getByRole("status").filter({ hasText: "Took down Redis" })).toBeVisible();
  await expect(bar(page)).toHaveValue("");

  await say(page, "Bring it back.");
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-status", "up");

  await say(page, "Five replicas of the API.");
  await expect(page.getByTestId("node-api")).toContainText("×5");

  await say(page, "Send fifty thousand requests a second, ninety percent reads.");
  await expect(page.getByRole("status").filter({ hasText: "Workload: 50,000 rps · 90% reads" })).toBeVisible();

  await say(page, "undo");
  await say(page, "undo");
  await expect(page.getByTestId("node-api")).toContainText("×30");
});

test("fast-path misses go to the AI instead of being guessed locally", async ({ page }) => {
  const sent: string[] = [];
  await page.route("**/api/command", async (route) => {
    sent.push((route.request().postDataJSON() as { utterance: string }).utterance);
    await route.fulfill({ status: 503, json: { error: { code: "LLM_UNAVAILABLE", message: "Couldn't reach the AI." } } });
  });
  await openThreeTier(page);
  await say(page, "kill redis and postgres");
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't reach the AI." })).toBeVisible();
  expect(sent).toEqual(["kill redis and postgres"]);
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-status", "up");
  await expect(page.getByTestId("node-pg")).toHaveAttribute("data-status", "up");
  await expect(bar(page)).toHaveValue("kill redis and postgres");
});

test("toast Undo reverts the last command", async ({ page }) => {
  await openThreeTier(page);
  await say(page, "shard postgres into two");
  await expect(page.getByTestId("node-pg")).toContainText("2 shards");
  await page.getByRole("button", { name: "Undo" }).last().click();
  await expect(page.getByTestId("node-pg")).not.toContainText("2 shards");
});

test("hands-free sends the command once dictation settles", async ({ page }) => {
  await openThreeTier(page);
  const toggle = page.getByRole("button", { name: /Hands-free/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await bar(page).fill("kill the load balancer");
  await expect(page.getByRole("img", { name: "Sending when you stop talking" })).toBeVisible();
  await expect(page.getByTestId("node-lb")).toHaveAttribute("data-status", "down", { timeout: 4000 });
});

test("slash focuses the command bar and ↑ recalls history", async ({ page }) => {
  await openThreeTier(page);
  await say(page, "kill redis");
  await page.locator(".react-flow__pane").click();
  await page.keyboard.press("/");
  await expect(bar(page)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(bar(page)).toHaveValue("kill redis");
});
