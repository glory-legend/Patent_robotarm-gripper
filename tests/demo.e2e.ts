import { test, expect, type Page } from "@playwright/test";
import { HEADS, REVISION_STAGES } from "../src/revision-config";
import { DURATION, PRESETS } from "../src/timeline";

async function ready(page: Page) {
  await page.goto("/?revision=integrated");
  await expect(page.locator("#play")).toBeEnabled({ timeout: 60000 });
}

test("a missing wrist asset shows an error and can be retried", async ({
  page,
}) => {
  await page.route("**/fr3/link6.dae", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#loading-title")).toHaveText(
    "3D 화면을 표시할 수 없습니다",
    { timeout: 15000 },
  );
  await expect(page.locator("#retry")).toBeVisible();
  await expect(page.locator("#play")).toBeDisabled();
  await page.unroute("**/fr3/link6.dae");
  await page.locator("#retry").click();
  await expect(page.locator("#play")).toBeEnabled({ timeout: 60000 });
  await expect(page.locator("#loading")).toBeHidden();
});

test("playback reaches 70 seconds and remains stopped", async ({ page }) => {
  await ready(page);
  await page.locator("#timeline").fill("68");
  await page.locator("#speed").selectOption("2");
  await page.locator("#play").click();
  await expect(page.locator("#current-time")).toHaveText("70.0", {
    timeout: 15000,
  });
  await expect(page.locator("#play")).toHaveAttribute("aria-label", "재생");
  await expect(page.locator("#app-status")).toHaveText("동작 완료");
  await page.waitForTimeout(300);
  await expect(page.locator("#timeline")).toHaveValue("70");
});

test("all bolt sizes and head types can traverse the complete cycle without errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  for (const spec of PRESETS) {
    await page.locator("#bolt").selectOption(spec.id);
    for (const head of HEADS) {
      await page.locator("#head").selectOption(head.id);
      await page.evaluate(
        async ({ times, spec, head }) => {
          const timeline = document.getElementById(
            "timeline",
          ) as HTMLInputElement;
          for (const time of times) {
            timeline.value = String(time);
            timeline.dispatchEvent(new Event("input", { bubbles: true }));
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve()),
            );
            const play = document.getElementById("play") as HTMLButtonElement;
            const loading = document.getElementById("loading")!;
            const shown = document.getElementById("current-time")!.textContent;
            if (play.disabled || !loading.hidden || shown !== time.toFixed(1))
              throw new Error(
                `${spec}/${head} @ ${time}: ${document.getElementById("loading-text")!.textContent}; play disabled=${play.disabled}; displayed time=${shown}`,
              );
          }
        },
        {
          times: [...REVISION_STAGES.map((stage) => stage.start), DURATION],
          spec: spec.id,
          head: head.id,
        },
      );
      await expect(page.locator("#current-time")).toHaveText("70.0");
      await expect(page.locator("#app-status")).toHaveText("동작 완료");
    }
  }
  expect(errors).toEqual([]);
});

test("a cached page keeps its canvas alive and responds after resizing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  await page.locator("#play").click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  await expect(page.locator("#play")).toHaveAttribute("aria-label", "재생");
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect
    .poll(() =>
      page.locator("#viewport canvas").evaluate((canvas) => {
        const element = canvas as HTMLCanvasElement;
        const expectedWidth =
          document.getElementById("viewport")!.clientWidth *
          Math.min(devicePixelRatio, 1.75);
        return Math.abs(element.width - expectedWidth) < 2;
      }),
    )
    .toBe(true);
  await page.getByRole("button", { name: "측면", exact: true }).click();
  await page.locator("#timeline").fill("20");
  await page.locator("#play").click();
  await expect
    .poll(() => page.locator("#timeline").inputValue().then(Number))
    .toBeGreaterThan(20);
  await page.locator("#play").click();
  await expect(page.locator('[data-view="side"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(errors).toEqual([]);
});

test("the bin close-up follows pickup from a bolt pile through preliminary threading", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?revision=integrated");
  await expect(page.locator("#play")).toBeEnabled();
  await page.locator('[data-view="pickup"]').click();
  await expect(page.locator('[data-view="pickup"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#phase-title")).toHaveText(
    "무더기 상단 볼트 접근",
  );
  const before = await page.locator("canvas").screenshot();
  await page.locator("#timeline").fill("8");
  expect((await page.locator("canvas").screenshot()).equals(before)).toBe(
    false,
  );
  for (const time of [14, 22, 36, 60, 63, 70]) {
    await page.locator("#timeline").fill(String(time));
    await expect(page.locator("#play")).toBeEnabled();
    await expect(page.locator("#loading")).toBeHidden();
  }
  expect(errors).toEqual([]);
});
