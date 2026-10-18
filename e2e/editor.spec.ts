import { test, expect } from "@playwright/test";
test("point editor moves both axes and retains corners through JSON export", async ({
  page,
}) => {
  await page.goto("");
  await page
    .getByLabel("Choose preset or saved profile")
    .selectOption("triangle");
  const handle = page.getByRole("button", {
    name: "Curve point 2",
    exact: true,
  });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 - 75,
    box.y + box.height / 2 + 45,
    { steps: 8 },
  );
  await page.mouse.up();
  expect(
    Number(await page.getByLabel("Point 2 time").inputValue()),
  ).toBeLessThan(6);
  expect(
    Number(await page.getByLabel("Point 2 throttle").inputValue()),
  ).toBeLessThan(100);
  await page.getByLabel("Point 2 time").fill("0");
  await page.getByLabel("Point 2 throttle").fill("70");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export profile", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  const buttons = page.locator(".profile-toolbar button");
  await expect(buttons.nth(2)).toHaveAttribute("aria-label", "Export profile");
  await expect(buttons.nth(3)).toHaveAttribute(
    "aria-label",
    "Import profile or run",
  );
});
test("metric toggles, units, target/pad selection and custom CLI", async ({
  page,
}) => {
  await page.goto("");
  for (const metric of ["Current", "Voltage", "Power", "Thrust"])
    await expect(
      page.getByLabel(`Show ${metric}`, { exact: true }),
    ).toBeChecked();
  await page.getByLabel("Show Voltage", { exact: true }).uncheck();
  await expect(page.getByLabel("Show Current", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Load cell", exact: true }).click();
  await page.getByLabel("Load cell units").selectOption("N");
  await expect(page.getByLabel("Known calibration load")).toHaveValue(
    "0.980665",
  );
  await expect(page.getByTestId("resource-cli")).toContainText(
    "resource HX711_SCK 1 A00",
  );
  await page
    .getByLabel("HX711 clock (SCK)", { exact: true })
    .selectOption("M5");
  await expect(page.getByTestId("resource-cli")).toContainText(
    "resource LED_STRIP 1 NONE",
  );
  await page.getByLabel("Flight controller target").selectOption("custom");
  await page
    .getByLabel("Current resource assignments")
    .fill(
      "resource MOTOR 3 B08\nresource LED_STRIP 1 B08\nresource SERIAL_RX 2 A03",
    );
  await page.getByLabel("Clock GPIO").fill("B08");
  await page.getByLabel("Data GPIO").fill("A03");
  await expect(page.getByTestId("resource-cli")).toContainText("serial 1 0");
  await expect(page.getByTestId("resource-cli")).toContainText(
    "resource HX711_SCK 1 B08",
  );
  await page.getByLabel("Data GPIO").fill("B08");
  await expect(page.getByRole("alert")).toContainText(
    "Choose different GPIO pads",
  );
  await page.reload();
  await page.getByRole("button", { name: "Load cell", exact: true }).click();
  await expect(page.getByLabel("Load cell units")).toHaveValue("N");
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-theme",
    "light",
  );
});
