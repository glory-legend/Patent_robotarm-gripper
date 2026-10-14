import { test, expect } from "@playwright/test";

test("simulator shows only the current R11 gripper", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?design=r09");
  await expect(page.locator("#play")).toBeEnabled({ timeout: 60000 });
  await expect(page.locator(".scene-id")).toContainText("R11");
  await expect(page.locator("[data-stage]")).toHaveCount(11);
  await expect(page.locator(".variant-settings")).not.toContainText(
    /R08|R09|R10/,
  );
  await expect(page.locator('a[href*="design="]')).toHaveCount(0);
  await page.locator("#timeline").fill("50");
  await expect(page.locator("#phase-title")).toHaveText("회전하며 체결");
  expect(errors).toEqual([]);
});
