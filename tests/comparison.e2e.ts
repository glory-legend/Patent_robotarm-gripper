import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("comparison controls change both models and preserve the shared head in navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/comparison.html");
  await expect(page.locator("#head")).toBeEnabled();
  await expect(page.locator("canvas")).toHaveCount(2);
  const firstCanvas = page.locator("#compact-viewport canvas");
  const before = await firstCanvas.screenshot();
  await page.getByRole("button", { name: "단면", exact: true }).click();
  await expect(page.locator("#inspection-range")).toBeVisible();
  for (const id of ["compact", "integrated"])
    await expect(page.locator(`#${id}-viewport`)).toHaveAttribute(
      "data-inspection",
      "section",
    );
  expect((await firstCanvas.screenshot()).equals(before)).toBe(false);
  await page.locator("#inspection-amount").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#inspection-value")).toHaveText("51%");
  await page.getByRole("button", { name: "분해", exact: true }).click();
  await page.locator("#head").selectOption("phillips");
  for (const id of ["compact", "integrated"])
    await expect(page.locator(`#${id}-viewport`)).toHaveAttribute(
      "data-head",
      "phillips",
    );
  await expect(page.locator("#animation-link")).toHaveAttribute(
    "href",
    /revision=integrated&head=phillips/,
  );
  await expect(page).toHaveURL(/head=phillips/);
  await page.getByRole("button", { name: "시점 왼쪽으로 회전" }).focus();
  await page.keyboard.press("Enter");
  const scaleBefore = await page
    .locator(".scale-mark span")
    .first()
    .evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("button", { name: "확대", exact: true }).click();
  const widths = await page
    .locator(".scale-mark span")
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width),
    );
  expect(widths[0]).toBeGreaterThan(scaleBefore);
  expect(widths[0]).toBeCloseTo(widths[1], 2);
  expect(errors).toEqual([]);
});

test("comparison stacks on mobile and retains accessible native controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/comparison.html?head=slotted");
  await expect(page.locator("#head")).toBeEnabled();
  await expect(page.locator("#head")).toHaveValue("slotted");
  const compact = await page.locator("#compact-viewport").boundingBox();
  const integrated = await page.locator("#integrated-viewport").boundingBox();
  expect(integrated!.y).toBeGreaterThan(compact!.y + compact!.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#head").focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.locator("#head")).toHaveValue("phillips");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
});

test("WebGL failure keeps the comparison table available and retry recovers both views", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let blocked = true;
    const original = HTMLCanvasElement.prototype.getContext;
    window.addEventListener("enable-webgl", () => {
      blocked = false;
    });
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (blocked && String(args[0]).includes("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto("/comparison.html");
  await expect(page.locator("#retry")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.locator("#head")).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event("enable-webgl")));
  await page.locator("#retry").click();
  await expect(page.locator("#head")).toBeEnabled();
  await expect(page.locator("canvas")).toHaveCount(2);
  await expect(page.locator("#loading")).toBeHidden();
});
