import { expect, test, type Page, type Route } from "@playwright/test";

/** AI tier of the command bar (docs/32 Step 5). /api/command is always mocked: no real AI in CI. */

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

const bar = (page: Page) => page.getByRole("textbox", { name: "Command" });

async function say(page: Page, text: string) {
  await bar(page).fill(text);
  await bar(page).press("Enter");
}

interface Sent {
  utterance: string;
  baseVersion: number;
}

function respond(route: Route, body: Record<string, unknown>, status = 200) {
  const sent = route.request().postDataJSON() as Sent;
  const payload =
    status === 200
      ? {
          ops: [],
          message: "",
          options: [],
          focusNodeIds: [],
          baseVersion: sent.baseVersion,
          attempts: 1,
          model: "claude-opus-5-5",
          timings: { contextMs: 1, llmMs: 1500, validateMs: 1, totalMs: 1510 },
          ...body,
        }
      : body;
  return route.fulfill({ status, json: payload, headers: { "X-Request-Id": "req-abcdef123456" } });
}

/** Route /api/command to `handler`, recording what the client sent. */
async function mockAi(page: Page, handler: (route: Route, sent: Sent, call: number) => Promise<void> | void) {
  const calls: Sent[] = [];
  await page.route("**/api/command", async (route) => {
    const sent = route.request().postDataJSON() as Sent;
    calls.push(sent);
    await handler(route, sent, calls.length);
  });
  return calls;
}

test("ops: applies the AI edit with an AI badge and undo", async ({ page }) => {
  const calls = await mockAi(page, (route) =>
    respond(route, {
      kind: "ops",
      ops: [{ type: "insertBetween", from: "api", to: "pg", node: { id: "kafka", kind: "queue", label: "Kafka" } }],
      message: "Put Kafka between the API and Postgres.",
      focusNodeIds: ["kafka"],
    }),
  );
  await openThreeTier(page);
  await say(page, "put a queue in front of the writes");

  await expect(page.getByTestId("node-kafka")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Put Kafka between the API and Postgres." })).toBeVisible();
  await expect(bar(page)).toHaveValue("");
  expect(calls[0]).toMatchObject({ utterance: "put a queue in front of the writes", baseVersion: expect.any(Number) });

  await page.getByRole("button", { name: "Undo" }).last().click();
  await expect(page.getByTestId("node-kafka")).toHaveCount(0);
});

test("ops: the latency badge reads AI · seconds", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "the latency badge is desktop-only");
  await mockAi(page, (route) =>
    respond(route, { kind: "ops", ops: [{ type: "replicate", id: "api", replicas: 12 }], message: "Scaled the API." }),
  );
  await openThreeTier(page);
  await say(page, "give the api a dozen boxes");
  await expect(page.getByTestId("latency-badge")).toContainText(/AI · \d+\.\d s/);
});

test("thinking state shows while the AI works", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await mockAi(page, async (route) => {
    await gate;
    await respond(route, { kind: "noop", message: "Nothing to do." });
  });
  await openThreeTier(page);
  await say(page, "hmm let me think about the design");
  await expect(page.getByTestId("latency-badge")).toHaveText("thinking…");
  release();
  await expect(page.getByRole("status").filter({ hasText: "Nothing to do." })).toBeVisible();
});

test("clarify: chips re-send the original with the answer, and nothing changes until ops arrive", async ({ page }) => {
  const calls = await mockAi(page, (route, _sent, call) =>
    call === 1
      ? respond(route, {
          kind: "clarify",
          message: "Which database?",
          options: ["Postgres (primary)", "Postgres replica 1"],
          focusNodeIds: ["pg", "pg-r1"],
        })
      : respond(route, { kind: "ops", ops: [{ type: "connect", from: "lb", to: "pg" }], message: "Connected." }),
  );
  await openThreeTier(page);
  await say(page, "wire the balancer into the data layer");

  const clarify = page.getByTestId("clarify");
  await expect(clarify).toContainText("Which database?");
  await expect(page.getByTestId("node-pg")).toHaveAttribute("data-focus", "true");
  await expect(page.locator(".react-flow__edge")).toHaveCount(6);

  await clarify.getByRole("button", { name: /Postgres \(primary\)/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Connected." })).toBeVisible();
  expect(calls[1]!.utterance).toBe("wire the balancer into the data layer (answer: Postgres (primary))");
  await expect(clarify).toHaveCount(0);
  await expect(page.locator(".react-flow__edge")).toHaveCount(7);
});

test("clarify: answering by number", async ({ page }) => {
  const calls = await mockAi(page, (route, _sent, call) =>
    call === 1
      ? respond(route, { kind: "clarify", message: "Which one?", options: ["Redis", "Postgres"] })
      : respond(route, { kind: "noop", message: "ok" }),
  );
  await openThreeTier(page);
  await say(page, "make the store faster");
  await expect(page.getByTestId("clarify")).toBeVisible();
  await bar(page).fill("");
  await bar(page).press("2");
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1]!.utterance).toBe("make the store faster (answer: Postgres)");
});

test("confirm: Cancel leaves the board, Confirm applies the held ops without a second call", async ({ page }) => {
  const ids = ["client", "lb", "api", "redis", "pg", "pg-r1", "pg-r2"];
  const calls = await mockAi(page, (route) =>
    respond(route, {
      kind: "confirm",
      ops: ids.map((id) => ({ type: "removeNode", id })),
      message: "This removes 7 components. Go ahead?",
      focusNodeIds: ids,
    }),
  );
  await openThreeTier(page);

  await say(page, "clear the board");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("This removes 7 components. Go ahead?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".react-flow__node")).toHaveCount(7);

  await say(page, "clear the board");
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  expect(calls).toHaveLength(2);
});

test("answer: shows a card and highlights its nodes on hover", async ({ page }) => {
  await mockAi(page, (route) =>
    respond(route, { kind: "answer", message: "Postgres is at ρ=0.83, the busiest component.", focusNodeIds: ["pg"] }),
  );
  await openThreeTier(page);
  await say(page, "what's the bottleneck?");
  const card = page.getByTestId("answer");
  await expect(card).toContainText("ρ=0.83");
  await expect(page.getByTestId("node-pg")).not.toHaveAttribute("data-focus", "true");
  await card.hover();
  await expect(page.getByTestId("node-pg")).toHaveAttribute("data-focus", "true");
  await page.getByRole("button", { name: "Dismiss answer" }).click();
  await expect(card).toHaveCount(0);
});

test("noop: toast only, board untouched", async ({ page }) => {
  await mockAi(page, (route) =>
    respond(route, { kind: "noop", message: "I can only help with the design on this board." }),
  );
  await openThreeTier(page);
  await say(page, "what's the weather in Goa");
  await expect(page.getByRole("status").filter({ hasText: "I can only help with the design" })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await expect(bar(page)).toHaveValue("what's the weather in Goa");
});

test("stale board: ops that no longer fit ask the user to repeat", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await mockAi(page, async (route) => {
    await gate;
    await respond(route, { kind: "ops", ops: [{ type: "connect", from: "lb", to: "redis" }], message: "Connected." });
  });
  await openThreeTier(page);
  await say(page, "wire the balancer straight to the cache");
  await expect(page.getByTestId("latency-badge")).toHaveText("thinking…");

  await say(page, "remove redis"); // fast path, while the AI is still thinking
  await expect(page.getByTestId("node-redis")).toHaveCount(0);
  release();
  await expect(page.getByRole("status").filter({ hasText: "The board changed while I was thinking" })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
});

test("stale board: ops that still validate are applied", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await mockAi(page, async (route) => {
    await gate;
    await respond(route, { kind: "ops", ops: [{ type: "replicate", id: "api", replicas: 7 }], message: "Seven API servers." });
  });
  await openThreeTier(page);
  await say(page, "seven api boxes please");
  await say(page, "kill redis");
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-status", "down");
  release();
  await expect(page.getByTestId("node-api")).toContainText("×7");
});

test("errors: toast with Retry and request id; Retry re-sends", async ({ page }) => {
  const calls = await mockAi(page, (route, _sent, call) =>
    call === 1
      ? respond(route, { error: { code: "LLM_UPSTREAM", message: "The AI service returned an error." } }, 502)
      : respond(route, { kind: "ops", ops: [{ type: "replicate", id: "api", replicas: 4 }], message: "Four API servers." }),
  );
  await openThreeTier(page);
  await say(page, "make the api tier sturdier");
  const toast = page.getByRole("alert").filter({ hasText: "The AI service returned an error." });
  await expect(toast).toContainText("ref req-abcd");
  await toast.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("node-api")).toContainText("×4");
  expect(calls.map((c) => c.utterance)).toEqual(["make the api tier sturdier", "make the api tier sturdier"]);
});

test("degraded: 2 consecutive 503s show the banner, and the fast path keeps working", async ({ page }) => {
  const calls = await mockAi(page, (route) =>
    respond(route, { error: { code: "LLM_UNAVAILABLE", message: "Couldn't reach the AI." } }, 503),
  );
  await openThreeTier(page);
  await say(page, "add a search cluster");
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't reach the AI." })).toBeVisible();
  await expect(page.getByTestId("degraded-banner")).toHaveCount(0);

  await say(page, "add a search cluster");
  await expect(page.getByTestId("degraded-banner")).toContainText("AI is unavailable");

  await say(page, "kill redis");
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-status", "down");

  await say(page, "add a search cluster");
  await expect(page.getByText("I need the AI for that one.")).toBeVisible();
  expect(calls).toHaveLength(2);
});
