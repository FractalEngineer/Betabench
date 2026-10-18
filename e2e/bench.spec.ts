import { test, expect } from "@playwright/test";
test("simulator, profile editing, run, history, calibration and exports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("");
  await expect(page.getByRole("heading", { name: "Test bench" })).toBeVisible();
  await page.getByRole("button", { name: "Try simulator" }).click();
  await expect(
    page.getByText("Virtual CLRACINGF4", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Throttle profile", exact: true })
    .click();
  await page
    .getByRole("option", { name: "0 → 100 → 0 sweep", exact: true })
    .click();
  await page.getByLabel("Point 2 time").fill("0.5");
  await page.getByLabel("Point 3 time").fill("1");
  await page
    .getByRole("combobox", { name: "Throttle profile", exact: true })
    .fill("Smoke sweep");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("Bench is secured and ready.").check();
  await page.getByRole("button", { name: /Run profile/ }).click();
  await expect(page.getByText("Profile complete", { exact: true })).toBeVisible(
    { timeout: 15000 },
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  await page.getByRole("button", { name: "Run history" }).click();
  await expect(page.getByText("complete", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: /Overlay/ }).check();
  await expect(page.getByText("Run comparison")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Run history" }).click();
  await expect(page.getByText("complete", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Try simulator" }).click();
  await page.getByRole("button", { name: "Load cell", exact: true }).click();
  await page.getByRole("button", { name: "Tare", exact: true }).click();
  await expect(
    page.getByText("Tare complete — calibration is unsaved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Calibrate", exact: true }).click();
  await expect(
    page.getByText("Calibration complete — save to retain it", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Calibration saved and verified", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("stop countdown and a hidden page cannot resume a run", async ({
  page,
}) => {
  await page.goto("");
  await page.getByRole("button", { name: "Try simulator" }).click();
  await page.getByLabel("Bench is secured and ready.").check();
  await page.getByRole("button", { name: /Run profile/ }).click();
  await page
    .getByRole("button", { name: "STOP ALL MOTORS", exact: true })
    .first()
    .click();
  await expect(page.getByText("Emergency stop", { exact: true })).toBeVisible();
  await page.waitForTimeout(3500);
  await expect(
    page.getByText("● RECORDING", { exact: true }),
  ).not.toBeVisible();
});
