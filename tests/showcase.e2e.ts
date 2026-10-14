import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the existing showcase URL opens the current comparison with accessible controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/r11.html?revision=compliance");
  await expect(page.locator("#play")).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('[data-revision="compliance"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("link", { name: "유사 특허 ↗", exact: true }),
  ).toHaveAttribute("href", "./patents.html");
  await expect(
    page.getByRole("link", { name: "설계 설명", exact: true }),
  ).toHaveAttribute("href", "#explanation");
  await page.locator("summary").click();
  await expect(page.locator("#revision-sources a").first()).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test("keyboard controls and reduced motion retain manual navigation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#play")).toBeEnabled({ timeout: 60000 });
  await expect(page.locator("#current-time")).toHaveText("0.0");
  await page.locator('[data-revision="retention"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-revision="retention"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator('[data-inspection="section"]').focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#inspection-range")).toBeVisible();
  await page.locator("#inspection-amount").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#inspection-amount")).toHaveValue("0.51");
  await page.locator("#timeline").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#current-time")).toHaveText("0.1");
  await page.getByRole("button", { name: "시점 왼쪽으로 회전" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "확대", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#current-time")).toHaveText("0.1");
});

test("mobile stacks the model and settings without horizontal page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?revision=integrated");
  await expect(page.locator("#play")).toBeEnabled({ timeout: 60000 });
  await page.locator('[data-inspection="exploded"]').click();
  await page.locator("#inspection-amount").fill("0.8");
  await expect(page.locator("#inspection-value")).toHaveText("80%");
  await page.locator('[data-revision="drive"]').click();
  await page.locator("#head").selectOption("phillips");
  await expect(page.locator("#head")).toHaveValue("phillips");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    })),
  ).toEqual([]);
});

test("related patents link to source documents", async ({ page }) => {
  await page.goto("/patents.html");
  await expect(page.locator("article")).toHaveCount(3);
  for (const id of ["KR102370259B1", "US8939487B2", "US11420299B2"])
    await expect(
      page.locator(`article:has-text("${id}") h2 a`),
    ).toHaveAttribute("href", new RegExp(id));
});

test("WebGL failure keeps explanations available and offers a working retry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let blocked = true;
    const original = HTMLCanvasElement.prototype.getContext;
    window.addEventListener("enable-webgl", () => {
      blocked = false;
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: function (id: string, ...args: unknown[]) {
        if (blocked && id.includes("webgl")) return null;
        return Reflect.apply(original, this, [id, ...args]);
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("#loading-title")).toHaveText(
    "3D 화면을 표시할 수 없습니다",
  );
  await expect(page.locator("#retry")).toBeVisible();
  await expect(page.locator("#play")).toBeDisabled();
  await page.locator('[data-revision="gravity"]').click();
  await expect(page.locator("#detail-title")).toContainText("중력");
  await page.evaluate(() => window.dispatchEvent(new Event("enable-webgl")));
  await page.locator("#retry").click();
  await expect(page.locator("#play")).toBeEnabled({ timeout: 60000 });
  await expect(page.locator("#loading")).toBeHidden();
});
