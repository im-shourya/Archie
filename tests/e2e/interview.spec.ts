import { expect, test, type Page, type Route } from "@playwright/test";
import { REFERENCE_DESIGNS } from "@archie/simulator/references";

/** Interview mode (F-10, UF-10, docs/34 Step 6). Every AI route is mocked. */

const panel = (page: Page) => page.getByTestId("interview");
const bar = (page: Page) => page.getByRole("textbox", { name: "Command" });

async function start(page: Page, problem = "url-shortener") {
  await page.goto("/interview");
  await page.getByRole("link", { name: /Design a URL shortener/ }).click();
  await expect(page).toHaveURL(/\/b\/[0-9a-z]+$/);
  if (problem !== "url-shortener") throw new Error("only the URL shortener is wired here");
}

async function openPanel(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Expand panel" }).click();
  await expect(panel(page)).toBeVisible();
}

/** Build the problem's reference design through the AI tier (mocked to return its ops). */
async function buildReference(page: Page) {
  await page.route("**/api/command", (route: Route) => {
    const sent = route.request().postDataJSON() as { baseVersion: number };
    return route.fulfill({
      json: {
        kind: "ops",
        ops: REFERENCE_DESIGNS["url-shortener"],
        message: "Built the design.",
        options: [],
        focusNodeIds: [],
        baseVersion: sent.baseVersion,
        attempts: 1,
        model: "test",
        timings: { totalMs: 900, llmMs: 880 },
      },
    });
  });
  await bar(page).fill("build a url shortener with a cdn, cache and a replicated database");
  await bar(page).press("Enter");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

function mockTurn(
  page: Page,
  reply: (call: number, body: { transcript: { role: string; text: string }[] }) => object | number,
) {
  const calls: { transcript: { role: string; text: string }[]; changes?: string[] }[] = [];
  void page.route("**/api/interview/turn", (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const out = reply(calls.length, body);
    if (typeof out === "number")
      return route.fulfill({
        status: out,
        json: { error: { code: "LLM_UPSTREAM", message: "x" } },
      });
    return route.fulfill({ json: { checks: [], done: false, model: "test", timings: {}, ...out } });
  });
  return calls;
}

test("pick a problem: interview board with failing checks and a free first question", async ({
  page,
  isMobile,
}) => {
  const calls = mockTurn(page, () => ({ question: "unused", focusNodeIds: [], source: "ai" }));
  await start(page);
  await openPanel(page, isMobile);
  await expect(page.getByRole("tab", { name: "Interview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("Interview ·")).toBeVisible();
  await expect(page.getByTestId("slo-count")).toHaveText("0 of 6 passing");
  await expect(page.getByTestId("check-availability")).toContainText("no clients yet");
  await expect(page.getByTestId("question")).toHaveText(/where does the request go first/);
  await expect(panel(page)).toContainText("Interviewer · from the problem");
  expect(calls).toHaveLength(0);
});

test("checks turn green live as the design changes", async ({ page, isMobile }) => {
  await start(page);
  await buildReference(page);
  await openPanel(page, isMobile);
  await expect(page.getByTestId("slo-count")).toHaveText("6 of 6 passing");
  await expect(page.getByTestId("check-spof")).toHaveAttribute("data-state", "pass");
  // Lowering the workload can't change a check: they run at the problem's peak.
  await bar(page).fill("send ten requests a second");
  await bar(page).press("Enter");
  await expect(page.getByTestId("slo-count")).toHaveText("6 of 6 passing");
});

test("answering asks exactly one AI question, with the transcript and recent changes", async ({
  page,
  isMobile,
}) => {
  const calls = mockTurn(page, () => ({
    question: "Your redirects all go through the CDN. What happens when it misses?",
    focusNodeIds: ["cdn"],
    source: "ai",
  }));
  await start(page);
  await buildReference(page);
  await openPanel(page, isMobile);
  const answer = page.getByRole("textbox", { name: "Your answer" });
  await answer.fill("Reads go to the CDN first, then the API and Redis.");
  await answer.press("Enter");
  await expect(page.getByTestId("question")).toHaveText(/What happens when it misses/);
  await expect(panel(page)).toContainText("AI · Interviewer");
  await expect(panel(page).getByRole("button", { name: "CDN" })).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0]!.transcript.at(-1)).toEqual({
    role: "candidate",
    text: "Reads go to the CDN first, then the API and Redis.",
  });
  expect(calls[0]!.changes?.some((c) => c.includes("url shortener"))).toBe(true);
  await expect(answer).toHaveValue("");
});

test("with the AI down, the next question is an offline hint", async ({ page, isMobile }) => {
  mockTurn(page, () => 502);
  await start(page);
  await openPanel(page, isMobile);
  await panel(page).getByRole("button", { name: "Next question" }).click();
  await expect(panel(page)).toContainText("offline question");
  await expect(page.getByTestId("question")).not.toHaveText(/where does the request go first/);
});

test("the transcript survives reload", async ({ page, isMobile }) => {
  mockTurn(page, () => ({ question: "What happens at peak?", focusNodeIds: [], source: "ai" }));
  await start(page);
  await openPanel(page, isMobile);
  const answer = page.getByRole("textbox", { name: "Your answer" });
  await answer.fill("It holds.");
  await answer.press("Enter");
  await expect(page.getByTestId("question")).toHaveText("What happens at peak?");
  await page.waitForTimeout(700); // debounced save
  await page.reload();
  await openPanel(page, isMobile);
  await expect(page.getByTestId("question")).toHaveText("What happens at peak?");
  await panel(page)
    .getByRole("button", { name: /Transcript/ })
    .click();
  await expect(panel(page).getByRole("listitem").filter({ hasText: "It holds." })).toBeVisible();
});

test("after 8 AI questions, Next question is disabled", async ({ page, isMobile }) => {
  mockTurn(page, (n) => ({ question: `Question ${n}?`, focusNodeIds: [], source: "ai" }));
  await start(page);
  await openPanel(page, isMobile);
  const next = panel(page).getByRole("button", { name: "Next question" });
  for (let i = 1; i <= 8; i++) {
    await next.click();
    await expect(page.getByTestId("question")).toHaveText(`Question ${i}?`);
  }
  await expect(next).toBeDisabled();
  await expect(panel(page)).toContainText("That’s all the questions");
});

test("phones: the sheet's peek shows the SLO count", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout only");
  await start(page);
  await expect(page.getByTestId("sheet-peek")).toContainText("SLOs 0 of 6 passing");
});
