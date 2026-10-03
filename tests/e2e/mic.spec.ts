import { expect, test, type Page } from "@playwright/test";

/**
 * Mic fallback (FR-062, docs/33 Step 4). A fake webkitSpeechRecognition replays a script of
 * interim/final results or an error, so no audio or browser speech engine is involved.
 */

type Script = { interim: string[]; final: string } | { error: string };

async function installFakeSpeech(page: Page, script: Script) {
  await page.addInitScript((s: Script) => {
    type Alt = { transcript: string };
    const result = (text: string, isFinal: boolean) =>
      Object.assign([{ transcript: text } as Alt], { isFinal });
    class FakeRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      private timers: number[] = [];
      start() {
        (window as unknown as { __speechStarts: number }).__speechStarts =
          ((window as unknown as { __speechStarts?: number }).__speechStarts ?? 0) + 1;
        if ("error" in s) {
          this.timers.push(
            window.setTimeout(() => {
              this.onerror?.({ error: s.error });
              this.onend?.();
            }, 50),
          );
          return;
        }
        s.interim.forEach((text, i) =>
          this.timers.push(
            window.setTimeout(
              () => this.onresult?.({ resultIndex: 0, results: [result(text, false)] }),
              80 * (i + 1),
            ),
          ),
        );
        this.timers.push(
          window.setTimeout(
            () => {
              this.onresult?.({ resultIndex: 0, results: [result(s.final, true)] });
              this.onend?.();
            },
            80 * (s.interim.length + 1) + 300,
          ),
        );
      }
      stop() {
        this.abort();
      }
      abort() {
        this.timers.forEach((t) => clearTimeout(t));
        this.onend?.();
      }
    }
    // Recent Chromium ships the unprefixed API too, and the app prefers it: replace both.
    Object.assign(window, {
      SpeechRecognition: FakeRecognition,
      webkitSpeechRecognition: FakeRecognition,
    });
  }, script);
}

async function openThreeTier(page: Page) {
  await page.goto("/b/new?template=three-tier");
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
}

const mic = (page: Page) => page.getByRole("button", { name: /Dictate with the browser/ });
const bar = (page: Page) => page.getByRole("textbox", { name: "Command" });

test("interim text streams into the bar and the final result runs the command", async ({
  page,
}) => {
  await installFakeSpeech(page, { interim: ["kill", "kill red"], final: "kill redis" });
  await openThreeTier(page);

  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  await mic(page).click();
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");
  await expect(bar(page)).toHaveValue("kill red");
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-status", "down");
  await expect(page.getByTestId("latency-badge")).toContainText("local ·");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  await expect(bar(page)).toHaveValue("");
});

test("Escape stops listening without running anything", async ({ page }) => {
  await installFakeSpeech(page, { interim: ["kill", "kill red"], final: "kill redis" });
  await openThreeTier(page);
  await mic(page).click();
  await expect(bar(page)).toHaveValue("kill red");
  await page.keyboard.press("Escape");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(600);
  await expect(page.getByTestId("node-redis")).toHaveAttribute("data-status", "up");
});

test("a blocked microphone explains itself and names Wispr Flow", async ({ page }) => {
  await installFakeSpeech(page, { error: "not-allowed" });
  await openThreeTier(page);
  await mic(page).click();
  const toast = page.getByRole("alert").filter({ hasText: "Microphone access is blocked" });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Wispr Flow");
  await expect(mic(page)).toHaveAttribute("aria-pressed", "false");
});

test("no Web Speech API: no mic button", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { SpeechRecognition: undefined, webkitSpeechRecognition: undefined });
  });
  await openThreeTier(page);
  await expect(bar(page)).toBeVisible();
  await expect(mic(page)).toHaveCount(0);
});
