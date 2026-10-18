import { test, expect } from "@playwright/test";
async function start(page: import("@playwright/test").Page) {
  await page.goto("");
  await page.getByRole("button", { name: "Try simulator" }).click();
  await page.getByLabel("Bench is secured and ready.").check();
  await page.getByRole("button", { name: /Run profile/ }).click();
  await expect(page.getByText("● RECORDING", { exact: true })).toBeVisible();
}
test("hiding the page aborts an active run", async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("Page hidden", { exact: true })).toBeVisible();
  await expect(
    page.getByText("● RECORDING", { exact: true }),
  ).not.toBeVisible();
});
test("late main-thread delivery aborts rather than replaying motor commands", async ({
  page,
}) => {
  await start(page);
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const start = performance.now();
    while (performance.now() - start < 350) {
      /* simulate blocked main thread */
    }
  });
  await expect(
    page.getByText("Motor command delivery delayed more than 250 ms", {
      exact: true,
    }),
  ).toBeVisible();
});
test("timeline drag edits throttle and mobile fits within the viewport", async ({
  page,
}) => {
  await page.goto("");
  const p = await page.locator(".profile-svg .handle").first().boundingBox();
  await page.mouse.move(p!.x + p!.width / 2, p!.y + p!.height / 2);
  await page.mouse.down();
  await page.mouse.move(p!.x + p!.width / 2, p!.y - 45, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByLabel("Point 1 throttle")).not.toHaveValue("3.5");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
test("storage failure stops outputs and leaves an exportable in-memory run", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
  });
  await expect(page.getByText(/Result storage failed/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "JSON", exact: true }),
  ).toBeEnabled();
});
