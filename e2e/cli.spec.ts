import { test, expect } from "@playwright/test";

test("the live plot runs, resets on a run and holds until resumed", async ({
  page,
}) => {
  await page.goto("");
  await page.getByRole("button", { name: "Try simulator" }).click();
  await expect(page.locator(".chart-state")).toHaveText("LIVE");
  await expect(page.locator(".chart")).toBeVisible();
  await expect(page.locator(".chart path.recharts-curve")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Stop the plot" }).click();
  await expect(page.locator(".chart-state")).toHaveText("HOLD");
  await page.getByRole("button", { name: "Run the plot" }).click();
  await expect(page.locator(".chart-state")).toHaveText("LIVE");
  await page
    .getByRole("combobox", { name: "Throttle profile", exact: true })
    .click();
  await page
    .getByRole("option", { name: "0 → 100 → 0 sweep", exact: true })
    .click();
  await page.getByLabel("Point 2 time").fill("0.6");
  await page.getByLabel("Point 3 time").fill("1.2");
  await page.getByLabel("Bench is secured and ready.").check();
  await page.getByRole("button", { name: /Run profile/ }).click();
  await expect(page.locator(".chart-state")).toHaveText("REC");
  await expect(page.getByText("Profile complete", { exact: true })).toBeVisible(
    { timeout: 15000 },
  );
  await expect(page.locator(".chart-state")).toHaveText("HOLD");
  await page.getByRole("button", { name: "Run the plot" }).click();
  await expect(page.locator(".chart-state")).toHaveText("LIVE");
});

test("manual sliders, the CLI tab and writing resources to the FC", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("");
  await page.getByRole("button", { name: "Try simulator" }).click();
  const slider = page.getByLabel("Motor 1 throttle");
  await expect(slider).toBeDisabled();
  await page.getByLabel("Bench is secured and ready.").check();
  await expect(slider).toBeEnabled();
  await slider.fill("40");
  await expect(page.locator(".motor-slider output").first()).toHaveText("40%");
  await expect(
    page.getByText("Manual M1 at 40%", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".stat", { hasText: "Throttle" }).locator(".stat-value"),
  ).toContainText("40");
  // Rapid changes stay responsive: the slider is never locked while writing.
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await expect(page.locator(".motor-slider output").first()).toHaveText("42%");
  await page.getByLabel("Bench is secured and ready.").uncheck();
  await expect(page.locator(".motor-slider output").first()).toHaveText("0%");
  await page.getByRole("button", { name: "CLI", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Command console" }),
  ).toBeVisible();
  const output = page.getByLabel("CLI output");
  await expect(page.getByLabel("CLI command")).toBeDisabled();
  await page.getByRole("button", { name: "Open CLI" }).click();
  await expect(page.getByLabel("CLI command")).toBeEnabled();
  await expect(output).toContainText("Entering CLI Mode");
  await expect(
    page.getByText("Flight controller CLI is open.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("CLI command").fill("version");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(output).toContainText("version");
  await expect(output).toContainText("# Betaflight");
  await page.getByRole("button", { name: "status", exact: true }).click();
  await expect(output).toContainText("4 motors");
  await page.getByRole("button", { name: "Close CLI" }).click();
  await expect(output).toContainText("leaving CLI mode");
  await expect(page.getByRole("button", { name: "Open CLI" })).toBeVisible();
  await page.getByRole("button", { name: "Load cell", exact: true }).click();
  // Detect reads the live resource map, including any existing HX711 pins.
  await page.getByRole("button", { name: "Detect", exact: true }).click();
  await expect(page.getByText(/HX711 already assigned/)).toBeVisible();
  await expect(page.getByTestId("resource-cli")).toContainText(
    "resource HX711_SCK 1 A00",
  );
  const target = page.getByRole("combobox", {
    name: "Flight controller target",
    exact: true,
  });
  await target.fill("CLRACINGF4");
  await page.getByRole("option", { name: "CLRACINGF4", exact: true }).click();
  await page.getByRole("button", { name: "Write to FC" }).click();
  await expect(page.getByText(/Written and saved/)).toBeVisible();
  await page.getByRole("button", { name: "CLI", exact: true }).click();
  await page.getByRole("button", { name: "Reboot FC" }).click();
  await expect(
    page.getByText("Connect a flight controller to open its CLI.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
