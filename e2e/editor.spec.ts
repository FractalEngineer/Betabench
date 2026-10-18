import { test, expect } from "@playwright/test";
test("point editor moves both axes and retains corners through JSON export", async ({
  page,
}) => {
  await page.goto("");
  await page
    .getByRole("combobox", { name: "Throttle profile", exact: true })
    .click();
  await page
    .getByRole("option", { name: "0 → 100 → 0 sweep", exact: true })
    .click();
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
  const buttons = page.locator(".profile-toolbar > button");
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
  const target = page.getByRole("combobox", {
    name: "Flight controller target",
    exact: true,
  });
  await expect(target).toHaveValue("");
  await expect(page.getByTestId("resource-cli")).toHaveCount(0);
  await target.fill("CLRACINGF4");
  await page.getByRole("option", { name: "CLRACINGF4", exact: true }).click();
  await page
    .getByLabel("HX711 clock (SCK)", { exact: true })
    .selectOption("TX4");
  await page
    .getByLabel("HX711 data (DOUT)", { exact: true })
    .selectOption("RX4");
  await expect(
    page.getByLabel("Current UART assignments", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("resource-cli")).not.toContainText("serial ");
  await expect(page.getByTestId("resource-cli")).not.toContainText("set ");
  await expect(page.getByTestId("resource-cli")).toContainText(
    "resource HX711_SCK 1 A00",
  );
  await page
    .getByLabel("HX711 clock (SCK)", { exact: true })
    .selectOption("M5");
  await expect(page.getByTestId("resource-cli")).toContainText(
    "resource LED_STRIP 1 NONE",
  );
  await page
    .getByLabel("HX711 clock (SCK)", { exact: true })
    .selectOption("BEEPER");
  await page
    .getByLabel("HX711 data (DOUT)", { exact: true })
    .selectOption("PINIO1");
  await expect(page.getByTestId("resource-cli")).toContainText(
    "resource BEEPER 1 NONE",
  );
  await expect(page.getByTestId("resource-cli")).toContainText(
    "resource PINIO 1 NONE",
  );
  await page
    .getByLabel("HX711 clock (SCK)", { exact: true })
    .selectOption("gpio");
  await expect(page.getByTestId("resource-cli")).toHaveCount(0);
  await page.getByLabel("Clock GPIO", { exact: true }).fill("PA0");
  await expect(page.getByTestId("resource-cli")).toContainText(
    "resource SERIAL_TX 4 NONE",
  );
  await expect(page.getByTestId("resource-cli")).toContainText(
    "resource HX711_SCK 1 A00",
  );
  await page.getByLabel("Clock GPIO", { exact: true }).fill("A99");
  await expect(page.getByRole("alert")).toContainText("Enter GPIO");
  await target.fill("custom");
  await page
    .getByRole("option", {
      name: "Custom / current resource dump",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Resource configuration")
    .fill(
      "resource MOTOR 3 B08\nresource LED_STRIP 1 B08\nresource SERIAL_RX 2 A03\nset rx_uart = UART2\nset msp_1_uart = VCP",
    );
  await page.getByLabel("Clock GPIO").fill("B08");
  await page.getByLabel("Data GPIO").fill("A03");
  await expect(page.getByTestId("resource-cli")).toContainText(
    "resource SERIAL_RX 2 NONE",
  );
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
