import { test, expect } from "@playwright/test";
import { REVISIONS, REVISION_STAGES } from "../src/revision-config";

test("all seven redesigns preserve the selected cycle position", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#play")).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('[data-revision="integrated"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("[data-revision]")).toHaveCount(7);
  await expect(page.locator("[data-stage]")).toHaveCount(
    REVISION_STAGES.length,
  );
  await page.locator("#timeline").fill("18");
  for (const revision of REVISIONS) {
    await page.locator(`[data-revision="${revision.id}"]`).click();
    await expect(page.locator(`#model-title`)).toHaveText(revision.title);
    await expect(
      page.locator(`[data-revision="${revision.id}"]`),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#current-time")).toHaveText("18.0");
    await expect(page.locator("#play")).toHaveAttribute("aria-label", "재생");
    await expect(page).toHaveURL(new RegExp(`revision=${revision.id}`));
  }
  await expect(page.locator("body")).not.toContainText(
    /R0[5-9]|R10|R11|미확정|미검증|측정 토크/,
  );
  expect(errors).toEqual([]);
});

test("deep links restore the revision and valid head, while invalid options fall back", async ({
  page,
}) => {
  await page.goto("/?revision=drive&head=phillips&view=reference");
  await expect(page.locator("#play")).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('[data-revision="drive"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#head")).toHaveValue("phillips");
  await page.reload();
  await expect(page.locator("#play")).toBeEnabled({ timeout: 60000 });
  await expect(page.locator("#head")).toHaveValue("phillips");
  await expect(page).toHaveURL(/view=reference/);
  await page.locator("#timeline").fill("40");
  await page.locator('[data-revision="head"]').click();
  await expect(page.locator("#head")).toBeDisabled();
  await expect(page.locator("#head")).toHaveValue("hex");
  await expect(page.locator("#head-note")).toContainText("육각 헤드용");
  await expect(page.locator("#current-time")).toHaveText("40.0");
  await expect(page).toHaveURL(/head=hex/);
  await page.goto("/?revision=unknown&head=unknown");
  await expect(page.locator('[data-revision="integrated"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#head")).toHaveValue("hex");
});

test("inspection pauses playback; play and reset restore the assembly", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#play")).toBeEnabled({ timeout: 60000 });
  await page.locator("#play").click();
  await expect(page.locator("#play")).toHaveAttribute("aria-label", "일시정지");
  await page.locator('[data-inspection="section"]').click();
  await expect(page.locator("#play")).toHaveAttribute("aria-label", "재생");
  await expect(page.locator("#inspection-label")).toHaveText("단면 위치");
  await page.locator("#inspection-amount").fill("0.7");
  await expect(page.locator("#inspection-value")).toHaveText("70%");
  const frozen = await page.locator("#current-time").textContent();
  await page.waitForTimeout(250);
  await expect(page.locator("#current-time")).toHaveText(frozen!);
  await page.locator('[data-inspection="exploded"]').click();
  await expect(page.locator("#inspection-label")).toHaveText("분해 거리");
  await page.locator("#inspection-amount").fill("0.8");
  await page.locator("#play").click();
  await expect(page.locator('[data-inspection="assembled"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#inspection-range")).toBeHidden();
  await page.locator('[data-inspection="exploded"]').click();
  await page.locator("#reset").click();
  await expect(page.locator("#current-time")).toHaveText("0.0");
  await expect(page.locator('[data-inspection="assembled"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("bolt and head changes reset the cycle, and each stage can be selected", async ({
  page,
}) => {
  await page.goto("/?revision=integrated");
  await expect(page.locator("#play")).toBeEnabled({ timeout: 60000 });
  await page.locator("#timeline").fill("30");
  await page.locator("#head").selectOption("slotted");
  await expect(page.locator("#current-time")).toHaveText("0.0");
  await expect(page).toHaveURL(/head=slotted/);
  await page.locator("#timeline").fill("30");
  await page.locator("#bolt").selectOption("m10");
  await expect(page.locator("#current-time")).toHaveText("0.0");
  for (let index = 0; index < REVISION_STAGES.length; index++) {
    await page.locator(`[data-stage="${index}"]`).click();
    await expect(page.locator("#phase-title")).toHaveText(
      REVISION_STAGES[index].name,
    );
  }
  await expect(page.locator("#next")).toBeDisabled();
  await page.locator("#reset").click();
  await expect(page.locator("#prev")).toBeDisabled();
});
