import { expect, test, type Page, type Route } from "@playwright/test";

/** Access-code dialog (docs/18 · Optional access code flow, docs/33 Step 5). The API is mocked. */

const CODE = "hh-goa-demo";

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

async function say(page: Page, text: string) {
  const bar = page.getByRole("textbox", { name: "Command" });
  await bar.fill(text);
  await bar.press("Enter");
}

function ok(route: Route) {
  const sent = route.request().postDataJSON() as { baseVersion: number };
  return route.fulfill({
    json: {
      kind: "ops",
      ops: [
        {
          type: "insertBetween",
          from: "api",
          to: "pg",
          node: { id: "kafka", kind: "queue", label: "Kafka" },
        },
      ],
      message: "Put Kafka between the API and Postgres.",
      options: [],
      focusNodeIds: [],
      baseVersion: sent.baseVersion,
      attempts: 1,
      model: "test",
      timings: { totalMs: 900, llmMs: 880 },
    },
  });
}

const required = (route: Route) =>
  route.fulfill({
    status: 401,
    json: { error: { code: "ACCESS_CODE_REQUIRED", message: "This demo needs an access code." } },
  });

const dialog = (page: Page) => page.getByRole("dialog", { name: "This demo needs an access code" });

test("a 401 asks for the code, re-sends the utterance with it, and keeps it out of the URL", async ({
  page,
}) => {
  const codes: (string | null)[] = [];
  await page.route("**/api/command", (route) => {
    const code = route.request().headers()["x-archie-code"] ?? null;
    codes.push(code);
    return code === CODE ? ok(route) : required(route);
  });
  await openThreeTier(page);

  await say(page, "put a queue between the api and the database");
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByLabel("Access code").fill(CODE);
  await dialog(page).getByRole("button", { name: "Continue" }).click();

  await expect(page.getByTestId("node-kafka")).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  expect(codes).toEqual([null, CODE]);
  expect(page.url()).not.toContain(CODE);
  expect(await page.evaluate(() => sessionStorage.getItem("archie.accessCode"))).toBe(CODE);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("a wrong code keeps the dialog open with an error; Cancel closes it", async ({ page }) => {
  await page.route("**/api/command", required);
  await openThreeTier(page);

  await say(page, "put a queue between the api and the database");
  await dialog(page).getByLabel("Access code").fill("nope");
  await dialog(page).getByRole("button", { name: "Continue" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("didn’t work");
  expect(await page.evaluate(() => sessionStorage.getItem("archie.accessCode"))).toBeNull();

  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(page)).toHaveCount(0);
});

test("too many wrong codes show a countdown", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/command", (route) =>
    ++calls === 1
      ? required(route)
      : route.fulfill({
          status: 429,
          headers: { "Retry-After": "42" },
          json: { error: { code: "RATE_LIMITED", message: "Too many requests." } },
        }),
  );
  await openThreeTier(page);

  await say(page, "put a queue between the api and the database");
  await dialog(page).getByLabel("Access code").fill("guess");
  await dialog(page).getByRole("button", { name: "Continue" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText(/Try again in (42|41|40) s/);
  await expect(dialog(page).getByRole("button", { name: "Continue" })).toBeDisabled();
});
