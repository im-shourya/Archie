import { expect, test, type Page, type Route } from "@playwright/test";

/** Chat panel and conversation memory (docs/17 · Chat, docs/12 · Conversation memory). /api/command is mocked. */

test.skip(({ isMobile }) => isMobile, "the side panel lives in the bottom sheet on phones; covered on desktop");

const bar = (page: Page) => page.getByRole("textbox", { name: "Command" });
const log = (page: Page) => page.getByTestId("chat-log");

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

async function say(page: Page, text: string) {
  await bar(page).fill(text);
  await bar(page).press("Enter");
}

interface Sent {
  utterance: string;
  baseVersion: number;
  conversation?: { role: string; text: string }[];
}

function respond(route: Route, body: Record<string, unknown>) {
  const sent = route.request().postDataJSON() as Sent;
  return route.fulfill({
    json: {
      ops: [],
      message: "",
      options: [],
      focusNodeIds: [],
      baseVersion: sent.baseVersion,
      attempts: 1,
      model: "test",
      timings: { totalMs: 900, llmMs: 800 },
      ...body,
    },
  });
}

test("logs commands and replies, and keeps them after a reload", async ({ page }) => {
  await openThreeTier(page);
  await say(page, "kill redis");
  await page.getByRole("tab", { name: "Chat" }).click();
  await expect(log(page).locator("li[data-role=user]")).toHaveText(/kill redis/);
  await expect(log(page).locator("li[data-role=assistant]")).toContainText("local · changed the board");

  await page.waitForTimeout(800); // debounced save
  await page.reload();
  await page.getByRole("tab", { name: "Chat" }).click();
  await expect(log(page).locator("li")).toHaveCount(3); // two turns + the scroll anchor
});

test("sends earlier turns to the AI as conversation", async ({ page }) => {
  const calls: Sent[] = [];
  await page.route("**/api/command", (route) => {
    calls.push(route.request().postDataJSON() as Sent);
    return calls.length === 1
      ? respond(route, { kind: "answer", message: "Postgres is the bottleneck at ρ 0.91.", focusNodeIds: ["pg"] })
      : respond(route, { kind: "ops", ops: [{ type: "replicate", id: "pg", replicas: 3 }], message: "Scaled Postgres to 3." });
  });
  await openThreeTier(page);
  await say(page, "what's the bottleneck right now?");
  await expect(page.getByTestId("answer")).toBeVisible();
  await say(page, "fix that please");
  await expect(page.getByRole("status").filter({ hasText: "Scaled Postgres to 3." })).toBeVisible();

  expect(calls[0]!.conversation).toBeUndefined();
  expect(calls[1]!.conversation).toEqual([
    { role: "user", text: "what's the bottleneck right now?" },
    { role: "assistant", text: "Postgres is the bottleneck at ρ 0.91." },
  ]);

  await page.getByRole("tab", { name: "Chat" }).click();
  await expect(log(page)).toContainText("AI · answer");
  await expect(log(page)).toContainText("AI · changed the board");
});

test("the chat box runs commands through the same pipeline", async ({ page }) => {
  await openThreeTier(page);
  await page.getByRole("tab", { name: "Chat" }).click();
  const box = page.getByRole("textbox", { name: "Chat message" });
  await box.fill("kill redis");
  await box.press("Enter");
  await expect(page.locator('[data-testid="node-redis"][data-status="down"]')).toBeVisible();
  await expect(box).toHaveValue("");
  await expect(log(page).locator("li[data-role=assistant]")).toHaveCount(1);
});

test("clearing the chat asks first", async ({ page }) => {
  await openThreeTier(page);
  await say(page, "kill redis");
  await page.getByRole("tab", { name: "Chat" }).click();
  await page.getByRole("button", { name: "Clear chat" }).click();
  await expect(log(page)).toBeVisible();
  await page.getByRole("button", { name: "Clear chat" }).click();
  await expect(log(page)).toHaveCount(0);
  await expect(page.getByText("Ask about your design")).toBeVisible();
});
